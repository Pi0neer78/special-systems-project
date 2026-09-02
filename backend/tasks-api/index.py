import json
import os
import hashlib
import hmac
import time
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
ADMIN_LOGIN = 'Pioneer78'
SECRET_KEY = 'specsystems_admin_secret_2026'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
}

STATUSES = ['new', 'in_progress', 'done', 'cancelled']
COLORS = ['blue', 'green', 'yellow', 'red', 'purple', 'gray']
REPEAT_RULES = ['none', 'daily', 'weekly', 'monthly', 'yearly']


def ok(data):
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(data, default=str, ensure_ascii=False)}


def err(msg, code=400):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def decode_token(token: str, conn) -> dict:
    """Декодирует токен, возвращает {'role': ..., 'user_id': ..., 'login': ...} или None."""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT id, login FROM {SCHEMA}.admin_users WHERE is_active = TRUE")
    rows = [{'user_id': r['id'], 'login': r['login'], 'role': 'user'} for r in cur.fetchall()]
    cur.close()
    rows.append({'user_id': 0, 'login': ADMIN_LOGIN, 'role': 'admin'})

    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        for c in rows:
            payload = f"{c['login']}:{c['role']}:{c['user_id']}:{ts}:{SECRET_KEY}"
            expected = hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
            if hmac.compare_digest(token or '', expected):
                return c
    return None


def task_row_to_dict(r, watchers):
    d = dict(r)
    d['watchers'] = watchers
    return d


def fetch_watchers(cur, task_ids):
    """Возвращает dict: task_id -> [ {id, full_name, login} ]"""
    if not task_ids:
        return {}
    cur.execute(f"""
        SELECT tw.task_id, au.id, au.full_name, au.login
        FROM {SCHEMA}.task_watchers tw
        JOIN {SCHEMA}.admin_users au ON au.id = tw.user_id
        WHERE tw.task_id = ANY(%s)
    """, (task_ids,))
    result: dict = {}
    for row in cur.fetchall():
        result.setdefault(row['task_id'], []).append({'id': row['id'], 'full_name': row['full_name'], 'login': row['login']})
    return result


def has_task_access(cur, task_id, caller) -> bool:
    """Проверяет, имеет ли пользователь (не админ) доступ к задаче: автор, исполнитель или наблюдатель."""
    if caller['role'] == 'admin':
        return True
    cur.execute(f"""
        SELECT 1 FROM {SCHEMA}.tasks
        WHERE id = %s AND (author_id = %s OR assignee_id = %s)
        UNION
        SELECT 1 FROM {SCHEMA}.task_watchers WHERE task_id = %s AND user_id = %s
    """, (task_id, caller['user_id'], caller['user_id'], task_id, caller['user_id']))
    return cur.fetchone() is not None


def user_public(uid, users_by_id):
    if not uid:
        return None
    u = users_by_id.get(uid)
    if not u:
        return None
    return {'id': u['id'], 'full_name': u['full_name'], 'login': u['login']}


TASK_SELECT = f"""
    SELECT t.id, t.title, t.description, t.status, t.color,
           t.due_date, t.due_time, t.all_day, t.repeat_rule, t.repeat_until,
           t.author_id, t.assignee_id, t.created_at, t.updated_at,
           au_a.full_name AS author_name, au_a.login AS author_login,
           au_s.full_name AS assignee_name, au_s.login AS assignee_login
    FROM {SCHEMA}.tasks t
    LEFT JOIN {SCHEMA}.admin_users au_a ON au_a.id = t.author_id
    LEFT JOIN {SCHEMA}.admin_users au_s ON au_s.id = t.assignee_id
"""


def handler(event: dict, context) -> dict:
    """API задач: список, фильтрация, сортировка, CRUD, наблюдатели.
    resource=tasks|task-meta
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    token = (event.get('headers') or {}).get('X-Admin-Token', '')
    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    resource = qs.get('resource', '')
    rid = qs.get('id', '')
    body = {}
    if method in ('POST', 'PUT', 'PATCH'):
        body = json.loads(event.get('body') or '{}')

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        caller = decode_token(token, conn)
        if not caller:
            return err('Unauthorized', 401)

        # ── TASK META (список пользователей для селекторов) ──────────────────
        if resource == 'task-meta':
            if method == 'GET':
                cur.execute(f"SELECT id, login, full_name FROM {SCHEMA}.admin_users WHERE is_active=TRUE ORDER BY (id=0) DESC, full_name")
                users = [dict(r) for r in cur.fetchall()]
                return ok({'users': users, 'statuses': STATUSES, 'colors': COLORS, 'repeat_rules': REPEAT_RULES})

        # ── TASKS ──────────────────────────────────────────────────────────────
        if resource == 'tasks':
            if not rid:
                if method == 'GET':
                    where, params = [], []
                    if caller['role'] != 'admin':
                        where.append(f"""(t.author_id = %s OR t.assignee_id = %s OR t.id IN (
                            SELECT task_id FROM {SCHEMA}.task_watchers WHERE user_id = %s
                        ))""")
                        params.extend([caller['user_id'], caller['user_id'], caller['user_id']])
                    status_f = qs.get('status', '')
                    if status_f:
                        vals = status_f.split(',')
                        where.append('t.status = ANY(%s)')
                        params.append(vals)
                    assignee_f = qs.get('assignee_id', '')
                    if assignee_f:
                        where.append('t.assignee_id = %s')
                        params.append(int(assignee_f))
                    author_f = qs.get('author_id', '')
                    if author_f:
                        where.append('t.author_id = %s')
                        params.append(int(author_f))
                    watcher_f = qs.get('watcher_id', '')
                    if watcher_f:
                        where.append(f"t.id IN (SELECT task_id FROM {SCHEMA}.task_watchers WHERE user_id = %s)")
                        params.append(int(watcher_f))
                    search_f = qs.get('search', '')
                    if search_f:
                        where.append('(t.title ILIKE %s OR t.description ILIKE %s)')
                        params.append(f'%{search_f}%')
                        params.append(f'%{search_f}%')
                    color_f = qs.get('color', '')
                    if color_f:
                        where.append('t.color = %s')
                        params.append(color_f)

                    sort = qs.get('sort', 'due_date')
                    order = qs.get('order', 'asc').upper()
                    order = 'DESC' if order == 'DESC' else 'ASC'
                    sort_map = {
                        'due_date': 't.due_date',
                        'created_at': 't.created_at',
                        'title': 't.title',
                        'status': 't.status',
                        'priority': 't.status',
                    }
                    sort_col = sort_map.get(sort, 't.due_date')

                    where_sql = f"WHERE {' AND '.join(where)}" if where else ''
                    query = f"{TASK_SELECT} {where_sql} ORDER BY {sort_col} {order} NULLS LAST, t.id DESC"
                    cur.execute(query, params)
                    rows = cur.fetchall()
                    watchers = fetch_watchers(cur, [r['id'] for r in rows])
                    return ok([task_row_to_dict(r, watchers.get(r['id'], [])) for r in rows])

                if method == 'POST':
                    author_id = body.get('author_id')
                    if author_id is None and 'author_id' not in body:
                        author_id = caller['user_id']
                    status = body.get('status', 'new')
                    color = body.get('color', 'blue')
                    repeat_rule = body.get('repeat_rule', 'none')
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.tasks
                          (title, description, status, color, due_date, due_time, all_day,
                           repeat_rule, repeat_until, author_id, assignee_id)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id
                    """, (
                        body.get('title', ''), body.get('description'),
                        status if status in STATUSES else 'new',
                        color if color in COLORS else 'blue',
                        body.get('due_date'), body.get('due_time'),
                        body.get('all_day', True),
                        repeat_rule if repeat_rule in REPEAT_RULES else 'none',
                        body.get('repeat_until'),
                        author_id, body.get('assignee_id'),
                    ))
                    new_id = cur.fetchone()['id']

                    watcher_ids = body.get('watcher_ids') or []
                    for uid in watcher_ids:
                        cur.execute(f"INSERT INTO {SCHEMA}.task_watchers (task_id, user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (new_id, uid))
                    conn.commit()

                    cur.execute(f"{TASK_SELECT} WHERE t.id = %s", [new_id])
                    row = cur.fetchone()
                    watchers = fetch_watchers(cur, [new_id])
                    return ok(task_row_to_dict(row, watchers.get(new_id, [])))
            else:
                if not has_task_access(cur, int(rid), caller):
                    return err('Forbidden', 403)

                if method == 'GET':
                    cur.execute(f"{TASK_SELECT} WHERE t.id = %s", [rid])
                    row = cur.fetchone()
                    if not row:
                        return err('Not found', 404)
                    watchers = fetch_watchers(cur, [int(rid)])
                    return ok(task_row_to_dict(row, watchers.get(int(rid), [])))

                if method == 'PUT':
                    status = body.get('status', 'new')
                    color = body.get('color', 'blue')
                    repeat_rule = body.get('repeat_rule', 'none')
                    cur.execute(f"""
                        UPDATE {SCHEMA}.tasks SET
                          title=%s, description=%s, status=%s, color=%s,
                          due_date=%s, due_time=%s, all_day=%s,
                          repeat_rule=%s, repeat_until=%s, assignee_id=%s,
                          updated_at=NOW()
                        WHERE id=%s
                        RETURNING id
                    """, (
                        body.get('title', ''), body.get('description'),
                        status if status in STATUSES else 'new',
                        color if color in COLORS else 'blue',
                        body.get('due_date'), body.get('due_time'),
                        body.get('all_day', True),
                        repeat_rule if repeat_rule in REPEAT_RULES else 'none',
                        body.get('repeat_until'),
                        body.get('assignee_id'),
                        rid,
                    ))
                    row = cur.fetchone()
                    if not row:
                        return err('Not found', 404)

                    if 'watcher_ids' in body:
                        cur.execute(f"DELETE FROM {SCHEMA}.task_watchers WHERE task_id=%s", [rid])
                        for uid in (body.get('watcher_ids') or []):
                            cur.execute(f"INSERT INTO {SCHEMA}.task_watchers (task_id, user_id) VALUES (%s,%s) ON CONFLICT DO NOTHING", (rid, uid))
                    conn.commit()

                    cur.execute(f"{TASK_SELECT} WHERE t.id = %s", [rid])
                    row = cur.fetchone()
                    watchers = fetch_watchers(cur, [int(rid)])
                    return ok(task_row_to_dict(row, watchers.get(int(rid), [])))

                if method == 'PATCH':
                    fields, vals = [], []
                    if 'status' in body and body['status'] in STATUSES:
                        fields.append('status=%s'); vals.append(body['status'])
                    if 'color' in body and body['color'] in COLORS:
                        fields.append('color=%s'); vals.append(body['color'])
                    if 'assignee_id' in body:
                        fields.append('assignee_id=%s'); vals.append(body['assignee_id'])
                    if 'due_date' in body:
                        fields.append('due_date=%s'); vals.append(body['due_date'])
                    if 'due_time' in body:
                        fields.append('due_time=%s'); vals.append(body['due_time'])
                    if 'all_day' in body:
                        fields.append('all_day=%s'); vals.append(body['all_day'])
                    if not fields:
                        return err('No fields to update')
                    fields.append('updated_at=NOW()')
                    vals.append(rid)
                    cur.execute(f"UPDATE {SCHEMA}.tasks SET {', '.join(fields)} WHERE id=%s RETURNING id", vals)
                    row = cur.fetchone()
                    conn.commit()
                    if not row:
                        return err('Not found', 404)
                    cur.execute(f"{TASK_SELECT} WHERE t.id = %s", [rid])
                    row = cur.fetchone()
                    watchers = fetch_watchers(cur, [int(rid)])
                    return ok(task_row_to_dict(row, watchers.get(int(rid), [])))

                if method == 'DELETE':
                    cur.execute(f"DELETE FROM {SCHEMA}.task_watchers WHERE task_id=%s", [rid])
                    cur.execute(f"DELETE FROM {SCHEMA}.tasks WHERE id=%s RETURNING id", [rid])
                    row = cur.fetchone()
                    conn.commit()
                    return ok({'ok': True}) if row else err('Not found', 404)

        return err('Unknown resource', 404)

    finally:
        cur.close()
        conn.close()
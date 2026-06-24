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


def ok(data):
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(data, default=str)}


def err(msg, code=400):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg})}


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


def handler(event: dict, context) -> dict:
    """API панели работы: учётные данные, обновления, история.
    resource=folders|credentials|updates|history
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

        # ── FOLDERS ─────────────────────────────────────────────────────────────
        if resource == 'folders':
            if not rid:
                if method == 'GET':
                    cur.execute(f"""
                        SELECT id, parent_id, name, sort_order
                        FROM {SCHEMA}.credential_folders
                        ORDER BY COALESCE(parent_id, 0), sort_order, name
                    """)
                    return ok([dict(r) for r in cur.fetchall()])
                if method == 'POST':
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.credential_folders (parent_id, name, sort_order)
                        VALUES (%s, %s, %s) RETURNING id, parent_id, name, sort_order
                    """, (body.get('parent_id'), body.get('name', 'Новый раздел'), body.get('sort_order', 0)))
                    conn.commit()
                    return ok(dict(cur.fetchone()))
            else:
                if method == 'PUT':
                    fields, vals = [], []
                    if 'name' in body:
                        fields.append('name=%s'); vals.append(body['name'])
                    if 'parent_id' in body:
                        fields.append('parent_id=%s'); vals.append(body['parent_id'])
                    if 'sort_order' in body:
                        fields.append('sort_order=%s'); vals.append(body['sort_order'])
                    fields.append('updated_at=NOW()')
                    vals.append(rid)
                    cur.execute(f"UPDATE {SCHEMA}.credential_folders SET {', '.join(fields)} WHERE id=%s RETURNING id, parent_id, name, sort_order", vals)
                    conn.commit()
                    row = cur.fetchone()
                    return ok(dict(row)) if row else err('Not found', 404)
                if method == 'PATCH':
                    # Перемещение (смена parent_id)
                    cur.execute(f"UPDATE {SCHEMA}.credential_folders SET parent_id=%s, updated_at=NOW() WHERE id=%s RETURNING id", [body.get('parent_id'), rid])
                    conn.commit()
                    return ok({'ok': True})

        # ── CREDENTIALS ─────────────────────────────────────────────────────────
        if resource == 'credentials':
            if not rid:
                if method == 'GET':
                    folder_id = qs.get('folder_id', '')
                    if folder_id:
                        cur.execute(f"""
                            SELECT id, folder_id, name, login, password,
                                   login1, password1, login2, password2,
                                   login3, password3, ip, notes
                            FROM {SCHEMA}.credentials WHERE folder_id=%s ORDER BY name
                        """, [folder_id])
                    else:
                        cur.execute(f"""
                            SELECT id, folder_id, name, login, password,
                                   login1, password1, login2, password2,
                                   login3, password3, ip, notes
                            FROM {SCHEMA}.credentials ORDER BY name
                        """)
                    return ok([dict(r) for r in cur.fetchall()])
                if method == 'POST':
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.credentials
                          (folder_id, name, login, password,
                           login1, password1, login2, password2,
                           login3, password3, ip, notes)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id, folder_id, name, login, password,
                                  login1, password1, login2, password2,
                                  login3, password3, ip, notes
                    """, (
                        body.get('folder_id'), body.get('name', ''),
                        body.get('login'), body.get('password'),
                        body.get('login1'), body.get('password1'),
                        body.get('login2'), body.get('password2'),
                        body.get('login3'), body.get('password3'),
                        body.get('ip'), body.get('notes')
                    ))
                    conn.commit()
                    return ok(dict(cur.fetchone()))
            else:
                if method == 'GET':
                    cur.execute(f"""
                        SELECT id, folder_id, name, login, password,
                               login1, password1, login2, password2,
                               login3, password3, ip, notes
                        FROM {SCHEMA}.credentials WHERE id=%s
                    """, [rid])
                    row = cur.fetchone()
                    return ok(dict(row)) if row else err('Not found', 404)
                if method == 'PUT':
                    cur.execute(f"""
                        UPDATE {SCHEMA}.credentials SET
                          folder_id=%s, name=%s, login=%s, password=%s,
                          login1=%s, password1=%s,
                          login2=%s, password2=%s, login3=%s, password3=%s,
                          ip=%s, notes=%s, updated_at=NOW()
                        WHERE id=%s
                        RETURNING id, folder_id, name, login, password,
                                  login1, password1, login2, password2,
                                  login3, password3, ip, notes
                    """, (
                        body.get('folder_id'), body.get('name', ''),
                        body.get('login'), body.get('password'),
                        body.get('login1'), body.get('password1'),
                        body.get('login2'), body.get('password2'),
                        body.get('login3'), body.get('password3'),
                        body.get('ip'), body.get('notes'),
                        rid
                    ))
                    conn.commit()
                    row = cur.fetchone()
                    return ok(dict(row)) if row else err('Not found', 404)

        # ── UPDATES (список клиентов с базами для раздела Обновления) ───────────
        if resource == 'updates':
            if method == 'GET':
                cur.execute(f"""
                    SELECT
                        cd.id AS client_db_id,
                        c.id AS client_id,
                        c.name AS client_name,
                        db.id AS config_db_id,
                        db.config_name,
                        cd.current_config_version,
                        db.actual_config_version,
                        cd.update_date,
                        au.full_name AS updated_by_name,
                        au.login AS updated_by_login
                    FROM {SCHEMA}.client_databases cd
                    JOIN {SCHEMA}.clients c ON c.id = cd.client_id
                    JOIN {SCHEMA}.config_databases db ON db.id = cd.config_database_id
                    LEFT JOIN {SCHEMA}.update_history uh ON uh.client_database_id = cd.id
                        AND uh.id = (
                            SELECT id FROM {SCHEMA}.update_history
                            WHERE client_database_id = cd.id
                            ORDER BY created_at DESC LIMIT 1
                        )
                    LEFT JOIN {SCHEMA}.admin_users au ON au.id = uh.updated_by_user_id
                    ORDER BY c.name, db.config_name
                """)
                return ok([dict(r) for r in cur.fetchall()])

        # ── HISTORY ─────────────────────────────────────────────────────────────
        if resource == 'history':
            client_db_id = qs.get('client_db_id', '')
            if method == 'GET' and client_db_id:
                cur.execute(f"""
                    SELECT
                        uh.id,
                        c.name AS client_name,
                        db.config_name,
                        au.full_name AS updated_by_name,
                        au.login AS updated_by_login,
                        uh.old_version,
                        uh.new_version,
                        uh.update_date,
                        uh.created_at,
                        uh.info
                    FROM {SCHEMA}.update_history uh
                    JOIN {SCHEMA}.clients c ON c.id = uh.client_id
                    JOIN {SCHEMA}.client_databases cd ON cd.id = uh.client_database_id
                    JOIN {SCHEMA}.config_databases db ON db.id = cd.config_database_id
                    LEFT JOIN {SCHEMA}.admin_users au ON au.id = uh.updated_by_user_id
                    WHERE uh.client_database_id = %s
                    ORDER BY uh.created_at DESC
                """, [client_db_id])
                return ok([dict(r) for r in cur.fetchall()])
            if method == 'POST':
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.update_history
                      (client_id, client_database_id, updated_by_user_id,
                       old_version, new_version, update_date, info)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id
                """, (
                    body.get('client_id'),
                    body.get('client_database_id'),
                    body.get('updated_by_user_id') or None,
                    body.get('old_version'),
                    body.get('new_version'),
                    body.get('update_date'),
                    body.get('info')
                ))
                new_id = cur.fetchone()['id']
                # Обновляем текущую версию и дату в client_databases
                cur.execute(f"""
                    UPDATE {SCHEMA}.client_databases
                    SET current_config_version=%s, update_date=%s
                    WHERE id=%s
                """, (body.get('new_version'), body.get('update_date'), body.get('client_database_id')))
                conn.commit()
                return ok({'id': new_id})

        # ── USERS LIST (для выбора в форме обновления) ───────────────────────────
        if resource == 'users':
            if method == 'GET':
                cur.execute(f"SELECT id, login, full_name FROM {SCHEMA}.admin_users WHERE is_active=TRUE ORDER BY full_name")
                users = [dict(r) for r in cur.fetchall()]
                users.insert(0, {'id': 0, 'login': ADMIN_LOGIN, 'full_name': 'Администратор'})
                return ok(users)

        return err('Unknown resource', 404)

    finally:
        cur.close()
        conn.close()
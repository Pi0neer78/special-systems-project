import json
import os
import hashlib
import hmac
import time
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
SECRET_KEY = 'specsystems_client_secret_2026'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Client-Token, X-Admin-Token',
}

PRIORITIES = ['low', 'medium', 'high', 'urgent']
PROBLEM_TYPES = [
    'Вопрос по 1С', 'Проблема с доступом', 'Нужно обновление',
    'Ошибка при работе', 'Нужна доработка', 'Нужна консультация',
    'Проблемы с оборудованием', 'Прочее'
]
STATUSES = ['new', 'in_progress', 'resolved', 'cancelled']


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def make_client_token(client_id: int, login: str) -> str:
    ts = str(int(time.time() // 3600))
    payload = f"client:{client_id}:{login}:{ts}:{SECRET_KEY}"
    return hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()


def verify_client_token(token: str):
    """Возвращает client_id если токен валиден, иначе None."""
    if not token:
        return None
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT id, login FROM {SCHEMA}.clients WHERE is_active = TRUE")
    clients = cur.fetchall()
    cur.close()
    conn.close()
    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        for c in clients:
            payload = f"client:{c['id']}:{c['login']}:{ts}:{SECRET_KEY}"
            expected = hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
            if hmac.compare_digest(token, expected):
                return c['id']
    return None


# ── Загрузка admin-токена (для рабочей панели) ──────────────────────────────

ADMIN_SECRET = 'specsystems_admin_secret_2026'
ADMIN_LOGIN_HARDCODED = 'Pioneer78'


def verify_admin_token(token: str):
    """Проверяет admin_token, возвращает (user_id, role) или (None, None)."""
    if not token:
        return None, None
    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT id, login FROM {SCHEMA}.admin_users WHERE is_active = TRUE")
    users = [{'user_id': r['id'], 'login': r['login']} for r in cur.fetchall()]
    cur.close()
    conn.close()
    users.append({'user_id': 0, 'login': ADMIN_LOGIN_HARDCODED})
    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        for role in ['admin', 'user']:
            for u in users:
                payload = f"{u['login']}:{role}:{u['user_id']}:{ts}:{ADMIN_SECRET}"
                expected = hmac.new(ADMIN_SECRET.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
                if hmac.compare_digest(token, expected):
                    return u['user_id'], role
    return None, None


def resp(status, body):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body, ensure_ascii=False, default=str)}


def handler(event: dict, context) -> dict:
    """API для заявок (tickets): вход клиента, CRUD заявок, управление из рабочей панели."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    headers = event.get('headers') or {}
    qs = event.get('queryStringParameters') or {}
    resource = qs.get('resource', '')

    # ── Вход клиента ────────────────────────────────────────────────────────
    if resource == 'client-login' and method == 'POST':
        body = json.loads(event.get('body') or '{}')
        login = body.get('login', '').strip()
        password = body.get('password', '')
        if not login or not password:
            return resp(400, {'error': 'Укажите логин и пароль'})
        pwd_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"SELECT id, login, name FROM {SCHEMA}.clients WHERE login=%s AND password_hash=%s AND is_active=TRUE",
            (login, pwd_hash)
        )
        client = cur.fetchone()
        cur.close()
        conn.close()
        if not client:
            return resp(401, {'error': 'Неверный логин или пароль'})
        token = make_client_token(client['id'], client['login'])
        return resp(200, {'token': token, 'client_id': client['id'], 'name': client['name']})

    # ── Проверка клиентского токена ─────────────────────────────────────────
    if resource == 'client-verify' and method == 'GET':
        token = headers.get('X-Client-Token', '')
        client_id = verify_client_token(token)
        if not client_id:
            return resp(401, {'ok': False})
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(f"SELECT id, name, login FROM {SCHEMA}.clients WHERE id=%s", (client_id,))
        c = cur.fetchone()
        cur.close()
        conn.close()
        return resp(200, {'ok': True, 'client_id': c['id'], 'name': c['name'], 'login': c['login']})

    # ── Заявки клиента (клиент видит только свои) ────────────────────────────
    if resource == 'tickets':

        # Определяем кто обращается: клиент или сотрудник
        client_token = headers.get('X-Client-Token', '')
        admin_token = headers.get('X-Admin-Token', '')
        client_id_from_token = verify_client_token(client_token) if client_token else None
        admin_user_id, admin_role = verify_admin_token(admin_token) if admin_token else (None, None)

        is_client = client_id_from_token is not None
        is_staff = admin_user_id is not None

        if not is_client and not is_staff:
            return resp(401, {'error': 'Не авторизован'})

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # GET — список заявок
        if method == 'GET':
            where_parts = []
            if is_client:
                where_parts.append(f"t.client_id = {client_id_from_token}")

            # Фильтры для сотрудников
            if is_staff:
                if qs.get('status'):
                    s = qs['status'].replace("'", "''")
                    where_parts.append(f"t.status = '{s}'")
                if qs.get('client_id'):
                    where_parts.append(f"t.client_id = {int(qs['client_id'])}")
                if qs.get('problem_type'):
                    pt = qs['problem_type'].replace("'", "''")
                    where_parts.append(f"t.problem_type = '{pt}'")

            where_sql = ('WHERE ' + ' AND '.join(where_parts)) if where_parts else ''
            cur.execute(f"""
                SELECT t.*,
                       c.name as client_name,
                       u.full_name as assignee_name, u.login as assignee_login
                FROM {SCHEMA}.tickets t
                JOIN {SCHEMA}.clients c ON c.id = t.client_id
                LEFT JOIN {SCHEMA}.admin_users u ON u.id = t.assignee_id
                {where_sql}
                ORDER BY t.submitted_at DESC
            """)
            rows = cur.fetchall()
            cur.close()
            conn.close()
            return resp(200, rows)

        # POST — создать заявку (только клиент)
        if method == 'POST':
            if not is_client:
                return resp(403, {'error': 'Только клиент может подавать заявки'})
            body = json.loads(event.get('body') or '{}')
            priority = body.get('priority', 'medium')
            problem_type = body.get('problem_type', '')
            description = body.get('description', '').strip()
            deadline = body.get('deadline') or None
            extra_info = body.get('extra_info', '').strip() or None
            if not description or not problem_type:
                return resp(400, {'error': 'Заполните обязательные поля'})
            cur.execute(f"""
                INSERT INTO {SCHEMA}.tickets
                  (client_id, priority, problem_type, description, deadline, extra_info, status, status_changed_at)
                VALUES (%s, %s, %s, %s, %s, %s, 'new', now())
                RETURNING *
            """, (client_id_from_token, priority, problem_type, description, deadline, extra_info))
            ticket = cur.fetchone()
            conn.commit()
            cur.close()
            conn.close()
            return resp(201, ticket)

        # PATCH — обновить заявку (сотрудник: статус, ответственный, результат; клиент — нет)
        if method == 'PATCH':
            ticket_id = int(qs.get('id', 0))
            if not ticket_id:
                return resp(400, {'error': 'Не указан id заявки'})
            body = json.loads(event.get('body') or '{}')

            if is_staff:
                sets = []
                params = []
                if 'status' in body and body['status'] in STATUSES:
                    sets.append("status = %s")
                    params.append(body['status'])
                    sets.append("status_changed_at = now()")
                    if body['status'] == 'resolved':
                        sets.append("resolved_at = now()")
                if 'assignee_id' in body:
                    sets.append("assignee_id = %s")
                    params.append(body['assignee_id'] or None)
                if 'result' in body:
                    sets.append("result = %s")
                    params.append(body['result'])
                if not sets:
                    return resp(400, {'error': 'Нечего обновлять'})
                sets.append("updated_at = now()")
                params.append(ticket_id)
                cur.execute(f"UPDATE {SCHEMA}.tickets SET {', '.join(sets)} WHERE id = %s RETURNING *", params)
            else:
                return resp(403, {'error': 'Недостаточно прав'})

            ticket = cur.fetchone()
            conn.commit()
            cur.close()
            conn.close()
            if not ticket:
                return resp(404, {'error': 'Заявка не найдена'})
            return resp(200, ticket)

        cur.close()
        conn.close()

    # ── Список клиентов и сотрудников (для фильтров в рабочей панели) ───────
    if resource == 'ticket-meta' and method == 'GET':
        admin_token = headers.get('X-Admin-Token', '')
        admin_user_id, _ = verify_admin_token(admin_token)
        if admin_user_id is None:
            return resp(401, {'error': 'Не авторизован'})
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(f"SELECT id, name FROM {SCHEMA}.clients WHERE is_active=TRUE ORDER BY name")
        clients = cur.fetchall()
        cur.execute(f"SELECT id, full_name, login FROM {SCHEMA}.admin_users WHERE is_active=TRUE ORDER BY full_name")
        users = cur.fetchall()
        cur.close()
        conn.close()
        return resp(200, {'clients': clients, 'users': users, 'problem_types': PROBLEM_TYPES, 'priorities': PRIORITIES})

    # ── Базы данных клиента (для личного кабинета) ──────────────────────────
    if resource == 'client-databases' and method == 'GET':
        client_token = headers.get('X-Client-Token', '')
        client_id_from_token = verify_client_token(client_token) if client_token else None
        if not client_id_from_token:
            return resp(401, {'error': 'Не авторизован'})
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(f"""
            SELECT
                cd.id AS client_db_id,
                db.config_name,
                cd.current_config_version,
                db.actual_config_version,
                cd.update_date,
                au.full_name AS updated_by_name,
                au.login AS updated_by_login
            FROM {SCHEMA}.client_databases cd
            JOIN {SCHEMA}.config_databases db ON db.id = cd.config_database_id
            LEFT JOIN {SCHEMA}.update_history uh ON uh.client_database_id = cd.id
                AND uh.id = (
                    SELECT id FROM {SCHEMA}.update_history
                    WHERE client_database_id = cd.id
                    ORDER BY created_at DESC LIMIT 1
                )
            LEFT JOIN {SCHEMA}.admin_users au ON au.id = uh.updated_by_user_id
            WHERE cd.client_id = {client_id_from_token}
            ORDER BY db.config_name
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return resp(200, rows)

    return resp(405, {'error': 'Неверный метод или ресурс'})
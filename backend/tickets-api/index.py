import json
import os
import hashlib
import hmac
import time
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
CLIENT_SECRET = 'specsystems_client_secret_2026'
ADMIN_SECRET = 'specsystems_admin_secret_2026'
ADMIN_LOGIN_HARDCODED = 'Pioneer78'
ADMIN_PASSWORD_HARDCODED = 'Tytparol1!'

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


# ── Клиентский токен ─────────────────────────────────────────────────────────

def make_client_token(client_id: int, login: str) -> str:
    ts = str(int(time.time() // 3600))
    payload = f"client:{client_id}:{login}:{ts}:{CLIENT_SECRET}"
    return hmac.new(CLIENT_SECRET.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()


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
            payload = f"client:{c['id']}:{c['login']}:{ts}:{CLIENT_SECRET}"
            expected = hmac.new(CLIENT_SECRET.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
            if hmac.compare_digest(token, expected):
                return c['id']
    return None


# ── Токен сотрудника ─────────────────────────────────────────────────────────

def make_admin_token(login: str, role: str, user_id: int) -> str:
    ts = str(int(time.time() // 3600))
    payload = f"{login}:{role}:{user_id}:{ts}:{ADMIN_SECRET}"
    return hmac.new(ADMIN_SECRET.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()


def verify_admin_token(token: str):
    """Проверяет admin_token, возвращает (user_id, role, login) или (None, None, None)."""
    if not token:
        return None, None, None
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
                    return u['user_id'], role, u['login']
    return None, None, None


def resp(status, body):
    return {'statusCode': status, 'headers': CORS, 'body': json.dumps(body, ensure_ascii=False, default=str)}


def handler(event: dict, context) -> dict:
    """
    Единый API для заявок. Используется клиентами и сотрудниками.

    Авторизация сотрудников:
      Заголовок: X-Admin-Token: <token>

    Авторизация клиентов:
      Заголовок: X-Client-Token: <token>

    Ресурсы:
      POST   ?resource=staff-login          — вход сотрудника → token, user_id, login, full_name, role
      GET    ?resource=staff-verify         — проверка токена сотрудника
      POST   ?resource=client-login         — вход клиента
      GET    ?resource=client-verify        — проверка токена клиента
      GET    ?resource=tickets              — список заявок (фильтры: status, client_id, problem_type, assignee_id)
      GET    ?resource=tickets&id=N         — одна заявка по ID
      POST   ?resource=tickets              — создать заявку (только клиент)
      PATCH  ?resource=tickets&id=N         — изменить заявку (только сотрудник)
      GET    ?resource=ticket-meta          — справочники: клиенты, сотрудники, типы, приоритеты
      GET    ?resource=client-databases     — базы данных клиента (только клиент)
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    headers = event.get('headers') or {}
    qs = event.get('queryStringParameters') or {}
    resource = qs.get('resource', '')

    # ══════════════════════════════════════════════════════════════════════════
    # АВТОРИЗАЦИЯ СОТРУДНИКА
    # POST ?resource=staff-login
    # Body: { "login": "...", "password": "..." }
    # Response: { "token": "...", "user_id": 1, "login": "...", "full_name": "...", "role": "admin"|"user" }
    # ══════════════════════════════════════════════════════════════════════════
    if resource == 'staff-login' and method == 'POST':
        body = json.loads(event.get('body') or '{}')
        login = body.get('login', '').strip()
        password = body.get('password', '')
        if not login or not password:
            return resp(400, {'error': 'Укажите логин и пароль'})

        # Суперадмин
        if login == ADMIN_LOGIN_HARDCODED and password == ADMIN_PASSWORD_HARDCODED:
            token = make_admin_token(ADMIN_LOGIN_HARDCODED, 'admin', 0)
            return resp(200, {'token': token, 'user_id': 0, 'login': ADMIN_LOGIN_HARDCODED, 'full_name': 'Администратор', 'role': 'admin'})

        pwd_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            f"SELECT id, login, full_name FROM {SCHEMA}.admin_users WHERE login=%s AND password_hash=%s AND is_active=TRUE",
            (login, pwd_hash)
        )
        user = cur.fetchone()
        cur.close()
        conn.close()
        if not user:
            return resp(401, {'error': 'Неверный логин или пароль'})
        token = make_admin_token(user['login'], 'user', user['id'])
        return resp(200, {'token': token, 'user_id': user['id'], 'login': user['login'], 'full_name': user['full_name'], 'role': 'user'})

    # ══════════════════════════════════════════════════════════════════════════
    # ПРОВЕРКА ТОКЕНА СОТРУДНИКА
    # GET ?resource=staff-verify
    # Header: X-Admin-Token: <token>
    # Response: { "ok": true, "user_id": 1, "login": "...", "full_name": "...", "role": "..." }
    # ══════════════════════════════════════════════════════════════════════════
    if resource == 'staff-verify' and method == 'GET':
        token = headers.get('X-Admin-Token', '')
        user_id, role, login = verify_admin_token(token)
        if user_id is None:
            return resp(401, {'ok': False, 'error': 'Токен недействителен'})
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        if user_id == 0:
            cur.close()
            conn.close()
            return resp(200, {'ok': True, 'user_id': 0, 'login': ADMIN_LOGIN_HARDCODED, 'full_name': 'Администратор', 'role': 'admin'})
        cur.execute(f"SELECT id, login, full_name FROM {SCHEMA}.admin_users WHERE id=%s", (user_id,))
        user = cur.fetchone()
        cur.close()
        conn.close()
        return resp(200, {'ok': True, 'user_id': user['id'], 'login': user['login'], 'full_name': user['full_name'], 'role': role})

    # ══════════════════════════════════════════════════════════════════════════
    # ВХОД КЛИЕНТА
    # POST ?resource=client-login
    # Body: { "login": "...", "password": "..." }
    # Response: { "token": "...", "client_id": 1, "name": "..." }
    # ══════════════════════════════════════════════════════════════════════════
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

    # ══════════════════════════════════════════════════════════════════════════
    # ПРОВЕРКА ТОКЕНА КЛИЕНТА
    # GET ?resource=client-verify
    # Header: X-Client-Token: <token>
    # Response: { "ok": true, "client_id": 1, "name": "...", "login": "..." }
    # ══════════════════════════════════════════════════════════════════════════
    if resource == 'client-verify' and method == 'GET':
        token = headers.get('X-Client-Token', '')
        client_id = verify_client_token(token)
        if not client_id:
            return resp(401, {'ok': False, 'error': 'Токен недействителен'})
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(f"SELECT id, name, login FROM {SCHEMA}.clients WHERE id=%s", (client_id,))
        c = cur.fetchone()
        cur.close()
        conn.close()
        return resp(200, {'ok': True, 'client_id': c['id'], 'name': c['name'], 'login': c['login']})

    # ══════════════════════════════════════════════════════════════════════════
    # СПРАВОЧНИКИ
    # GET ?resource=ticket-meta
    # Header: X-Admin-Token: <token>
    # Response: { "clients": [...], "users": [...], "problem_types": [...], "priorities": [...], "statuses": [...] }
    # ══════════════════════════════════════════════════════════════════════════
    if resource == 'ticket-meta' and method == 'GET':
        admin_token = headers.get('X-Admin-Token', '')
        admin_user_id, _, _ = verify_admin_token(admin_token)
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
        return resp(200, {
            'clients': clients,
            'users': users,
            'problem_types': PROBLEM_TYPES,
            'priorities': PRIORITIES,
            'statuses': STATUSES,
        })

    # ══════════════════════════════════════════════════════════════════════════
    # ЗАЯВКИ
    # ══════════════════════════════════════════════════════════════════════════
    if resource == 'tickets':
        client_token = headers.get('X-Client-Token', '')
        admin_token = headers.get('X-Admin-Token', '')
        client_id_from_token = verify_client_token(client_token) if client_token else None
        admin_user_id, admin_role, _ = verify_admin_token(admin_token) if admin_token else (None, None, None)

        is_client = client_id_from_token is not None
        is_staff = admin_user_id is not None

        if not is_client and not is_staff:
            return resp(401, {'error': 'Не авторизован'})

        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # ── GET список заявок ────────────────────────────────────────────────
        # GET ?resource=tickets
        # Фильтры (только для сотрудника): status, client_id, problem_type, assignee_id
        # Response: [ { id, client_id, client_name, submitted_at, priority, problem_type,
        #               description, deadline, extra_info, result, status,
        #               resolved_at, status_changed_at, assignee_id, assignee_name, assignee_login }, ... ]
        if method == 'GET' and not qs.get('id'):
            where_parts = []
            if is_client:
                where_parts.append(f"t.client_id = {client_id_from_token}")
            if is_staff:
                if qs.get('status'):
                    raw = qs['status']
                    vals = [v.strip().replace("'", "''") for v in raw.split(',') if v.strip() in STATUSES]
                    if len(vals) == 1:
                        where_parts.append(f"t.status = '{vals[0]}'")
                    elif len(vals) > 1:
                        in_list = ', '.join(f"'{v}'" for v in vals)
                        where_parts.append(f"t.status IN ({in_list})")
                if qs.get('client_id'):
                    where_parts.append(f"t.client_id = {int(qs['client_id'])}")
                if qs.get('problem_type'):
                    pt = qs['problem_type'].replace("'", "''")
                    where_parts.append(f"t.problem_type = '{pt}'")
                if qs.get('assignee_id'):
                    where_parts.append(f"t.assignee_id = {int(qs['assignee_id'])}")

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

        # ── GET одна заявка ──────────────────────────────────────────────────
        # GET ?resource=tickets&id=N
        # Response: { id, client_id, client_name, ... }
        if method == 'GET' and qs.get('id'):
            ticket_id = int(qs['id'])
            extra_where = f"AND t.client_id = {client_id_from_token}" if is_client else ""
            cur.execute(f"""
                SELECT t.*,
                       c.name as client_name,
                       u.full_name as assignee_name, u.login as assignee_login
                FROM {SCHEMA}.tickets t
                JOIN {SCHEMA}.clients c ON c.id = t.client_id
                LEFT JOIN {SCHEMA}.admin_users u ON u.id = t.assignee_id
                WHERE t.id = {ticket_id} {extra_where}
            """)
            ticket = cur.fetchone()
            cur.close()
            conn.close()
            if not ticket:
                return resp(404, {'error': 'Заявка не найдена'})
            return resp(200, ticket)

        # ── POST создать заявку (только клиент) ──────────────────────────────
        # POST ?resource=tickets
        # Body: { priority, problem_type, description, deadline?, extra_info? }
        # Response: { id, ... } — созданная заявка
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

        # ── PATCH изменить заявку (только сотрудник) ─────────────────────────
        # PATCH ?resource=tickets&id=N
        # Body (все поля опциональны):
        #   status        — "new" | "in_progress" | "resolved" | "cancelled"
        #   assignee_id   — ID сотрудника или null (снять ответственного)
        #   result        — текст результата
        #   priority      — "low" | "medium" | "high" | "urgent"
        #   problem_type  — тип проблемы (строка из справочника)
        #   deadline      — дата/время ISO 8601 или null
        #   extra_info    — дополнительная информация
        # Response: обновлённая заявка
        if method == 'PATCH':
            ticket_id = int(qs.get('id', 0))
            if not ticket_id:
                return resp(400, {'error': 'Не указан id заявки'})
            if not is_staff:
                return resp(403, {'error': 'Недостаточно прав'})

            body = json.loads(event.get('body') or '{}')
            sets = []
            params = []

            if 'status' in body and body['status'] in STATUSES:
                sets.append("status = %s")
                params.append(body['status'])
                sets.append("status_changed_at = now()")
                if body['status'] == 'resolved':
                    sets.append("resolved_at = now()")
                elif body['status'] != 'resolved':
                    # Сброс даты решения при смене статуса обратно
                    sets.append("resolved_at = NULL")

            if 'assignee_id' in body:
                sets.append("assignee_id = %s")
                params.append(body['assignee_id'] or None)

            if 'result' in body:
                sets.append("result = %s")
                params.append(body['result'] or None)

            if 'priority' in body and body['priority'] in PRIORITIES:
                sets.append("priority = %s")
                params.append(body['priority'])

            if 'problem_type' in body and body['problem_type'] in PROBLEM_TYPES:
                sets.append("problem_type = %s")
                params.append(body['problem_type'])

            if 'deadline' in body:
                sets.append("deadline = %s")
                params.append(body['deadline'] or None)

            if 'extra_info' in body:
                sets.append("extra_info = %s")
                params.append(body['extra_info'] or None)

            if not sets:
                return resp(400, {'error': 'Нечего обновлять'})

            sets.append("updated_at = now()")
            params.append(ticket_id)
            cur.execute(f"UPDATE {SCHEMA}.tickets SET {', '.join(sets)} WHERE id = %s RETURNING *", params)
            ticket = cur.fetchone()
            conn.commit()
            cur.close()
            conn.close()
            if not ticket:
                return resp(404, {'error': 'Заявка не найдена'})
            return resp(200, ticket)

        cur.close()
        conn.close()

    # ══════════════════════════════════════════════════════════════════════════
    # БАЗЫ ДАННЫХ КЛИЕНТА
    # GET ?resource=client-databases
    # Header: X-Client-Token: <token>
    # Response: [ { client_db_id, client_name, config_name, current_config_version,
    #               actual_config_version, update_date, updated_by_name, updated_by_login }, ... ]
    # ══════════════════════════════════════════════════════════════════════════
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
                c.name AS client_name,
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
            WHERE cd.client_id = {client_id_from_token}
               OR cd.client_id IN (
                   SELECT id FROM {SCHEMA}.clients
                   WHERE parent_id = {client_id_from_token} AND is_active = TRUE
               )
            ORDER BY
                CASE WHEN cd.client_id = {client_id_from_token} THEN 0 ELSE 1 END,
                c.name,
                db.config_name
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return resp(200, rows)

    return resp(405, {'error': 'Неверный метод или ресурс'})
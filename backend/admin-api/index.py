import json
import os
import hashlib
import hmac
import secrets
import string
import time
import re
import urllib.request
import psycopg2
from psycopg2.extras import RealDictCursor

KEY_ALPHABET = string.ascii_letters + string.digits
KEY_LENGTH = 2048


def generate_access_key() -> str:
    return ''.join(secrets.choice(KEY_ALPHABET) for _ in range(KEY_LENGTH))

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
ADMIN_LOGIN = 'Pioneer78'
SECRET_KEY = 'specsystems_admin_secret_2026'
RS_RELEASES_URL = 'https://rial-soft.ru/products/version/data/releases.json'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
}


def ok(data):
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(data, default=str)}


def err(msg, code=400):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg})}


def get_all_logins(conn):
    """Получить все активные логины пользователей + суперадмин."""
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"SELECT id, login FROM {SCHEMA}.admin_users WHERE is_active = TRUE")
    rows = [{'user_id': r['id'], 'login': r['login'], 'role': 'admin' if r['id'] == 0 else 'user'} for r in cur.fetchall()]
    cur.close()
    return rows


def decode_token(token: str, conn) -> dict:
    """Декодирует токен, возвращает {'role': ..., 'user_id': ..., 'login': ...} или None."""
    candidates = get_all_logins(conn)
    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        for c in candidates:
            payload = f"{c['login']}:{c['role']}:{c['user_id']}:{ts}:{SECRET_KEY}"
            expected = hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
            if hmac.compare_digest(token or '', expected):
                return c
    return None


def hash_password(pwd: str) -> str:
    return hashlib.sha256(pwd.encode()).hexdigest()


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def version_tuple(v: str):
    """'3.0.22' -> (3, 0, 22); нечисловые части и пустая строка дают (0,)."""
    if not v:
        return (0,)
    parts = re.findall(r'\d+', v)
    return tuple(int(p) for p in parts) if parts else (0,)


def fetch_rs_releases() -> dict:
    """Скачивает датасет актуальных версий 1С с rial-soft.ru. code -> {version, date}."""
    req = urllib.request.Request(RS_RELEASES_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=8) as resp:
        payload = json.loads(resp.read().decode('utf-8'))
    result = {}
    for cfg in payload.get('configs', []):
        latest = next((r for r in cfg.get('releases', []) if r.get('status') == 'final'), None)
        if latest:
            result[cfg['code']] = {'version': latest['v'], 'date': latest.get('date')}
    return result


def handler(event: dict, context) -> dict:
    """CRUD API для административной панели: пользователи, клиенты, базы данных, привязки.
    Маршрутинг через query-параметры: ?resource=users|clients|databases|user_clients&id=N&sub=db&subid=M
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    token = (event.get('headers') or {}).get('X-Admin-Token', '')
    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    resource = qs.get('resource', '')
    rid = qs.get('id', '')
    sub = qs.get('sub', '')
    subid = qs.get('subid', '')
    body = {}
    if method in ('POST', 'PUT', 'PATCH'):
        body = json.loads(event.get('body') or '{}')

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        caller = decode_token(token, conn)
        if not caller:
            return err('Unauthorized', 401)

        is_admin = caller['role'] == 'admin'
        caller_user_id = caller['user_id']

        # Пользователь (не админ) имеет доступ только к clients и databases
        if not is_admin and resource not in ('clients', 'databases', 'check-version', 'check-all-versions'):
            return err('Forbidden', 403)
        # ── USERS ──────────────────────────────────────────────────────────────
        if resource == 'users':
            if not rid:
                if method == 'GET':
                    cur.execute(f"SELECT id, login, full_name, is_active, phone, description, created_at, (access_key IS NOT NULL) AS has_key FROM {SCHEMA}.admin_users WHERE id != 0 ORDER BY id")
                    users = [dict(r) for r in cur.fetchall()]
                    # attach linked clients for each user
                    cur.execute(f"""
                        SELECT uc.user_id, c.id as client_id, c.name as client_name
                        FROM {SCHEMA}.user_clients uc
                        JOIN {SCHEMA}.clients c ON c.id = uc.client_id
                        ORDER BY c.name
                    """)
                    uc_map = {}
                    for row in cur.fetchall():
                        uc_map.setdefault(row['user_id'], []).append({'client_id': row['client_id'], 'client_name': row['client_name']})
                    for u in users:
                        u['clients'] = uc_map.get(u['id'], [])
                    return ok(users)
                if method == 'POST':
                    pwd_hash = hash_password(body['password'])
                    cur.execute(
                        f"INSERT INTO {SCHEMA}.admin_users (login, password_hash, full_name, is_active, phone, description) VALUES (%s,%s,%s,%s,%s,%s) RETURNING id, login, full_name, is_active, phone, description",
                        (body['login'], pwd_hash, body.get('full_name'), body.get('is_active', True), body.get('phone'), body.get('description'))
                    )
                    conn.commit()
                    return ok(dict(cur.fetchone()))
            else:
                if rid == '0':
                    return err('Служебная запись администратора недоступна для редактирования', 403)
                if method == 'PUT':
                    fields = []
                    vals = []
                    if 'login' in body:
                        fields.append('login=%s'); vals.append(body['login'])
                    if body.get('password'):
                        fields.append('password_hash=%s'); vals.append(hash_password(body['password']))
                    if 'is_active' in body:
                        fields.append('is_active=%s'); vals.append(body['is_active'])
                    if 'phone' in body:
                        fields.append('phone=%s'); vals.append(body['phone'])
                    if 'description' in body:
                        fields.append('description=%s'); vals.append(body['description'])
                    if 'full_name' in body:
                        fields.append('full_name=%s'); vals.append(body['full_name'])
                    fields.append('updated_at=NOW()')
                    vals.append(rid)
                    cur.execute(f"UPDATE {SCHEMA}.admin_users SET {', '.join(fields)} WHERE id=%s RETURNING id, login, full_name, is_active, phone, description", vals)
                    conn.commit()
                    return ok(dict(cur.fetchone()))
                if method == 'PATCH' and sub != 'genkey':
                    cur.execute(f"UPDATE {SCHEMA}.admin_users SET is_active = NOT is_active, updated_at=NOW() WHERE id=%s RETURNING id, is_active", [rid])
                    conn.commit()
                    return ok(dict(cur.fetchone()))
                if method == 'POST' and sub == 'genkey':
                    new_key = generate_access_key()
                    cur.execute(
                        f"UPDATE {SCHEMA}.admin_users SET access_key=%s, access_key_created_at=NOW(), updated_at=NOW() WHERE id=%s RETURNING id",
                        (new_key, rid)
                    )
                    row = cur.fetchone()
                    if not row:
                        return err('Пользователь не найден', 404)
                    conn.commit()
                    return ok({'id': row['id'], 'access_key': new_key})

        # ── CLIENTS ────────────────────────────────────────────────────────────
        if resource == 'clients':
            if not rid:
                if method == 'GET':
                    # Обычный пользователь — только привязанные клиенты
                    if not is_admin:
                        cur.execute(f"""
                            SELECT c.id, c.parent_id, p.name as parent_name,
                                   c.name, c.login, c.is_active, c.inn, c.address,
                                   c.director_name, c.director_phone, c.director_email,
                                   c.accountant_name, c.accountant_phone, c.accountant_email,
                                   c.contact_name, c.contact_phone, c.contact_email
                            FROM {SCHEMA}.clients c
                            LEFT JOIN {SCHEMA}.clients p ON p.id = c.parent_id
                            JOIN {SCHEMA}.user_clients uc ON uc.client_id = c.id AND uc.user_id = %s
                            ORDER BY c.parent_id NULLS FIRST, c.name
                        """, [caller_user_id])
                    else:
                        cur.execute(f"""
                            SELECT c.id, c.parent_id, p.name as parent_name,
                                   c.name, c.login, c.password_plain, c.is_active, c.inn, c.address,
                                   c.director_name, c.director_phone, c.director_email,
                                   c.accountant_name, c.accountant_phone, c.accountant_email,
                                   c.contact_name, c.contact_phone, c.contact_email
                            FROM {SCHEMA}.clients c
                            LEFT JOIN {SCHEMA}.clients p ON p.id = c.parent_id
                            ORDER BY c.parent_id NULLS FIRST, c.name
                        """)
                    clients = [dict(r) for r in cur.fetchall()]
                    client_ids = [c['id'] for c in clients]
                    if client_ids:
                        placeholders = ','.join(['%s'] * len(client_ids))
                        cur.execute(f"""
                            SELECT cd.id, cd.client_id, cd.config_database_id,
                                   db.config_name, cd.current_config_version, cd.update_date, cd.comment, cd.db_type
                            FROM {SCHEMA}.client_databases cd
                            JOIN {SCHEMA}.config_databases db ON db.id = cd.config_database_id
                            WHERE cd.client_id IN ({placeholders})
                        """, client_ids)
                        db_map = {}
                        for d in cur.fetchall():
                            db_map.setdefault(d['client_id'], []).append(dict(d))
                    else:
                        db_map = {}
                    for c in clients:
                        c['databases'] = db_map.get(c['id'], [])
                    return ok(clients)

                # Запись/изменение клиентов — только для админа
                if not is_admin:
                    return err('Forbidden', 403)

                if method == 'POST':
                    pwd_hash = hash_password(body['password']) if body.get('password') else None
                    pwd_plain = body.get('password') or None
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.clients
                          (parent_id, name, login, password_hash, password_plain, is_active, inn, address,
                           director_name, director_phone, director_email,
                           accountant_name, accountant_phone, accountant_email,
                           contact_name, contact_phone, contact_email)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id, name
                    """, (
                        body.get('parent_id'), body['name'], body.get('login'), pwd_hash, pwd_plain,
                        body.get('is_active', True), body.get('inn'), body.get('address'),
                        body.get('director_name'), body.get('director_phone'), body.get('director_email'),
                        body.get('accountant_name'), body.get('accountant_phone'), body.get('accountant_email'),
                        body.get('contact_name'), body.get('contact_phone'), body.get('contact_email'),
                    ))
                    conn.commit()
                    return ok(dict(cur.fetchone()))

            else:
                # client databases sub-resource
                if sub == 'db':
                    if not subid:
                        if method == 'POST':
                            cur.execute(f"""
                                INSERT INTO {SCHEMA}.client_databases (client_id, config_database_id, current_config_version, update_date, comment, db_type)
                                VALUES (%s,%s,%s,%s,%s,%s) RETURNING id
                            """, (rid, body['config_database_id'], body.get('current_config_version'), body.get('update_date') or None, body.get('comment'), body.get('db_type', 'file')))
                            conn.commit()
                            return ok({'id': cur.fetchone()['id']})
                    else:
                        if method == 'PUT':
                            cur.execute(f"""
                                UPDATE {SCHEMA}.client_databases SET config_database_id=%s, current_config_version=%s, update_date=%s, comment=%s, db_type=%s
                                WHERE id=%s RETURNING id
                            """, (body['config_database_id'], body.get('current_config_version'), body.get('update_date') or None, body.get('comment'), body.get('db_type', 'file'), subid))
                            conn.commit()
                            return ok({'id': subid})
                        if method == 'DELETE':
                            cur.execute(f"DELETE FROM {SCHEMA}.update_history WHERE client_database_id=%s", [subid])
                            cur.execute(f"DELETE FROM {SCHEMA}.client_databases WHERE id=%s RETURNING id", [subid])
                            row = cur.fetchone()
                            conn.commit()
                            if not row:
                                return err('База клиента не найдена', 404)
                            return ok({'deleted': row['id']})
                else:
                    if method == 'PUT':
                        pwd_part = ', password_hash=%s, password_plain=%s' if body.get('password') else ''
                        vals = [
                            body.get('parent_id'), body['name'], body.get('login'),
                            body.get('is_active', True), body.get('inn'), body.get('address'),
                            body.get('director_name'), body.get('director_phone'), body.get('director_email'),
                            body.get('accountant_name'), body.get('accountant_phone'), body.get('accountant_email'),
                            body.get('contact_name'), body.get('contact_phone'), body.get('contact_email'),
                        ]
                        if body.get('password'):
                            vals.insert(3, hash_password(body['password']))
                            vals.insert(4, body['password'])
                        vals.append(rid)
                        cur.execute(f"""
                            UPDATE {SCHEMA}.clients SET
                              parent_id=%s, name=%s, login=%s{pwd_part}, is_active=%s, inn=%s, address=%s,
                              director_name=%s, director_phone=%s, director_email=%s,
                              accountant_name=%s, accountant_phone=%s, accountant_email=%s,
                              contact_name=%s, contact_phone=%s, contact_email=%s, updated_at=NOW()
                            WHERE id=%s RETURNING id, name
                        """, vals)
                        conn.commit()
                        return ok(dict(cur.fetchone()))

                    if method == 'PATCH':
                        cur.execute(f"UPDATE {SCHEMA}.clients SET is_active = NOT is_active, updated_at=NOW() WHERE id=%s RETURNING id, is_active", [rid])
                        conn.commit()
                        return ok(dict(cur.fetchone()))

                    if method == 'DELETE':
                        cur.execute(f"SELECT id FROM {SCHEMA}.clients WHERE parent_id=%s LIMIT 1", [rid])
                        if cur.fetchone():
                            return err('У клиента есть дочерние организации — сначала удалите их или перепривяжите к другому клиенту', 409)
                        cur.execute(f"DELETE FROM {SCHEMA}.update_history WHERE client_id=%s", [rid])
                        cur.execute(f"DELETE FROM {SCHEMA}.client_databases WHERE client_id=%s", [rid])
                        cur.execute(f"DELETE FROM {SCHEMA}.tickets WHERE client_id=%s", [rid])
                        cur.execute(f"DELETE FROM {SCHEMA}.user_clients WHERE client_id=%s", [rid])
                        cur.execute(f"DELETE FROM {SCHEMA}.clients WHERE id=%s RETURNING id", [rid])
                        row = cur.fetchone()
                        if not row:
                            return err('Клиент не найден', 404)
                        conn.commit()
                        return ok({'deleted': row['id']})

        # ── CONFIG DATABASES ───────────────────────────────────────────────────
        if resource == 'databases':
            if not rid:
                if method == 'GET':
                    cur.execute(f"SELECT * FROM {SCHEMA}.config_databases ORDER BY config_name")
                    return ok(cur.fetchall())
                if method == 'POST':
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.config_databases (config_name, min_platform_version, actual_config_version, update_release_date, rs_code)
                        VALUES (%s,%s,%s,%s,%s) RETURNING *
                    """, (body['config_name'], body.get('min_platform_version'), body.get('actual_config_version'), body.get('update_release_date') or None, body.get('rs_code') or None))
                    conn.commit()
                    return ok(dict(cur.fetchone()))
            else:
                if method == 'PUT':
                    cur.execute(f"""
                        UPDATE {SCHEMA}.config_databases SET
                          config_name=%s, min_platform_version=%s, actual_config_version=%s, update_release_date=%s, rs_code=%s, updated_at=NOW()
                        WHERE id=%s RETURNING *
                    """, (body['config_name'], body.get('min_platform_version'), body.get('actual_config_version'), body.get('update_release_date') or None, body.get('rs_code') or None, rid))
                    conn.commit()
                    return ok(dict(cur.fetchone()))

        # ── ПРОВЕРКА АКТУАЛЬНОЙ ВЕРСИИ ЧЕРЕЗ RIAL-SOFT.RU ────────────────────────
        # GET ?resource=check-version&id=N        — проверить одну базу
        #   Response: { id, config_name, current, latest, has_update, latest_date }
        #   или { id, config_name, error: "..." } если rs_code не задан / нет данных
        # GET ?resource=check-all-versions         — проверить все базы разом
        #   Response: { checked: N, outdated: [ {id, config_name, current, latest, latest_date}, ... ], errors: [ {id, config_name, error}, ... ] }
        if resource == 'check-version' and method == 'GET':
            if not rid:
                return err('Не указан id базы')
            cur.execute(f"SELECT id, config_name, actual_config_version, rs_code FROM {SCHEMA}.config_databases WHERE id=%s", [rid])
            row = cur.fetchone()
            if not row:
                return err('База не найдена', 404)
            if not row['rs_code']:
                return ok({'id': row['id'], 'config_name': row['config_name'], 'error': 'Для этой базы не указан код сопоставления (rs_code) — обновление вручную'})
            try:
                releases = fetch_rs_releases()
            except Exception:
                return err('Не удалось получить данные с rial-soft.ru, попробуйте позже', 502)
            info = releases.get(row['rs_code'])
            if not info:
                return ok({'id': row['id'], 'config_name': row['config_name'], 'error': 'Конфигурация не найдена в источнике версий'})
            has_update = version_tuple(info['version']) > version_tuple(row['actual_config_version'])
            if info.get('date'):
                cur.execute(f"UPDATE {SCHEMA}.config_databases SET update_release_date=%s, updated_at=NOW() WHERE id=%s", (info['date'], row['id']))
                conn.commit()
            return ok({
                'id': row['id'], 'config_name': row['config_name'],
                'current': row['actual_config_version'] or None,
                'latest': info['version'], 'latest_date': info['date'],
                'has_update': has_update,
            })

        if resource == 'check-all-versions' and method == 'GET':
            cur.execute(f"SELECT id, config_name, actual_config_version, rs_code FROM {SCHEMA}.config_databases ORDER BY config_name")
            rows = cur.fetchall()
            try:
                releases = fetch_rs_releases()
            except Exception:
                return err('Не удалось получить данные с rial-soft.ru, попробуйте позже', 502)
            outdated = []
            errors = []
            checked = 0
            for row in rows:
                if not row['rs_code']:
                    continue
                info = releases.get(row['rs_code'])
                if not info:
                    errors.append({'id': row['id'], 'config_name': row['config_name'], 'error': 'Не найдена в источнике версий'})
                    continue
                checked += 1
                if info.get('date'):
                    cur.execute(f"UPDATE {SCHEMA}.config_databases SET update_release_date=%s, updated_at=NOW() WHERE id=%s", (info['date'], row['id']))
                if version_tuple(info['version']) > version_tuple(row['actual_config_version']):
                    outdated.append({
                        'id': row['id'], 'config_name': row['config_name'],
                        'current': row['actual_config_version'] or None,
                        'latest': info['version'], 'latest_date': info['date'],
                    })
            conn.commit()
            return ok({'checked': checked, 'outdated': outdated, 'errors': errors})

        # ── USER ↔ CLIENT LINKS ────────────────────────────────────────────────
        # GET  ?resource=user_clients&id=USER_ID  → список клиентов пользователя
        # POST ?resource=user_clients             body: {user_id, client_id}  → создать связь
        # PATCH?resource=user_clients&id=LINK_ID  → удалить связь (soft-delete через PATCH)
        if resource == 'user_clients':
            if not rid:
                if method == 'GET':
                    # Все связи с деталями
                    cur.execute(f"""
                        SELECT uc.id, uc.user_id, u.login as user_login,
                               uc.client_id, c.name as client_name
                        FROM {SCHEMA}.user_clients uc
                        JOIN {SCHEMA}.admin_users u ON u.id = uc.user_id
                        JOIN {SCHEMA}.clients c ON c.id = uc.client_id
                        ORDER BY u.login, c.name
                    """)
                    return ok(cur.fetchall())
                if method == 'POST':
                    cur.execute(f"""
                        INSERT INTO {SCHEMA}.user_clients (user_id, client_id)
                        VALUES (%s, %s)
                        ON CONFLICT (user_id, client_id) DO NOTHING
                        RETURNING id
                    """, (body['user_id'], body['client_id']))
                    conn.commit()
                    row = cur.fetchone()
                    return ok({'id': row['id'] if row else None})
            else:
                # PATCH ?id=LINK_ID → удалить связь
                if method == 'PATCH':
                    cur.execute(f"DELETE FROM {SCHEMA}.user_clients WHERE id=%s RETURNING id", [rid])
                    conn.commit()
                    return ok({'deleted': rid})

        return err('Not found', 404)

    finally:
        cur.close()
        conn.close()
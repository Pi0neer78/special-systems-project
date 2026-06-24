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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
}


def ok(data):
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(data, default=str)}


def err(msg, code=400):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg})}


def verify_token(token: str) -> bool:
    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        payload = f"{ADMIN_LOGIN}:{ts}:{SECRET_KEY}"
        expected = hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
        if hmac.compare_digest(token or '', expected):
            return True
    return False


def hash_password(pwd: str) -> str:
    return hashlib.sha256(pwd.encode()).hexdigest()


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def handler(event: dict, context) -> dict:
    """CRUD API для административной панели: пользователи, клиенты, базы данных."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    token = (event.get('headers') or {}).get('X-Admin-Token', '')
    if not verify_token(token):
        return err('Unauthorized', 401)

    method = event.get('httpMethod', 'GET')
    path = (event.get('path') or '/').rstrip('/')
    body = json.loads(event.get('body') or '{}') if method in ('POST', 'PUT', 'PATCH') else {}
    qs = event.get('queryStringParameters') or {}

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # ── USERS ─────────────────────────────────────────────────────────────
        if path.endswith('/users'):
            if method == 'GET':
                cur.execute(f"SELECT id, login, is_active, phone, description, created_at FROM {SCHEMA}.admin_users ORDER BY id")
                return ok(cur.fetchall())

            if method == 'POST':
                pwd_hash = hash_password(body['password'])
                cur.execute(
                    f"INSERT INTO {SCHEMA}.admin_users (login, password_hash, is_active, phone, description) VALUES (%s,%s,%s,%s,%s) RETURNING id, login, is_active, phone, description",
                    (body['login'], pwd_hash, body.get('is_active', True), body.get('phone'), body.get('description'))
                )
                conn.commit()
                return ok(dict(cur.fetchone()))

        if '/users/' in path:
            uid = path.split('/users/')[-1]
            if method == 'PUT':
                fields = []
                vals = []
                if 'login' in body:
                    fields.append('login=%s'); vals.append(body['login'])
                if 'password' in body and body['password']:
                    fields.append('password_hash=%s'); vals.append(hash_password(body['password']))
                if 'is_active' in body:
                    fields.append('is_active=%s'); vals.append(body['is_active'])
                if 'phone' in body:
                    fields.append('phone=%s'); vals.append(body['phone'])
                if 'description' in body:
                    fields.append('description=%s'); vals.append(body['description'])
                fields.append('updated_at=NOW()')
                vals.append(uid)
                cur.execute(f"UPDATE {SCHEMA}.admin_users SET {', '.join(fields)} WHERE id=%s RETURNING id, login, is_active, phone, description", vals)
                conn.commit()
                return ok(dict(cur.fetchone()))

            if method == 'PATCH':  # toggle active
                cur.execute(f"UPDATE {SCHEMA}.admin_users SET is_active = NOT is_active, updated_at=NOW() WHERE id=%s RETURNING id, is_active", [uid])
                conn.commit()
                return ok(dict(cur.fetchone()))

        # ── CLIENTS ───────────────────────────────────────────────────────────
        if path.endswith('/clients'):
            if method == 'GET':
                cur.execute(f"""
                    SELECT c.id, c.parent_id, p.name as parent_name,
                           c.name, c.login, c.is_active, c.inn, c.address,
                           c.director_name, c.director_phone, c.director_email,
                           c.accountant_name, c.accountant_phone, c.accountant_email,
                           c.contact_name, c.contact_phone, c.contact_email
                    FROM {SCHEMA}.clients c
                    LEFT JOIN {SCHEMA}.clients p ON p.id = c.parent_id
                    ORDER BY c.parent_id NULLS FIRST, c.name
                """)
                clients = [dict(r) for r in cur.fetchall()]
                # client databases
                cur.execute(f"""
                    SELECT cd.id, cd.client_id, cd.config_database_id,
                           db.config_name, cd.current_config_version, cd.update_date
                    FROM {SCHEMA}.client_databases cd
                    JOIN {SCHEMA}.config_databases db ON db.id = cd.config_database_id
                """)
                dbs = cur.fetchall()
                db_map = {}
                for d in dbs:
                    db_map.setdefault(d['client_id'], []).append(dict(d))
                for c in clients:
                    c['databases'] = db_map.get(c['id'], [])
                return ok(clients)

            if method == 'POST':
                pwd_hash = hash_password(body['password']) if body.get('password') else None
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.clients
                      (parent_id, name, login, password_hash, is_active, inn, address,
                       director_name, director_phone, director_email,
                       accountant_name, accountant_phone, accountant_email,
                       contact_name, contact_phone, contact_email)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    RETURNING id, name
                """, (
                    body.get('parent_id'), body['name'], body.get('login'), pwd_hash,
                    body.get('is_active', True), body.get('inn'), body.get('address'),
                    body.get('director_name'), body.get('director_phone'), body.get('director_email'),
                    body.get('accountant_name'), body.get('accountant_phone'), body.get('accountant_email'),
                    body.get('contact_name'), body.get('contact_phone'), body.get('contact_email'),
                ))
                conn.commit()
                return ok(dict(cur.fetchone()))

        if '/clients/' in path and '/db' not in path:
            cid = path.split('/clients/')[-1]
            if method == 'PUT':
                pwd_part = ', password_hash=%s' if body.get('password') else ''
                vals = [
                    body.get('parent_id'), body['name'], body.get('login'),
                    body.get('is_active', True), body.get('inn'), body.get('address'),
                    body.get('director_name'), body.get('director_phone'), body.get('director_email'),
                    body.get('accountant_name'), body.get('accountant_phone'), body.get('accountant_email'),
                    body.get('contact_name'), body.get('contact_phone'), body.get('contact_email'),
                ]
                if body.get('password'):
                    vals.insert(3, hash_password(body['password']))
                vals.append(cid)
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
                cur.execute(f"UPDATE {SCHEMA}.clients SET is_active = NOT is_active, updated_at=NOW() WHERE id=%s RETURNING id, is_active", [cid])
                conn.commit()
                return ok(dict(cur.fetchone()))

        # Client databases
        if '/clients/' in path and path.endswith('/db'):
            cid = path.split('/clients/')[1].split('/db')[0]
            if method == 'POST':
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.client_databases (client_id, config_database_id, current_config_version, update_date)
                    VALUES (%s,%s,%s,%s) RETURNING id
                """, (cid, body['config_database_id'], body.get('current_config_version'), body.get('update_date')))
                conn.commit()
                return ok({'id': cur.fetchone()['id']})

        if '/clients/' in path and '/db/' in path:
            parts = path.split('/')
            db_id = parts[-1]
            if method == 'PUT':
                cur.execute(f"""
                    UPDATE {SCHEMA}.client_databases SET config_database_id=%s, current_config_version=%s, update_date=%s
                    WHERE id=%s RETURNING id
                """, (body['config_database_id'], body.get('current_config_version'), body.get('update_date'), db_id))
                conn.commit()
                return ok({'id': db_id})

        # ── CONFIG DATABASES ──────────────────────────────────────────────────
        if path.endswith('/databases'):
            if method == 'GET':
                cur.execute(f"SELECT * FROM {SCHEMA}.config_databases ORDER BY config_name")
                return ok(cur.fetchall())

            if method == 'POST':
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.config_databases (config_name, min_platform_version, actual_config_version, update_release_date)
                    VALUES (%s,%s,%s,%s) RETURNING *
                """, (body['config_name'], body.get('min_platform_version'), body.get('actual_config_version'), body.get('update_release_date')))
                conn.commit()
                return ok(dict(cur.fetchone()))

        if '/databases/' in path:
            did = path.split('/databases/')[-1]
            if method == 'PUT':
                cur.execute(f"""
                    UPDATE {SCHEMA}.config_databases SET
                      config_name=%s, min_platform_version=%s, actual_config_version=%s, update_release_date=%s, updated_at=NOW()
                    WHERE id=%s RETURNING *
                """, (body['config_name'], body.get('min_platform_version'), body.get('actual_config_version'), body.get('update_release_date'), did))
                conn.commit()
                return ok(dict(cur.fetchone()))

            if method == 'PATCH':
                cur.execute(f"SELECT id FROM {SCHEMA}.config_databases WHERE id=%s", [did])
                return ok({'exists': cur.fetchone() is not None})

        return err('Not found', 404)

    finally:
        cur.close()
        conn.close()
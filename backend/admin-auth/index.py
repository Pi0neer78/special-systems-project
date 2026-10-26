import json
import os
import hashlib
import hmac
import time
import psycopg2
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
ADMIN_LOGIN = 'Pioneer78'
ADMIN_PASSWORD = os.environ['ADMIN_PASSWORD']
SECRET_KEY = os.environ['ADMIN_TOKEN_SECRET']

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
}


def make_token(login: str, role: str, user_id: int = 0) -> str:
    ts = str(int(time.time() // 3600))
    payload = f"{login}:{role}:{user_id}:{ts}:{SECRET_KEY}"
    return hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()


def decode_token_role(token: str):
    """Возвращает (role, user_id) если токен валиден, иначе (None, None)."""
    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        for role in ['admin', 'user']:
            # Для admin user_id=0
            for uid_candidate in _get_user_ids_for_verify():
                login_candidate = uid_candidate['login']
                uid = uid_candidate['user_id']
                payload = f"{login_candidate}:{role}:{uid}:{ts}:{SECRET_KEY}"
                expected = hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
                if hmac.compare_digest(token or '', expected):
                    return role, uid, login_candidate
    return None, None, None


# Кэш для проверки токенов (простой список всех пользователей)
_cached_users = None
_cached_ts = 0


def _get_user_ids_for_verify():
    global _cached_users, _cached_ts
    now = time.time()
    if _cached_users is None or now - _cached_ts > 300:
        try:
            conn = psycopg2.connect(os.environ['DATABASE_URL'])
            cur = conn.cursor(cursor_factory=RealDictCursor)
            cur.execute(f"SELECT id, login FROM {SCHEMA}.admin_users WHERE is_active = TRUE")
            rows = [{'user_id': r['id'], 'login': r['login']} for r in cur.fetchall()]
            cur.close()
            conn.close()
            _cached_users = rows
            _cached_ts = now
        except Exception:
            return [{'user_id': 0, 'login': ADMIN_LOGIN}]
    return _cached_users


def handler(event: dict, context) -> dict:
    """Авторизация: администратор Pioneer78 или пользователь из таблицы admin_users.
    Возвращает токен + роль (admin/user) + user_id.
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')

    # Проверка токена (GET /verify)
    if method == 'GET':
        token = (event.get('headers') or {}).get('X-Admin-Token', '')
        role, user_id, login = decode_token_role(token)
        if role:
            result = {'ok': True, 'role': role, 'user_id': user_id, 'login': login}
            if (event.get('queryStringParameters') or {}).get('refresh') == '1':
                result['token'] = make_token(login, role, user_id)
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(result)}
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'ok': False})}

    # Логин (POST)
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        login = body.get('login', '').strip()
        password = body.get('password', '')
        access_key = body.get('access_key', '')

        ip = str(((event.get('requestContext') or {}).get('identity') or {}).get('sourceIp') or '')[:64]
        key = 'admin-auth:' + login.lower()[:100]
        conn = psycopg2.connect(os.environ['DATABASE_URL'])
        cur = conn.cursor(cursor_factory=RealDictCursor)

        def fail():
            cur.execute(f"INSERT INTO {SCHEMA}.login_attempts (login_key, ip) VALUES (%s, %s)", (key, ip))
            conn.commit()

        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.login_attempts WHERE login_key=%s AND created_at > NOW() - INTERVAL '15 minutes'", (key,))
        by_login = cur.fetchone()['c']
        cur.execute(f"SELECT COUNT(*) AS c FROM {SCHEMA}.login_attempts WHERE ip=%s AND created_at > NOW() - INTERVAL '15 minutes'", (ip,))
        by_ip = cur.fetchone()['c']
        if by_login >= 5 or by_ip >= 30:
            cur.close(); conn.close()
            return {'statusCode': 429, 'headers': CORS, 'body': json.dumps({'error': 'Слишком много неудачных попыток. Попробуйте через 15 минут.'})}

        if login == ADMIN_LOGIN and hmac.compare_digest(password, ADMIN_PASSWORD):
            cur.execute(f"DELETE FROM {SCHEMA}.login_attempts WHERE login_key=%s", (key,))
            conn.commit()
            cur.close(); conn.close()
            token = make_token(ADMIN_LOGIN, 'admin', 0)
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'token': token, 'role': 'admin', 'user_id': 0})}

        pwd_hash = hashlib.sha256(password.encode()).hexdigest()
        cur.execute(
            f"SELECT id, login, full_name, access_key FROM {SCHEMA}.admin_users WHERE login=%s AND password_hash=%s AND is_active=TRUE",
            (login, pwd_hash)
        )
        user = cur.fetchone()

        if not user:
            fail()
            cur.close(); conn.close()
            return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный логин или пароль'})}

        if not user['access_key']:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Для пользователя не сформирован ключ доступа. Обратитесь к администратору.', 'code': 'no_key_configured'})}

        if not access_key:
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Требуется файл ключа доступа', 'code': 'key_required'})}

        if not hmac.compare_digest(access_key, user['access_key']):
            fail()
            cur.close(); conn.close()
            return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'Неверный файл ключа доступа', 'code': 'key_invalid'})}

        cur.execute(f"DELETE FROM {SCHEMA}.login_attempts WHERE login_key=%s", (key,))
        conn.commit()
        cur.close(); conn.close()
        global _cached_users, _cached_ts
        _cached_users = None  # сброс кэша
        token = make_token(user['login'], 'user', user['id'])
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({
            'token': token, 'role': 'user', 'user_id': user['id'], 'login': user['login'], 'full_name': user['full_name']
        })}

    return {'statusCode': 405, 'headers': CORS, 'body': ''}
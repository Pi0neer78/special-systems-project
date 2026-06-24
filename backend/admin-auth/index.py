import json
import os
import hashlib
import hmac
import time

ADMIN_LOGIN = 'Pioneer78'
ADMIN_PASSWORD = 'Tytparol1!'
SECRET_KEY = 'specsystems_admin_secret_2026'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
}


def make_token(login: str) -> str:
    ts = str(int(time.time() // 3600))
    payload = f"{login}:{ts}:{SECRET_KEY}"
    return hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()


def verify_token(token: str) -> bool:
    for delta in [0, -1]:
        ts = str(int(time.time() // 3600) + delta)
        payload = f"{ADMIN_LOGIN}:{ts}:{SECRET_KEY}"
        expected = hmac.new(SECRET_KEY.encode(), payload.encode(), digestmod=hashlib.sha256).hexdigest()
        if hmac.compare_digest(token or '', expected):
            return True
    return False


def handler(event: dict, context) -> dict:
    """Авторизация администратора панели управления."""
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    method = event.get('httpMethod', 'GET')
    path = event.get('path', '/')

    # Проверка токена
    if path.endswith('/verify'):
        token = (event.get('headers') or {}).get('X-Admin-Token', '')
        if verify_token(token):
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True})}
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'ok': False})}

    # Логин
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')
        login = body.get('login', '')
        password = body.get('password', '')
        if login == ADMIN_LOGIN and password == ADMIN_PASSWORD:
            token = make_token(login)
            return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'token': token})}
        return {'statusCode': 401, 'headers': CORS, 'body': json.dumps({'error': 'Неверный логин или пароль'})}

    return {'statusCode': 405, 'headers': CORS, 'body': ''}
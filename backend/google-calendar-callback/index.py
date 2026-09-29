import json
import os
import time
import hashlib
import hmac
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta, timezone
import requests

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
ADMIN_LOGIN = 'Pioneer78'
SECRET_KEY = 'specsystems_admin_secret_2026'

TOKEN_URL = 'https://oauth2.googleapis.com/token'
USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def decode_token(token: str, conn) -> dict:
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


def html_redirect(status: str, message: str) -> dict:
    body = f"""<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#0f0f10;color:#eee">
<div style="text-align:center">
<p>{message}</p>
<script>
try {{ window.opener && window.opener.postMessage({{ gcal: "{status}" }}, "*"); }} catch(e) {{}}
window.location.replace("/work-panel?gcal={status}");
</script>
</div></body></html>"""
    return {'statusCode': 200, 'headers': {'Content-Type': 'text/html; charset=utf-8'}, 'body': body}


def handler(event: dict, context) -> dict:
    """Публичный callback для OAuth Google Calendar. Принимает code/state от Google, обменивает на токены, сохраняет в БД.
    GET ?code=...&state=<admin_token> — успешный ответ от Google
    GET ?error=... — пользователь отменил авторизацию
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type'}, 'body': ''}

    qs = event.get('queryStringParameters') or {}
    if qs.get('error'):
        return html_redirect('error', 'Авторизация отменена. Можно закрыть окно.')

    code = qs.get('code')
    state = qs.get('state')
    if not code or not state:
        return html_redirect('error', 'Некорректный ответ от Google. Можно закрыть окно.')

    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
    redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI')
    if not client_id or not client_secret or not redirect_uri:
        return html_redirect('error', 'Интеграция с Google Calendar не настроена. Обратитесь к администратору.')

    conn = get_conn()
    try:
        caller = decode_token(state, conn)
        if not caller:
            return html_redirect('error', 'Сессия истекла. Войдите в панель заново и повторите подключение.')

        token_resp = requests.post(TOKEN_URL, data={
            'code': code,
            'client_id': client_id,
            'client_secret': client_secret,
            'redirect_uri': redirect_uri,
            'grant_type': 'authorization_code',
        }, timeout=10)
        if not token_resp.ok:
            return html_redirect('error', 'Не удалось получить доступ от Google. Попробуйте снова.')
        tokens = token_resp.json()
        access_token = tokens.get('access_token')
        refresh_token = tokens.get('refresh_token')
        expires_in = tokens.get('expires_in', 3600)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        google_email = None
        try:
            ui_resp = requests.get(USERINFO_URL, headers={'Authorization': f'Bearer {access_token}'}, timeout=10)
            if ui_resp.ok:
                google_email = ui_resp.json().get('email')
        except requests.RequestException:
            pass

        cur = conn.cursor(cursor_factory=RealDictCursor)
        if refresh_token:
            cur.execute(f"""
                INSERT INTO {SCHEMA}.google_calendar_accounts
                  (admin_user_id, google_email, access_token, refresh_token, token_expires_at, updated_at)
                VALUES (%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (admin_user_id) DO UPDATE SET
                  google_email=EXCLUDED.google_email,
                  access_token=EXCLUDED.access_token,
                  refresh_token=EXCLUDED.refresh_token,
                  token_expires_at=EXCLUDED.token_expires_at,
                  updated_at=NOW()
            """, (caller['user_id'], google_email, access_token, refresh_token, expires_at))
        else:
            cur.execute(f"""
                UPDATE {SCHEMA}.google_calendar_accounts SET
                  google_email=%s, access_token=%s, token_expires_at=%s, updated_at=NOW()
                WHERE admin_user_id=%s
            """, (google_email, access_token, expires_at, caller['user_id']))
        conn.commit()
        cur.close()
        return html_redirect('success', 'Google Calendar подключён! Можно закрыть окно.')
    finally:
        conn.close()

import json
import os
import time
import hashlib
import hmac
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime, timedelta, timezone, date
import requests
from urllib.parse import urlencode

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
ADMIN_LOGIN = 'Pioneer78'
SECRET_KEY = 'specsystems_admin_secret_2026'
TIMEZONE = 'Europe/Moscow'

AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
TOKEN_URL = 'https://oauth2.googleapis.com/token'
EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/{cal}/events'
EVENT_URL = 'https://www.googleapis.com/calendar/v3/calendars/{cal}/events/{eid}'
SCOPE = 'https://www.googleapis.com/auth/calendar.events'

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
}


def ok(data):
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps(data, default=str, ensure_ascii=False)}


def err(msg, code=400):
    return {'statusCode': code, 'headers': CORS, 'body': json.dumps({'error': msg}, ensure_ascii=False)}


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


def get_account(cur, user_id):
    cur.execute(f"SELECT * FROM {SCHEMA}.google_calendar_accounts WHERE admin_user_id=%s", (user_id,))
    return cur.fetchone()


def get_valid_access_token(cur, conn, account):
    """Возвращает актуальный access_token, обновляя его через refresh_token при необходимости."""
    expires_at = account['token_expires_at']
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at > datetime.now(timezone.utc) + timedelta(seconds=60):
        return account['access_token']

    client_id = os.environ.get('GOOGLE_CLIENT_ID')
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET')
    resp = requests.post(TOKEN_URL, data={
        'client_id': client_id,
        'client_secret': client_secret,
        'refresh_token': account['refresh_token'],
        'grant_type': 'refresh_token',
    }, timeout=10)
    if not resp.ok:
        return None
    data = resp.json()
    new_token = data.get('access_token')
    expires_in = data.get('expires_in', 3600)
    new_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    cur.execute(f"""
        UPDATE {SCHEMA}.google_calendar_accounts SET access_token=%s, token_expires_at=%s, updated_at=NOW()
        WHERE admin_user_id=%s
    """, (new_token, new_expires_at, account['admin_user_id']))
    conn.commit()
    return new_token


def task_to_event_body(task):
    title = task['title'] or 'Без названия'
    description = task.get('description') or ''
    due_date = task['due_date']
    if isinstance(due_date, str):
        due_date = date.fromisoformat(due_date)
    body = {'summary': title, 'description': description}
    if task.get('all_day', True) or not task.get('due_time'):
        end_date = due_date + timedelta(days=1)
        body['start'] = {'date': due_date.isoformat()}
        body['end'] = {'date': end_date.isoformat()}
    else:
        due_time = task['due_time']
        time_str = due_time if isinstance(due_time, str) else due_time.strftime('%H:%M:%S')
        start_dt = f"{due_date.isoformat()}T{time_str}"
        body['start'] = {'dateTime': start_dt, 'timeZone': TIMEZONE}
        end_hour_dt = datetime.combine(due_date, datetime.min.time()) + timedelta(hours=int(time_str[:2]) + 1, minutes=int(time_str[3:5]))
        body['end'] = {'dateTime': end_hour_dt.isoformat(), 'timeZone': TIMEZONE}
    return body


def event_to_task_fields(ev):
    title = ev.get('summary') or 'Без названия'
    description = ev.get('description') or ''
    is_birthday = ev.get('eventType') == 'birthday'
    start = ev.get('start', {})
    if 'date' in start:
        return {'title': title, 'description': description, 'due_date': start['date'], 'due_time': None, 'all_day': True, 'is_birthday': is_birthday}
    dt = start.get('dateTime', '')
    d_part, t_part = dt.split('T') if 'T' in dt else (dt, None)
    t_part = t_part[:8] if t_part else None
    return {'title': title, 'description': description, 'due_date': d_part, 'due_time': t_part, 'all_day': False, 'is_birthday': is_birthday}


def gcal_list_events(access_token, calendar_id, date_from, date_to):
    time_min = f"{date_from}T00:00:00Z"
    time_max = f"{date_to}T23:59:59Z"
    url = EVENTS_URL.format(cal=calendar_id)
    params = {'timeMin': time_min, 'timeMax': time_max, 'singleEvents': 'true', 'maxResults': 250}
    resp = requests.get(f"{url}?{urlencode(params)}", headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
    if not resp.ok:
        return None
    return resp.json().get('items', [])


def gcal_insert_event(access_token, calendar_id, body):
    url = EVENTS_URL.format(cal=calendar_id)
    resp = requests.post(url, headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}, json=body, timeout=15)
    if not resp.ok:
        print(f"GCAL_INSERT_FAILED status={resp.status_code} body={resp.text}")
        return None
    return resp.json()


def gcal_update_event(access_token, calendar_id, event_id, body):
    url = EVENT_URL.format(cal=calendar_id, eid=event_id)
    resp = requests.patch(url, headers={'Authorization': f'Bearer {access_token}', 'Content-Type': 'application/json'}, json=body, timeout=15)
    if not resp.ok:
        print(f"GCAL_UPDATE_FAILED status={resp.status_code} event_id={event_id} body={resp.text}")
        try:
            reason = resp.json().get('error', {}).get('errors', [{}])[0].get('reason', '')
        except Exception:
            reason = ''
        if reason == 'eventTypeRestriction':
            return 'SKIP_SPECIAL_EVENT'
        return None
    return resp.json()


def handler(event: dict, context) -> dict:
    """Интеграция задач с Google Calendar.
    GET  ?resource=status — статус подключения аккаунта
    GET  ?resource=auth-url — ссылка для OAuth-авторизации Google
    POST ?resource=disconnect — отключить аккаунт
    POST ?resource=sync { direction: to_google|from_google|both, date_from, date_to } — синхронизация задач за диапазон дат
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    token = (event.get('headers') or {}).get('X-Admin-Token', '')
    method = event.get('httpMethod', 'GET')
    qs = event.get('queryStringParameters') or {}
    resource = qs.get('resource', '')
    body = {}
    if method == 'POST':
        body = json.loads(event.get('body') or '{}')

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        caller = decode_token(token, conn)
        if not caller:
            return err('Unauthorized', 401)
        user_id = caller['user_id']

        if resource == 'status' and method == 'GET':
            acc = get_account(cur, user_id)
            if not acc:
                return ok({'connected': False})
            return ok({'connected': True, 'google_email': acc['google_email'], 'calendar_id': acc['calendar_id']})

        if resource == 'auth-url' and method == 'GET':
            client_id = os.environ.get('GOOGLE_CLIENT_ID')
            redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI')
            if not client_id or not redirect_uri:
                return err('Интеграция с Google Calendar не настроена', 500)
            params = {
                'client_id': client_id,
                'redirect_uri': redirect_uri,
                'response_type': 'code',
                'scope': SCOPE,
                'access_type': 'offline',
                'prompt': 'consent',
                'state': token,
            }
            return ok({'url': f"{AUTH_BASE_URL}?{urlencode(params)}"})

        if resource == 'disconnect' and method == 'POST':
            cur.execute(f"DELETE FROM {SCHEMA}.google_calendar_task_links WHERE admin_user_id=%s", (user_id,))
            cur.execute(f"DELETE FROM {SCHEMA}.google_calendar_accounts WHERE admin_user_id=%s", (user_id,))
            conn.commit()
            return ok({'ok': True})

        if resource == 'sync' and method == 'POST':
            direction = body.get('direction', 'both')
            date_from = body.get('date_from')
            date_to = body.get('date_to')
            if direction not in ('to_google', 'from_google', 'both'):
                return err('Некорректное направление синхронизации')
            if not date_from or not date_to:
                return err('Укажите диапазон дат для синхронизации')

            acc = get_account(cur, user_id)
            if not acc:
                return err('Google Calendar не подключён', 400)
            access_token = get_valid_access_token(cur, conn, acc)
            if not access_token:
                return err('Не удалось обновить доступ к Google. Переподключите аккаунт.', 400)
            calendar_id = acc['calendar_id']

            synced_to = 0
            synced_from = 0
            errors = []

            cur.execute(f"SELECT task_id, google_event_id FROM {SCHEMA}.google_calendar_task_links WHERE admin_user_id=%s", (user_id,))
            links_by_task = {r['task_id']: r['google_event_id'] for r in cur.fetchall()}
            links_by_event = {v: k for k, v in links_by_task.items()}

            if direction in ('to_google', 'both'):
                cur.execute(f"""
                    SELECT id, title, description, status, due_date, due_time, all_day, updated_at
                    FROM {SCHEMA}.tasks
                    WHERE is_archived=FALSE AND is_birthday=FALSE AND due_date BETWEEN %s AND %s
                      AND (author_id=%s OR assignee_id=%s)
                """, (date_from, date_to, user_id, user_id))
                tasks = cur.fetchall()
                for t in tasks:
                    try:
                        ev_body = task_to_event_body(t)
                        existing_event_id = links_by_task.get(t['id'])
                        if existing_event_id:
                            res = gcal_update_event(access_token, calendar_id, existing_event_id, ev_body)
                            if res == 'SKIP_SPECIAL_EVENT':
                                continue
                        else:
                            res = gcal_insert_event(access_token, calendar_id, ev_body)
                        if not res:
                            errors.append(f"Задача #{t['id']}: ошибка Google Calendar")
                            continue
                        event_id = res.get('id', existing_event_id)
                        cur.execute(f"""
                            INSERT INTO {SCHEMA}.google_calendar_task_links
                              (admin_user_id, task_id, google_event_id, last_synced_at, last_task_updated_at, last_event_updated_at)
                            VALUES (%s,%s,%s,NOW(),%s,NOW())
                            ON CONFLICT (task_id) DO UPDATE SET
                              google_event_id=EXCLUDED.google_event_id,
                              last_synced_at=NOW(),
                              last_task_updated_at=EXCLUDED.last_task_updated_at,
                              last_event_updated_at=NOW()
                        """, (user_id, t['id'], event_id, t['updated_at']))
                        conn.commit()
                        synced_to += 1
                    except Exception as e:
                        errors.append(f"Задача #{t['id']}: {str(e)}")

            if direction in ('from_google', 'both'):
                events = gcal_list_events(access_token, calendar_id, date_from, date_to)
                if events is None:
                    errors.append('Не удалось получить события из Google Calendar')
                else:
                    for ev in events:
                        ev_id = ev.get('id')
                        if not ev_id or ev.get('status') == 'cancelled':
                            continue
                        try:
                            fields = event_to_task_fields(ev)
                            existing_task_id = links_by_event.get(ev_id)
                            if existing_task_id:
                                cur.execute(f"""
                                    UPDATE {SCHEMA}.tasks SET title=%s, description=%s, due_date=%s, due_time=%s, all_day=%s, is_birthday=%s, updated_at=NOW()
                                    WHERE id=%s
                                """, (fields['title'], fields['description'], fields['due_date'], fields['due_time'], fields['all_day'], fields['is_birthday'], existing_task_id))
                                cur.execute(f"""
                                    UPDATE {SCHEMA}.google_calendar_task_links SET last_synced_at=NOW(), last_event_updated_at=NOW()
                                    WHERE task_id=%s
                                """, (existing_task_id,))
                            else:
                                cur.execute(f"""
                                    INSERT INTO {SCHEMA}.tasks
                                      (title, description, status, color, due_date, due_time, all_day, author_id, assignee_id, is_birthday)
                                    VALUES (%s,%s,'new','blue',%s,%s,%s,%s,%s,%s)
                                    RETURNING id
                                """, (fields['title'], fields['description'], fields['due_date'], fields['due_time'], fields['all_day'], user_id, user_id, fields['is_birthday']))
                                new_task_id = cur.fetchone()['id']
                                cur.execute(f"""
                                    INSERT INTO {SCHEMA}.google_calendar_task_links
                                      (admin_user_id, task_id, google_event_id, last_synced_at, last_event_updated_at)
                                    VALUES (%s,%s,%s,NOW(),NOW())
                                    ON CONFLICT (admin_user_id, google_event_id) DO NOTHING
                                """, (user_id, new_task_id, ev_id))
                            conn.commit()
                            synced_from += 1
                        except Exception as e:
                            errors.append(f"Событие {ev.get('summary','?')}: {str(e)}")

            if errors:
                print(f"GCAL_SYNC_ERRORS user_id={user_id} direction={direction} range={date_from}..{date_to}: {errors}")
            return ok({'ok': True, 'synced_to_google': synced_to, 'synced_from_google': synced_from, 'errors': errors})

        return err('Unknown resource', 404)
    finally:
        cur.close()
        conn.close()
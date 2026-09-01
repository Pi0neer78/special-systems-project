import json
import os
import hashlib
import hmac
import time
import base64
import uuid
import psycopg2
import boto3
from psycopg2.extras import RealDictCursor

SCHEMA = os.environ.get('MAIN_DB_SCHEMA', 't_p34673685_special_systems_proj')
ADMIN_LOGIN = 'Pioneer78'
SECRET_KEY = 'specsystems_admin_secret_2026'
S3_BUCKET = 'files'


def get_s3():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def cdn_url(key: str) -> str:
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def delete_s3_object(file_url: str):
    prefix = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/"
    if not file_url.startswith(prefix):
        return
    key = file_url[len(prefix):]
    try:
        get_s3().delete_object(Bucket=S3_BUCKET, Key=key)
    except Exception:
        pass

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
    rows = [{'user_id': r['id'], 'login': r['login'], 'role': 'admin' if r['id'] == 0 else 'user'} for r in cur.fetchall()]
    cur.close()

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
                if method == 'DELETE':
                    # Собираем все вложенные подпапки (рекурсивно)
                    folder_ids = [int(rid)]
                    frontier = [int(rid)]
                    while frontier:
                        cur.execute(f"SELECT id FROM {SCHEMA}.credential_folders WHERE parent_id = ANY(%s)", [frontier])
                        children = [r['id'] for r in cur.fetchall()]
                        folder_ids.extend(children)
                        frontier = children
                    # Удаляем файлы всех credentials из этих папок
                    cur.execute(f"SELECT id FROM {SCHEMA}.credentials WHERE folder_id = ANY(%s)", [folder_ids])
                    cred_ids = [r['id'] for r in cur.fetchall()]
                    if cred_ids:
                        cur.execute(f"SELECT file_url FROM {SCHEMA}.credential_files WHERE credential_id = ANY(%s)", [cred_ids])
                        for r in cur.fetchall():
                            delete_s3_object(r['file_url'])
                        cur.execute(f"DELETE FROM {SCHEMA}.credential_files WHERE credential_id = ANY(%s)", [cred_ids])
                        cur.execute(f"DELETE FROM {SCHEMA}.credentials WHERE id = ANY(%s)", [cred_ids])
                    cur.execute(f"DELETE FROM {SCHEMA}.credential_folders WHERE id = ANY(%s)", [folder_ids])
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
                            FROM {SCHEMA}.credentials WHERE folder_id=%s AND is_files_container=FALSE ORDER BY name
                        """, [folder_id])
                    else:
                        cur.execute(f"""
                            SELECT id, folder_id, name, login, password,
                                   login1, password1, login2, password2,
                                   login3, password3, ip, notes
                            FROM {SCHEMA}.credentials WHERE is_files_container=FALSE ORDER BY name
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
                if method == 'DELETE':
                    cur.execute(f"SELECT is_files_container FROM {SCHEMA}.credentials WHERE id=%s", [rid])
                    row0 = cur.fetchone()
                    if not row0:
                        return err('Not found', 404)
                    if row0['is_files_container']:
                        return err('Служебная запись файлов не может быть удалена', 400)
                    cur.execute(f"SELECT file_url FROM {SCHEMA}.credential_files WHERE credential_id=%s", [rid])
                    for r in cur.fetchall():
                        delete_s3_object(r['file_url'])
                    cur.execute(f"DELETE FROM {SCHEMA}.credential_files WHERE credential_id=%s", [rid])
                    cur.execute(f"DELETE FROM {SCHEMA}.credentials WHERE id=%s RETURNING id", [rid])
                    conn.commit()
                    row = cur.fetchone()
                    return ok({'ok': True}) if row else err('Not found', 404)

        # ── FILES CONTAINER (служебная неудаляемая запись «ФАЙЛЫ» на раздел) ────
        if resource == 'files-container':
            if method == 'GET':
                folder_id = qs.get('folder_id', '')
                if not folder_id:
                    return err('folder_id required')
                cur.execute(f"""
                    SELECT id, folder_id, name FROM {SCHEMA}.credentials
                    WHERE folder_id=%s AND is_files_container=TRUE
                """, [folder_id])
                row = cur.fetchone()
                if row:
                    return ok(dict(row))
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.credentials (folder_id, name, is_files_container)
                    VALUES (%s, '(ФАЙЛЫ)', TRUE)
                    RETURNING id, folder_id, name
                """, [folder_id])
                conn.commit()
                return ok(dict(cur.fetchone()))

        # ── CREDENTIAL FILES ────────────────────────────────────────────────────
        if resource == 'files':
            if method == 'GET':
                credential_id = qs.get('credential_id', '')
                if not credential_id:
                    return err('credential_id required')
                cur.execute(f"""
                    SELECT id, credential_id, file_name, file_url, file_size, content_type, created_at
                    FROM {SCHEMA}.credential_files WHERE credential_id=%s ORDER BY created_at DESC
                """, [credential_id])
                return ok([dict(r) for r in cur.fetchall()])
            if method == 'POST':
                credential_id = body.get('credential_id')
                file_name = body.get('file_name', 'file')
                content_type = body.get('content_type', 'application/octet-stream')
                data_b64 = body.get('data', '')
                if not credential_id or not data_b64:
                    return err('credential_id and data required')
                raw = base64.b64decode(data_b64.split(',')[-1])
                ext = ''
                if '.' in file_name:
                    ext = '.' + file_name.rsplit('.', 1)[-1]
                key = f"credentials/{credential_id}/{uuid.uuid4().hex}{ext}"
                get_s3().put_object(Bucket=S3_BUCKET, Key=key, Body=raw, ContentType=content_type)
                url = cdn_url(key)
                cur.execute(f"""
                    INSERT INTO {SCHEMA}.credential_files (credential_id, file_name, file_url, file_size, content_type)
                    VALUES (%s,%s,%s,%s,%s)
                    RETURNING id, credential_id, file_name, file_url, file_size, content_type, created_at
                """, (credential_id, file_name, url, len(raw), content_type))
                conn.commit()
                return ok(dict(cur.fetchone()))
            if method == 'DELETE' and rid:
                cur.execute(f"SELECT file_url FROM {SCHEMA}.credential_files WHERE id=%s", [rid])
                row = cur.fetchone()
                if not row:
                    return err('Not found', 404)
                delete_s3_object(row['file_url'])
                cur.execute(f"DELETE FROM {SCHEMA}.credential_files WHERE id=%s", [rid])
                conn.commit()
                return ok({'ok': True})

        # ── UPDATES (список клиентов с базами для раздела Обновления) ───────────
        if resource == 'updates':
            if method == 'GET':
                filter_client_id = qs.get('client_id', '')
                where_sql = f"WHERE c.id = {int(filter_client_id)}" if filter_client_id else ""
                cur.execute(f"""
                    SELECT
                        cd.id AS client_db_id,
                        c.id AS client_id,
                        c.parent_id AS client_parent_id,
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
                    {where_sql}
                    ORDER BY COALESCE(c.parent_id, c.id), c.parent_id NULLS FIRST, c.name, db.config_name
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
                cur.execute(f"SELECT id, login, full_name FROM {SCHEMA}.admin_users WHERE is_active=TRUE ORDER BY (id=0) DESC, full_name")
                users = [dict(r) for r in cur.fetchall()]
                return ok(users)

        return err('Unknown resource', 404)

    finally:
        cur.close()
        conn.close()
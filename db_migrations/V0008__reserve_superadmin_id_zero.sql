-- Резервируем id=0 для супер-админа (Pioneer78), чтобы FK author_id/assignee_id могли ссылаться на него напрямую
SELECT setval(pg_get_serial_sequence('t_p34673685_special_systems_proj.admin_users', 'id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM t_p34673685_special_systems_proj.admin_users), 1));

INSERT INTO t_p34673685_special_systems_proj.admin_users (id, login, password_hash, is_active, full_name)
VALUES (0, 'Pioneer78', 'external_auth_no_password', TRUE, 'Администратор')
ON CONFLICT (id) DO NOTHING;

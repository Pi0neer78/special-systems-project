ALTER TABLE t_p34673685_special_systems_proj.admin_users
  ADD COLUMN IF NOT EXISTS access_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS access_key_created_at TIMESTAMPTZ NULL;
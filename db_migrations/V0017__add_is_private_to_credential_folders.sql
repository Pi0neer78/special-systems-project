ALTER TABLE t_p34673685_special_systems_proj.credential_folders
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE;
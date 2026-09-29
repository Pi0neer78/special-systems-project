ALTER TABLE t_p34673685_special_systems_proj.google_calendar_accounts
  RENAME COLUMN user_id TO admin_user_id;

ALTER TABLE t_p34673685_special_systems_proj.google_calendar_accounts
  RENAME COLUMN token_expiry TO token_expires_at;

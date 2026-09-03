ALTER TABLE t_p34673685_special_systems_proj.client_databases
    ADD COLUMN IF NOT EXISTS db_type VARCHAR(20) NOT NULL DEFAULT 'file'
    CHECK (db_type IN ('file', 'server', 'http'));
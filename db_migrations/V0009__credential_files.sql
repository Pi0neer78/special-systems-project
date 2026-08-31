CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.credential_files (
    id SERIAL PRIMARY KEY,
    credential_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.credentials(id),
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    content_type VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credential_files_credential_id
    ON t_p34673685_special_systems_proj.credential_files(credential_id);

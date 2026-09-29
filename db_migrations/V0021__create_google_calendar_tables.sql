CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.google_calendar_accounts (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.admin_users(id),
    google_email VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    calendar_id VARCHAR(255) NOT NULL DEFAULT 'primary',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (admin_user_id)
);

CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.google_calendar_task_links (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.admin_users(id),
    task_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.tasks(id),
    google_event_id VARCHAR(255) NOT NULL,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_task_updated_at TIMESTAMPTZ,
    last_event_updated_at TIMESTAMPTZ,
    UNIQUE (task_id),
    UNIQUE (admin_user_id, google_event_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_links_user ON t_p34673685_special_systems_proj.google_calendar_task_links(admin_user_id);

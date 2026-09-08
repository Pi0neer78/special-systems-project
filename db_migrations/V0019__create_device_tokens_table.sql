CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.device_tokens (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL,
    fcm_token TEXT NOT NULL,
    platform VARCHAR(20) DEFAULT 'android',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (admin_user_id, fcm_token)
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON t_p34673685_special_systems_proj.device_tokens(admin_user_id);

CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.login_attempts (
    id BIGSERIAL PRIMARY KEY,
    login_key VARCHAR(150) NOT NULL,
    ip VARCHAR(64) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_key ON t_p34673685_special_systems_proj.login_attempts(login_key, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON t_p34673685_special_systems_proj.login_attempts(ip, created_at);
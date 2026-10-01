CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.ticket_history (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL,
    actor_name VARCHAR(200),
    field VARCHAR(40) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket ON t_p34673685_special_systems_proj.ticket_history (ticket_id, created_at);
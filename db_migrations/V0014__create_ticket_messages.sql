CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.ticket_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.tickets(id),
    sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('client', 'staff')),
    sender_id INTEGER NOT NULL,
    sender_name VARCHAR(255) NULL,
    message TEXT NULL,
    file_url TEXT NULL,
    file_name VARCHAR(255) NULL,
    file_size INTEGER NULL,
    content_type VARCHAR(100) NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON t_p34673685_special_systems_proj.ticket_messages(ticket_id);
CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.ticket_client_reads (
    ticket_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, client_id)
);
INSERT INTO t_p34673685_special_systems_proj.ticket_client_reads (ticket_id, client_id, last_read_message_id)
SELECT t.id, t.client_id, COALESCE(MAX(m.id), 0)
FROM t_p34673685_special_systems_proj.tickets t
LEFT JOIN t_p34673685_special_systems_proj.ticket_messages m ON m.ticket_id = t.id AND m.sender_type = 'staff'
GROUP BY t.id, t.client_id
ON CONFLICT DO NOTHING;
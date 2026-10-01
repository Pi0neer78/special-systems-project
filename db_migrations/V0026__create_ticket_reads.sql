CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.ticket_reads (
    ticket_id INTEGER NOT NULL,
    staff_id INTEGER NOT NULL,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (ticket_id, staff_id)
);
INSERT INTO t_p34673685_special_systems_proj.ticket_reads (ticket_id, staff_id, last_read_message_id)
SELECT t.id, u.id, COALESCE(MAX(m.id), 0)
FROM t_p34673685_special_systems_proj.tickets t
CROSS JOIN t_p34673685_special_systems_proj.admin_users u
LEFT JOIN t_p34673685_special_systems_proj.ticket_messages m ON m.ticket_id = t.id AND m.sender_type = 'client'
GROUP BY t.id, u.id
ON CONFLICT DO NOTHING;
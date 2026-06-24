CREATE TABLE t_p34673685_special_systems_proj.tickets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.clients(id),
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  problem_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  deadline TIMESTAMP WITH TIME ZONE NULL,
  extra_info TEXT NULL,
  result TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'cancelled')),
  resolved_at TIMESTAMP WITH TIME ZONE NULL,
  status_changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assignee_id INTEGER NULL REFERENCES t_p34673685_special_systems_proj.admin_users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_client_id ON t_p34673685_special_systems_proj.tickets(client_id);
CREATE INDEX idx_tickets_status ON t_p34673685_special_systems_proj.tickets(status);
CREATE INDEX idx_tickets_assignee_id ON t_p34673685_special_systems_proj.tickets(assignee_id);

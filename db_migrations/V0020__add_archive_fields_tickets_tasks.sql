ALTER TABLE t_p34673685_special_systems_proj.tickets
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE NULL;

ALTER TABLE t_p34673685_special_systems_proj.tasks
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_archived ON t_p34673685_special_systems_proj.tickets(is_archived);
CREATE INDEX IF NOT EXISTS idx_tasks_archived ON t_p34673685_special_systems_proj.tasks(is_archived);

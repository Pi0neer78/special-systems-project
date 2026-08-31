CREATE TABLE t_p34673685_special_systems_proj.tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'new',
    color VARCHAR(20) NOT NULL DEFAULT 'blue',
    due_date DATE,
    due_time TIME,
    all_day BOOLEAN NOT NULL DEFAULT TRUE,
    repeat_rule VARCHAR(20) NOT NULL DEFAULT 'none',
    repeat_until DATE,
    author_id INTEGER REFERENCES t_p34673685_special_systems_proj.admin_users(id),
    assignee_id INTEGER REFERENCES t_p34673685_special_systems_proj.admin_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p34673685_special_systems_proj.task_watchers (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.tasks(id),
    user_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.admin_users(id),
    UNIQUE(task_id, user_id)
);

CREATE INDEX idx_tasks_status ON t_p34673685_special_systems_proj.tasks(status);
CREATE INDEX idx_tasks_assignee ON t_p34673685_special_systems_proj.tasks(assignee_id);
CREATE INDEX idx_tasks_due_date ON t_p34673685_special_systems_proj.tasks(due_date);
CREATE INDEX idx_task_watchers_task ON t_p34673685_special_systems_proj.task_watchers(task_id);

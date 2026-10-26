CREATE TABLE t_p34673685_special_systems_proj.planned_works (
    id SERIAL PRIMARY KEY,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    client_id INTEGER REFERENCES t_p34673685_special_systems_proj.clients(id),
    description TEXT NOT NULL DEFAULT '',
    period_type VARCHAR(20) NOT NULL DEFAULT 'weekdays',
    weekdays INTEGER[] NOT NULL DEFAULT '{}',
    month_days INTEGER[] NOT NULL DEFAULT '{}',
    run_time TIME NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p34673685_special_systems_proj.planned_work_assignees (
    planned_work_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.planned_works(id),
    user_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.admin_users(id),
    PRIMARY KEY (planned_work_id, user_id)
);

ALTER TABLE t_p34673685_special_systems_proj.tasks ADD COLUMN planned_work_id INTEGER NULL;
CREATE INDEX idx_tasks_planned_work ON t_p34673685_special_systems_proj.tasks(planned_work_id);

CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.user_clients (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.admin_users(id) ON UPDATE CASCADE,
  client_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.clients(id) ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, client_id)
);


CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.admin_users (
  id SERIAL PRIMARY KEY,
  login VARCHAR(100) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  phone VARCHAR(30),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.clients (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES t_p34673685_special_systems_proj.clients(id) ON UPDATE CASCADE,
  name VARCHAR(255) NOT NULL,
  login VARCHAR(100) UNIQUE,
  password_hash TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  inn VARCHAR(20),
  address TEXT,
  director_name VARCHAR(255),
  director_phone VARCHAR(30),
  director_email VARCHAR(255),
  accountant_name VARCHAR(255),
  accountant_phone VARCHAR(30),
  accountant_email VARCHAR(255),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(30),
  contact_email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.config_databases (
  id SERIAL PRIMARY KEY,
  config_name VARCHAR(255) NOT NULL,
  min_platform_version VARCHAR(50),
  actual_config_version VARCHAR(50),
  update_release_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS t_p34673685_special_systems_proj.client_databases (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.clients(id) ON UPDATE CASCADE,
  config_database_id INTEGER NOT NULL REFERENCES t_p34673685_special_systems_proj.config_databases(id) ON UPDATE CASCADE,
  current_config_version VARCHAR(50),
  update_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

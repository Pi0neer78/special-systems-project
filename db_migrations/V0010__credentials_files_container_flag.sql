ALTER TABLE t_p34673685_special_systems_proj.credentials
    ADD COLUMN IF NOT EXISTS is_files_container BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_files_container_per_folder
    ON t_p34673685_special_systems_proj.credentials(folder_id)
    WHERE is_files_container = TRUE;

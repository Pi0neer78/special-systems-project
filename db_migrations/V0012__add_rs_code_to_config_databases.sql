ALTER TABLE t_p34673685_special_systems_proj.config_databases
  ADD COLUMN IF NOT EXISTS rs_code VARCHAR(50) NULL;

COMMENT ON COLUMN t_p34673685_special_systems_proj.config_databases.rs_code IS 'Код конфигурации в датасете rial-soft.ru/products/version для автопроверки версий (Accounting, HRM, Trade, SmallBusiness, Retail, ComplexAutomation, ERP, DocFlow)';

UPDATE t_p34673685_special_systems_proj.config_databases SET rs_code = 'Accounting' WHERE config_name IN ('Бухгалтерия предприятия, редакция 3.0 Проф', 'Бухгалтерия предприятия, редакция 3.0 Корп');
UPDATE t_p34673685_special_systems_proj.config_databases SET rs_code = 'Retail' WHERE config_name = 'Розница 3.0 Проф';
UPDATE t_p34673685_special_systems_proj.config_databases SET rs_code = 'SmallBusiness' WHERE config_name = 'Управление нашей фирмой, редакция 3.0 Проф';
UPDATE t_p34673685_special_systems_proj.config_databases SET rs_code = 'Trade' WHERE config_name = 'Управление торговлей 11.5 Проф';
UPDATE t_p34673685_special_systems_proj.config_databases SET rs_code = 'HRM' WHERE config_name IN ('Зарплата и Кардры Проф', 'Зарплата и Кадры Корп');
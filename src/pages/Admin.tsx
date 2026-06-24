import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const AUTH_URL = 'https://functions.poehali.dev/115d85ec-a990-4455-824d-27487ad441c1';
const API_URL  = 'https://functions.poehali.dev/b27360bd-f3d5-47be-87bd-a7bec06b9be0';
const TOKEN_KEY = 'admin_token';

// ── helpers ───────────────────────────────────────────────────────────────────

function api(path: string, method = 'GET', body?: object) {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());
}

function Spinner() {
  return <div className="flex justify-center py-12"><div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
}

function Field({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div className={half ? 'col-span-1' : 'col-span-2'}>
      <label className="text-xs text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="col-span-2 text-xs font-mono uppercase text-primary tracking-widest pt-2 border-t border-border mt-1">{children}</div>;
}

const inputCls = 'bg-secondary/40 border-border focus-visible:ring-primary h-8 text-sm';
const switchCls = (active: boolean) =>
  `relative inline-flex w-9 h-5 rounded-full cursor-pointer transition-colors ${active ? 'bg-primary' : 'bg-secondary'}`;

// ── Switch ────────────────────────────────────────────────────────────────────

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={switchCls(checked)}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS SECTION
// ══════════════════════════════════════════════════════════════════════════════

type User = { id: number; login: string; is_active: boolean; phone: string; description: string };

function UsersSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; item?: User }>({ open: false });
  const [form, setForm] = useState({ login: '', password: '', is_active: true, phone: '', description: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/users').then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ login: '', password: '', is_active: true, phone: '', description: '' });
    setModal({ open: true });
  };

  const openEdit = (u: User) => {
    setForm({ login: u.login, password: '', is_active: u.is_active, phone: u.phone || '', description: u.description || '' });
    setModal({ open: true, item: u });
  };

  const save = async () => {
    setSaving(true);
    if (modal.item) {
      await api(`/users/${modal.item.id}`, 'PUT', form);
    } else {
      await api('/users', 'POST', form);
    }
    setSaving(false);
    setModal({ open: false });
    load();
  };

  const toggleActive = async (u: User) => {
    await api(`/users/${u.id}`, 'PATCH');
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl uppercase">Пользователи</h2>
        <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
          <Icon name="Plus" size={15} className="mr-1" /> Добавить
        </Button>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                {['Логин', 'Телефон', 'Описание', 'Активен', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Нет пользователей</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs">{u.login}</td>
                  <td className="px-3 py-2 text-muted-foreground">{u.phone || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">{u.description || '—'}</td>
                  <td className="px-3 py-2">
                    <Switch checked={u.is_active} onChange={() => toggleActive(u)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => openEdit(u)} className="text-muted-foreground hover:text-primary transition-colors p-1">
                      <Icon name="Pencil" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modal.open} onOpenChange={o => setModal({ open: o })}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">
              {modal.item ? 'Редактировать пользователя' : 'Новый пользователь'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Логин *" half>
              <Input value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} className={inputCls} />
            </Field>
            <Field label={modal.item ? 'Новый пароль' : 'Пароль *'} half>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} placeholder={modal.item ? 'Оставьте пустым, чтобы не менять' : ''} />
            </Field>
            <Field label="Телефон" half>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Активен" half>
              <div className="flex items-center h-8 gap-2">
                <Switch checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <span className="text-sm text-muted-foreground">{form.is_active ? 'Да' : 'Нет'}</span>
              </div>
            </Field>
            <Field label="Описание">
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary/40 border-border focus-visible:ring-primary text-sm resize-none" rows={2} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false })} className="border-border">Отмена</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DATABASES SECTION
// ══════════════════════════════════════════════════════════════════════════════

type ConfigDB = { id: number; config_name: string; min_platform_version: string; actual_config_version: string; update_release_date: string };

function DatabasesSection({ onLoaded }: { onLoaded?: (dbs: ConfigDB[]) => void }) {
  const [dbs, setDbs] = useState<ConfigDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; item?: ConfigDB }>({ open: false });
  const [form, setForm] = useState({ config_name: '', min_platform_version: '', actual_config_version: '', update_release_date: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('/databases').then(d => {
      const list = Array.isArray(d) ? d : [];
      setDbs(list);
      if (onLoaded) onLoaded(list);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ config_name: '', min_platform_version: '', actual_config_version: '', update_release_date: '' });
    setModal({ open: true });
  };

  const openEdit = (d: ConfigDB) => {
    setForm({ config_name: d.config_name, min_platform_version: d.min_platform_version || '', actual_config_version: d.actual_config_version || '', update_release_date: d.update_release_date || '' });
    setModal({ open: true, item: d });
  };

  const save = async () => {
    setSaving(true);
    if (modal.item) {
      await api(`/databases/${modal.item.id}`, 'PUT', form);
    } else {
      await api('/databases', 'POST', form);
    }
    setSaving(false);
    setModal({ open: false });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl uppercase">Базы данных (конфигурации)</h2>
        <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
          <Icon name="Plus" size={15} className="mr-1" /> Добавить
        </Button>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                {['Конфигурация', 'Мин. платформа', 'Актуальная версия', 'Дата выхода', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dbs.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">Нет конфигураций</td></tr>
              )}
              {dbs.map(d => (
                <tr key={d.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                  <td className="px-3 py-2 font-medium">{d.config_name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{d.min_platform_version || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.actual_config_version || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{d.update_release_date || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => openEdit(d)} className="text-muted-foreground hover:text-primary transition-colors p-1">
                      <Icon name="Pencil" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modal.open} onOpenChange={o => setModal({ open: o })}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">
              {modal.item ? 'Редактировать конфигурацию' : 'Новая конфигурация'}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Название конфигурации *">
              <Input value={form.config_name} onChange={e => setForm(f => ({ ...f, config_name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Мин. версия платформы" half>
              <Input value={form.min_platform_version} onChange={e => setForm(f => ({ ...f, min_platform_version: e.target.value }))} className={inputCls} placeholder="8.3.26" />
            </Field>
            <Field label="Актуальная версия" half>
              <Input value={form.actual_config_version} onChange={e => setForm(f => ({ ...f, actual_config_version: e.target.value }))} className={inputCls} placeholder="3.0.71" />
            </Field>
            <Field label="Дата выхода обновления">
              <Input type="date" value={form.update_release_date} onChange={e => setForm(f => ({ ...f, update_release_date: e.target.value }))} className={inputCls} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false })} className="border-border">Отмена</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTS SECTION
// ══════════════════════════════════════════════════════════════════════════════

type ClientDB = { id: number; client_id: number; config_database_id: number; config_name: string; current_config_version: string; update_date: string };
type Client = {
  id: number; parent_id: number | null; parent_name: string | null; name: string;
  login: string; is_active: boolean; inn: string; address: string;
  director_name: string; director_phone: string; director_email: string;
  accountant_name: string; accountant_phone: string; accountant_email: string;
  contact_name: string; contact_phone: string; contact_email: string;
  databases: ClientDB[];
};

const emptyClient = {
  parent_id: '', name: '', login: '', password: '', is_active: true, inn: '', address: '',
  director_name: '', director_phone: '', director_email: '',
  accountant_name: '', accountant_phone: '', accountant_email: '',
  contact_name: '', contact_phone: '', contact_email: '',
};

function ClientsSection({ configDbs }: { configDbs: ConfigDB[] }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ open: boolean; item?: Client }>({ open: false });
  const [form, setForm] = useState<typeof emptyClient>(emptyClient);
  const [clientDbs, setClientDbs] = useState<ClientDB[]>([]);
  const [dbModal, setDbModal] = useState<{ open: boolean; item?: ClientDB; clientId?: number }>({ open: false });
  const [dbForm, setDbForm] = useState({ config_database_id: '', current_config_version: '', update_date: '' });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const load = useCallback(() => {
    setLoading(true);
    api('/clients').then(d => { setClients(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(emptyClient);
    setClientDbs([]);
    setModal({ open: true });
  };

  const openEdit = (c: Client) => {
    setForm({
      parent_id: c.parent_id ? String(c.parent_id) : '',
      name: c.name, login: c.login || '', password: '', is_active: c.is_active,
      inn: c.inn || '', address: c.address || '',
      director_name: c.director_name || '', director_phone: c.director_phone || '', director_email: c.director_email || '',
      accountant_name: c.accountant_name || '', accountant_phone: c.accountant_phone || '', accountant_email: c.accountant_email || '',
      contact_name: c.contact_name || '', contact_phone: c.contact_phone || '', contact_email: c.contact_email || '',
    });
    setClientDbs(c.databases || []);
    setModal({ open: true, item: c });
  };

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const s = new Set(prev);
      if (s.has(id)) { s.delete(id); } else { s.add(id); }
      return s;
    });
  };

  const save = async () => {
    setSaving(true);
    const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null };
    let clientId = modal.item?.id;
    if (modal.item) {
      await api(`/clients/${clientId}`, 'PUT', payload);
    } else {
      const res = await api('/clients', 'POST', payload);
      clientId = res.id;
    }
    // save new client dbs (only unsaved ones — those without id)
    for (const db of clientDbs) {
      if (!db.id && clientId) {
        await api(`/clients/${clientId}/db`, 'POST', { config_database_id: db.config_database_id, current_config_version: db.current_config_version, update_date: db.update_date || null });
      } else if (db.id) {
        await api(`/clients/${db.client_id}/db/${db.id}`, 'PUT', { config_database_id: db.config_database_id, current_config_version: db.current_config_version, update_date: db.update_date || null });
      }
    }
    setSaving(false);
    setModal({ open: false });
    load();
  };

  const toggleActive = async (c: Client) => {
    await api(`/clients/${c.id}`, 'PATCH');
    load();
  };

  const addDbRow = () => {
    setClientDbs(prev => [...prev, { id: 0, client_id: modal.item?.id || 0, config_database_id: 0, config_name: '', current_config_version: '', update_date: '' }]);
  };

  const removeDbRow = (idx: number) => {
    setClientDbs(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDbRow = (idx: number, field: string, value: string) => {
    setClientDbs(prev => prev.map((row, i) => {
      if (i !== idx) return row;
      const updated = { ...row, [field]: value };
      if (field === 'config_database_id') {
        const found = configDbs.find(d => d.id === Number(value));
        updated.config_name = found?.config_name || '';
      }
      return updated;
    }));
  };

  // Build tree: roots + children
  const roots = clients.filter(c => !c.parent_id);
  const children = (parentId: number) => clients.filter(c => c.parent_id === parentId);

  const renderRow = (c: Client, depth = 0) => {
    const hasChildren = children(c.id).length > 0;
    const isExpanded = expanded.has(c.id);
    return [
      <tr key={c.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1" style={{ paddingLeft: depth * 16 }}>
            {hasChildren && (
              <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground hover:text-primary p-0.5">
                <Icon name={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={13} />
              </button>
            )}
            {!hasChildren && <span className="w-5" />}
            {depth > 0 && <Icon name="CornerDownRight" size={12} className="text-muted-foreground mr-1" />}
            <span className="font-medium text-sm">{c.name}</span>
          </div>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.inn || '—'}</td>
        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{c.login || '—'}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {(c.databases || []).map(db => (
              <span key={db.id} className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded font-mono">{db.config_name}</span>
            ))}
          </div>
        </td>
        <td className="px-3 py-2"><Switch checked={c.is_active} onChange={() => toggleActive(c)} /></td>
        <td className="px-3 py-2 text-right">
          <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-primary transition-colors p-1">
            <Icon name="Pencil" size={14} />
          </button>
        </td>
      </tr>,
      ...(isExpanded ? children(c.id).flatMap(child => renderRow(child, depth + 1)) : []),
    ];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl uppercase">Клиенты</h2>
        <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
          <Icon name="Plus" size={15} className="mr-1" /> Добавить
        </Button>
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                {['Наименование', 'ИНН', 'Логин', 'Базы данных', 'Активен', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">Нет клиентов</td></tr>
              )}
              {roots.flatMap(c => renderRow(c))}
              {clients.filter(c => c.parent_id && !roots.find(r => r.id === c.parent_id)).map(c => renderRow(c)[0])}
            </tbody>
          </table>
        </div>
      )}

      {/* Client modal */}
      <Dialog open={modal.open} onOpenChange={o => { if (!o) setModal({ open: false }); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase">
              {modal.item ? 'Редактировать клиента' : 'Новый клиент'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            {/* Основные */}
            <SectionTitle>Основные данные</SectionTitle>
            <Field label="Головная организация">
              <Select value={form.parent_id} onValueChange={v => setForm(f => ({ ...f, parent_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger className="bg-secondary/40 border-border h-8 text-sm">
                  <SelectValue placeholder="— нет —" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="__none__">— нет —</SelectItem>
                  {clients.filter(c => c.id !== modal.item?.id).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Наименование *" half>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="ИНН" half>
              <Input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Логин" half>
              <Input value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} className={inputCls} />
            </Field>
            <Field label={modal.item ? 'Новый пароль' : 'Пароль'} half>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} placeholder={modal.item ? 'Не менять' : ''} />
            </Field>
            <Field label="Адрес">
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Активен" half>
              <div className="flex items-center h-8 gap-2">
                <Switch checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <span className="text-sm text-muted-foreground">{form.is_active ? 'Да' : 'Нет'}</span>
              </div>
            </Field>

            {/* Директор */}
            <SectionTitle>Директор</SectionTitle>
            <Field label="ФИО">
              <Input value={form.director_name} onChange={e => setForm(f => ({ ...f, director_name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Телефон" half>
              <Input value={form.director_phone} onChange={e => setForm(f => ({ ...f, director_phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Email" half>
              <Input value={form.director_email} onChange={e => setForm(f => ({ ...f, director_email: e.target.value }))} className={inputCls} />
            </Field>

            {/* Бухгалтер */}
            <SectionTitle>Бухгалтер</SectionTitle>
            <Field label="ФИО">
              <Input value={form.accountant_name} onChange={e => setForm(f => ({ ...f, accountant_name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Телефон" half>
              <Input value={form.accountant_phone} onChange={e => setForm(f => ({ ...f, accountant_phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Email" half>
              <Input value={form.accountant_email} onChange={e => setForm(f => ({ ...f, accountant_email: e.target.value }))} className={inputCls} />
            </Field>

            {/* Контактное лицо */}
            <SectionTitle>Контактное лицо</SectionTitle>
            <Field label="ФИО">
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Телефон" half>
              <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} className={inputCls} />
            </Field>
            <Field label="Email" half>
              <Input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} className={inputCls} />
            </Field>

            {/* Базы данных клиента */}
            <SectionTitle>Базы данных</SectionTitle>
            <div className="col-span-2 space-y-2">
              {clientDbs.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Конфигурация</label>
                    <Select value={String(row.config_database_id || '')} onValueChange={v => updateDbRow(idx, 'config_database_id', v)}>
                      <SelectTrigger className="bg-secondary/40 border-border h-8 text-sm">
                        <SelectValue placeholder="Выбрать..." />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {configDbs.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.config_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Текущая версия</label>
                    <Input value={row.current_config_version || ''} onChange={e => updateDbRow(idx, 'current_config_version', e.target.value)} className={inputCls} placeholder="3.0.70" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Дата обновления</label>
                    <Input type="date" value={row.update_date || ''} onChange={e => updateDbRow(idx, 'update_date', e.target.value)} className={inputCls} />
                  </div>
                  <button onClick={() => removeDbRow(idx)} className="text-destructive hover:opacity-70 h-8 flex items-center">
                    <Icon name="Trash2" size={15} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addDbRow} className="border-dashed border-border text-muted-foreground hover:text-foreground h-8 w-full">
                <Icon name="Plus" size={14} className="mr-1" /> Добавить базу
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModal({ open: false })} className="border-border">Отмена</Button>
            <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    }).then(r => r.json());
    setLoading(false);
    if (res.token) {
      localStorage.setItem(TOKEN_KEY, res.token);
      onLogin();
    } else {
      setError(res.error || 'Ошибка входа');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center grid-bg">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[400px] bg-primary/10 rounded-full blur-[120px]" />
      </div>
      <div className="relative w-full max-w-sm p-8 rounded-2xl bg-card border border-border shadow-2xl">
        <div className="flex items-center gap-2.5 mb-8">
          <span className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/15 border border-primary/40">
            <Icon name="ShieldCheck" className="text-primary" size={20} />
          </span>
          <div>
            <div className="font-display text-lg uppercase tracking-wide">Спец<span className="text-primary">Системы</span></div>
            <div className="text-xs text-muted-foreground font-mono">Панель администратора</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Логин</label>
            <Input value={login} onChange={e => setLogin(e.target.value)} className="bg-secondary/40 border-border focus-visible:ring-primary" autoComplete="username" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Пароль</label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-secondary/40 border-border focus-visible:ring-primary" autoComplete="current-password" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10">
            {loading ? 'Вход...' : 'Войти'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ADMIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'users' | 'clients' | 'databases';

export default function Admin() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState<Tab>('clients');
  const [configDbs, setConfigDbs] = useState<ConfigDB[]>([]);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch(`${AUTH_URL}/verify`, { headers: { 'X-Admin-Token': token } })
      .then(r => r.json())
      .then(d => { if (d.ok) setAuthed(true); });
  }, []);

  useEffect(() => {
    if (!authed) return;
    api('/databases').then(d => { if (Array.isArray(d)) setConfigDbs(d); });
  }, [authed]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthed(false);
  };

  if (!authed) return <AdminLogin onLogin={() => setAuthed(true)} />;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'clients', label: 'Клиенты', icon: 'Building2' },
    { id: 'users', label: 'Пользователи', icon: 'Users' },
    { id: 'databases', label: 'Базы данных', icon: 'Database' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/15 border border-primary/40">
              <Icon name="ShieldCheck" className="text-primary" size={17} />
            </span>
            <span className="font-display text-base uppercase tracking-wide">
              Спец<span className="text-primary">Системы</span>
            </span>
            <span className="text-xs font-mono text-muted-foreground border border-border rounded px-2 py-0.5 hidden sm:inline">
              Панель администратора
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                  tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon name={t.icon} size={14} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
            <button onClick={logout} className="ml-2 text-muted-foreground hover:text-destructive transition-colors p-1.5">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-8">
        {tab === 'users' && <UsersSection />}
        {tab === 'clients' && <ClientsSection configDbs={configDbs} />}
        {tab === 'databases' && <DatabasesSection onLoaded={setConfigDbs} />}
      </main>
    </div>
  );
}
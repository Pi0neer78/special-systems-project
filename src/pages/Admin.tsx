import { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

// Маршрутинг через query-параметры: ?resource=users&id=1&sub=db&subid=2
function api(qs: string, method = 'GET', body?: object) {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  return fetch(`${API_URL}?${qs}`, {
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

type UserClient = { client_id: number; client_name: string };
type User = { id: number; login: string; full_name: string; is_active: boolean; phone: string; description: string; clients: UserClient[] };

// Панель привязки клиентов к пользователю
function UserClientsPanel({ user, allClients, onChanged }: {
  user: User;
  allClients: { id: number; name: string }[];
  onChanged: () => void;
}) {
  const [addClientId, setAddClientId] = useState('');
  const [saving, setSaving] = useState(false);
  const linked = user.clients || [];
  const linkedIds = new Set(linked.map(c => c.client_id));
  const available = allClients.filter(c => !linkedIds.has(c.id));

  const add = async () => {
    if (!addClientId) return;
    setSaving(true);
    await api('resource=user_clients', 'POST', { user_id: user.id, client_id: Number(addClientId) });
    setAddClientId('');
    setSaving(false);
    onChanged();
  };

  const remove = async (linkId: number) => {
    await api(`resource=user_clients&id=${linkId}`, 'PATCH');
    onChanged();
  };

  // linkId нужен для удаления — запрашиваем все связи при открытии
  const [links, setLinks] = useState<{ id: number; client_id: number }[]>([]);
  useEffect(() => {
    api('resource=user_clients').then(d => {
      if (Array.isArray(d)) setLinks(d.filter((l: { user_id: number; client_id: number; id: number }) => l.user_id === user.id));
    });
  }, [user.id, linked.length]);

  const getLinkId = (clientId: number) => links.find(l => l.client_id === clientId)?.id;

  return (
    <div className="space-y-2">
      {linked.length === 0 && <p className="text-xs text-muted-foreground">Нет привязанных клиентов</p>}
      {linked.map(c => (
        <div key={c.client_id} className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-1.5">
          <span className="text-sm">{c.client_name}</span>
          <button
            onClick={() => { const id = getLinkId(c.client_id); if (id) remove(id); }}
            className="text-destructive/70 hover:text-destructive transition-colors p-0.5"
            title="Отвязать"
          >
            <Icon name="X" size={13} />
          </button>
        </div>
      ))}
      {available.length > 0 && (
        <div className="flex gap-2 pt-1">
          <Select value={addClientId} onValueChange={setAddClientId}>
            <SelectTrigger className="bg-secondary/40 border-border h-8 text-sm flex-1">
              <SelectValue placeholder="Выбрать клиента..." />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {available.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={add} disabled={saving || !addClientId} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 shrink-0">
            <Icon name="Plus" size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}

// Печатная форма пользователя
function UserPrintView({ user }: { user: User }) {
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const clients = (user.clients || []).map(c => `<li>${c.client_name}</li>`).join('') || '<li style="color:#888">Не привязан</li>';
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Карточка пользователя — ${user.full_name || user.login}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Oswald:wght@600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'IBM Plex Sans',sans-serif;color:#0f172a;background:#fff;padding:40px;font-size:13px}
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #2563eb;padding-bottom:16px;margin-bottom:24px}
  .logo{font-family:'Oswald',sans-serif;font-size:22px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#2563eb}
  .logo span{color:#0f172a}
  .doc-title{font-size:11px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:1px}
  .date{font-size:11px;color:#64748b;text-align:right}
  .name-block{background:#f1f5f9;border-left:4px solid #2563eb;padding:16px 20px;margin-bottom:20px;border-radius:0 8px 8px 0}
  .name-block .fio{font-family:'Oswald',sans-serif;font-size:20px;font-weight:600;text-transform:uppercase;letter-spacing:1px}
  .name-block .login{font-size:12px;color:#64748b;margin-top:4px;font-family:monospace}
  .status{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-top:8px}
  .status.active{background:#dcfce7;color:#166534}
  .status.blocked{background:#fee2e2;color:#991b1b}
  .section{margin-bottom:18px}
  .section-title{font-family:'Oswald',sans-serif;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:#2563eb;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .field label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
  .field span{font-size:13px;color:#0f172a;font-weight:500}
  .field span.empty{color:#cbd5e1;font-style:italic}
  ul{list-style:none;padding:0}
  ul li{padding:5px 10px;background:#f8fafc;border-radius:4px;margin-bottom:4px;font-size:12px;border-left:3px solid #2563eb}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
  @media print{body{padding:20px}}
</style></head><body>
<div class="header">
  <div><div class="logo">Спец<span>Системы</span></div><div class="doc-title">Карточка пользователя</div></div>
  <div class="date">Дата печати: ${new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' })}</div>
</div>
<div class="name-block">
  <div class="fio">${user.full_name || '— ФИО не указано —'}</div>
  <div class="login">Логин: ${user.login}</div>
  <div class="status ${user.is_active ? 'active' : 'blocked'}">${user.is_active ? '● Активен' : '● Заблокирован'}</div>
</div>
<div class="section">
  <div class="section-title">Контактная информация</div>
  <div class="grid">
    <div class="field"><label>Телефон</label><span class="${user.phone ? '' : 'empty'}">${user.phone || 'не указан'}</span></div>
    <div class="field"><label>Описание / должность</label><span class="${user.description ? '' : 'empty'}">${user.description || 'не указано'}</span></div>
  </div>
</div>
<div class="section">
  <div class="section-title">Привязанные клиенты (${(user.clients || []).length})</div>
  <ul>${clients}</ul>
</div>
<div class="footer">
  <span>СпецСистемы — портал поддержки 1С:Бухгалтерия</span>
  <span>ID пользователя: ${user.id}</span>
</div>
<script>window.onload=()=>{window.print()}</script>
</body></html>`);
    w.document.close();
  };
  return (
    <button onClick={print} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Печать">
      <Icon name="Printer" size={14} />
    </button>
  );
}

function UsersSection({ allClients }: { allClients: { id: number; name: string }[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: User }>({ open: false });
  const [form, setForm] = useState({ login: '', password: '', full_name: '', is_active: true, phone: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [expandedUser, setExpandedUser] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api('resource=users').then(d => { setUsers(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ login: '', password: '', full_name: '', is_active: true, phone: '', description: '' });
    setModal({ open: true });
  };

  const openEdit = (u: User) => {
    setForm({ login: u.login, password: '', full_name: u.full_name || '', is_active: u.is_active, phone: u.phone || '', description: u.description || '' });
    setModal({ open: true, item: u });
  };

  const save = async () => {
    setSaving(true);
    if (modal.item) {
      await api(`resource=users&id=${modal.item.id}`, 'PUT', form);
    } else {
      await api('resource=users', 'POST', form);
    }
    setSaving(false);
    setModal({ open: false });
    load();
  };

  const toggleActive = async (u: User) => {
    await api(`resource=users&id=${u.id}`, 'PATCH');
    load();
  };

  const q = search.toLowerCase();
  const filtered = users.filter(u =>
    u.login.toLowerCase().includes(q) ||
    (u.full_name || '').toLowerCase().includes(q) ||
    (u.phone || '').toLowerCase().includes(q) ||
    (u.description || '').toLowerCase().includes(q)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl uppercase">Пользователи</h2>
        <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
          <Icon name="Plus" size={15} className="mr-1" /> Добавить
        </Button>
      </div>

      <div className="relative mb-3">
        <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по ФИО, логину, телефону..." className="pl-8 h-8 text-sm bg-secondary/40 border-border" />
      </div>

      {loading ? <Spinner /> : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60">
              <tr>
                {['ФИО / Логин', 'Телефон', 'Клиенты', 'Активен', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">{search ? 'Ничего не найдено' : 'Нет пользователей'}</td></tr>
              )}
              {filtered.map(u => (
                <>
                  <tr key={u.id} className="border-t border-border hover:bg-secondary/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="font-medium text-sm">{u.full_name || <span className="text-muted-foreground italic">—</span>}</div>
                      <div className="font-mono text-xs text-muted-foreground">{u.login}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{u.phone || '—'}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                        className="flex items-center gap-1.5 text-xs hover:text-primary transition-colors"
                      >
                        <Icon name="Building2" size={13} className="text-muted-foreground" />
                        <span className={u.clients?.length ? 'text-primary font-medium' : 'text-muted-foreground'}>
                          {u.clients?.length || 0}
                        </span>
                        <Icon name={expandedUser === u.id ? 'ChevronUp' : 'ChevronDown'} size={12} className="text-muted-foreground" />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={u.is_active} onChange={() => toggleActive(u)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <UserPrintView user={u} />
                        <button onClick={() => openEdit(u)} className="text-muted-foreground hover:text-primary transition-colors p-1">
                          <Icon name="Pencil" size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedUser === u.id && (
                    <tr key={`${u.id}-clients`} className="border-t border-border bg-secondary/20">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
                          Клиенты: {u.full_name || u.login}
                        </div>
                        <UserClientsPanel user={u} allClients={allClients} onChanged={load} />
                      </td>
                    </tr>
                  )}
                </>
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
            <Field label="ФИО">
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className={inputCls} placeholder="Иванов Иван Иванович" />
            </Field>
            <Field label="Активен" half>
              <div className="flex items-center h-8 gap-2">
                <Switch checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <span className="text-sm text-muted-foreground">{form.is_active ? 'Да' : 'Нет'}</span>
              </div>
            </Field>
            <Field label="Логин *" half>
              <Input value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} className={inputCls} />
            </Field>
            <Field label={modal.item ? 'Новый пароль' : 'Пароль *'} half>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} placeholder={modal.item ? 'Не менять' : ''} />
            </Field>
            <Field label="Телефон">
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} />
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
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; item?: ConfigDB }>({ open: false });
  const [form, setForm] = useState({ config_name: '', min_platform_version: '', actual_config_version: '', update_release_date: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api('resource=databases').then(d => {
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
      await api(`resource=databases&id=${modal.item.id}`, 'PUT', form);
    } else {
      await api('resource=databases', 'POST', form);
    }
    setSaving(false);
    setModal({ open: false });
    load();
  };

  const filteredDbs = dbs.filter(d =>
    !search || d.config_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.actual_config_version || '').includes(search)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl uppercase">Базы данных (конфигурации)</h2>
        <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
          <Icon name="Plus" size={15} className="mr-1" /> Добавить
        </Button>
      </div>

      <div className="relative mb-3">
        <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию конфигурации, версии..." className="pl-8 h-8 text-sm bg-secondary/40 border-border" />
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
              {filteredDbs.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-muted-foreground text-sm">{search ? 'Ничего не найдено' : 'Нет конфигураций'}</td></tr>
              )}
              {filteredDbs.map(d => (
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

function ClientPrintView({ client }: { client: Client }) {
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;

    const v = (val: string | null | undefined, fallback = '—') => val || fallback;
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });

    const contact3 = (name: string, phone: string, email: string) => `
      <div class="contact-row">
        <div class="field"><label>ФИО</label><span>${v(name)}</span></div>
        <div class="field"><label>Телефон</label><span>${v(phone)}</span></div>
        <div class="field"><label>Email</label><span>${v(email)}</span></div>
      </div>`;

    const dbRows = (client.databases || []).length > 0
      ? (client.databases || []).map(db => `
          <tr>
            <td>${v(db.config_name)}</td>
            <td>${v(db.current_config_version)}</td>
            <td>${db.update_date ? new Date(db.update_date).toLocaleDateString('ru-RU') : '—'}</td>
          </tr>`).join('')
      : '<tr><td colspan="3" style="color:#94a3b8;font-style:italic">Нет привязанных баз данных</td></tr>';

    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Карточка клиента — ${client.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Oswald:wght@600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'IBM Plex Sans',sans-serif;color:#0f172a;background:#fff;padding:36px 40px;font-size:12.5px;line-height:1.5}
  /* Header */
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #2563eb;padding-bottom:14px;margin-bottom:20px}
  .logo{font-family:'Oswald',sans-serif;font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#2563eb}
  .logo span{color:#0f172a}
  .doc-meta{text-align:right;font-size:11px;color:#64748b}
  .doc-meta strong{display:block;font-size:13px;color:#0f172a;font-family:'Oswald',sans-serif;text-transform:uppercase;letter-spacing:1px}
  /* Name block */
  .name-block{display:flex;align-items:flex-start;justify-content:space-between;background:linear-gradient(135deg,#eff6ff,#f8fafc);border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:20px}
  .name-block .org{font-family:'Oswald',sans-serif;font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#0f172a;line-height:1.1}
  .name-block .parent{font-size:11px;color:#64748b;margin-top:4px}
  .name-block .badges{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:120px}
  .badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px}
  .badge.active{background:#dcfce7;color:#166534}
  .badge.blocked{background:#fee2e2;color:#991b1b}
  .badge.inn{background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd}
  /* Sections */
  .section{margin-bottom:16px}
  .section-title{font-family:'Oswald',sans-serif;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:2px;color:#2563eb;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin-bottom:10px}
  /* Grid contacts */
  .contact-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:8px 0;border-bottom:1px solid #f1f5f9}
  .contact-row:last-child{border-bottom:none}
  .field label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
  .field span{font-size:12.5px;color:#0f172a;font-weight:500}
  /* General info grid */
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
  .info-grid .field{padding:6px 8px;background:#f8fafc;border-radius:6px}
  /* Databases table */
  table{width:100%;border-collapse:collapse;font-size:12px}
  table thead tr{background:#eff6ff}
  table th{text-align:left;padding:6px 10px;font-size:10.5px;font-weight:600;color:#2563eb;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #bfdbfe}
  table td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#0f172a}
  table tbody tr:last-child td{border-bottom:none}
  table tbody tr:nth-child(even){background:#f8fafc}
  /* Footer */
  .footer{margin-top:24px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
  @media print{
    body{padding:15px 20px}
    @page{margin:10mm}
  }
</style></head><body>

<div class="header">
  <div>
    <div class="logo">Спец<span>Системы</span></div>
    <div style="font-size:11px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:1px">Карточка клиента</div>
  </div>
  <div class="doc-meta">
    <strong>Карточка клиента</strong>
    Дата печати: ${date}<br>
    ID клиента: ${client.id}
  </div>
</div>

<div class="name-block">
  <div>
    <div class="org">${v(client.name)}</div>
    ${client.parent_name ? `<div class="parent">Входит в: ${client.parent_name}</div>` : ''}
    ${client.address ? `<div style="font-size:11.5px;color:#475569;margin-top:6px">📍 ${client.address}</div>` : ''}
  </div>
  <div class="badges">
    <span class="badge ${client.is_active ? 'active' : 'blocked'}">${client.is_active ? '● Активен' : '● Заблокирован'}</span>
    ${client.inn ? `<span class="badge inn">ИНН: ${client.inn}</span>` : ''}
  </div>
</div>

<div class="section">
  <div class="section-title">Реквизиты доступа</div>
  <div class="info-grid">
    <div class="field"><label>Логин в системе</label><span>${v(client.login)}</span></div>
    <div class="field"><label>Адрес</label><span>${v(client.address)}</span></div>
  </div>
</div>

<div class="section">
  <div class="section-title">Директор</div>
  ${contact3(client.director_name, client.director_phone, client.director_email)}
</div>

<div class="section">
  <div class="section-title">Бухгалтер</div>
  ${contact3(client.accountant_name, client.accountant_phone, client.accountant_email)}
</div>

<div class="section">
  <div class="section-title">Контактное лицо</div>
  ${contact3(client.contact_name, client.contact_phone, client.contact_email)}
</div>

<div class="section">
  <div class="section-title">Базы данных 1С (${(client.databases || []).length})</div>
  <table>
    <thead><tr><th>Конфигурация</th><th>Текущая версия</th><th>Дата обновления</th></tr></thead>
    <tbody>${dbRows}</tbody>
  </table>
</div>

<div class="footer">
  <span>СпецСистемы — портал поддержки 1С:Бухгалтерия</span>
  <span>Документ сформирован автоматически</span>
</div>

<script>window.onload=()=>window.print()</script>
</body></html>`);
    w.document.close();
  };

  return (
    <button onClick={print} className="text-muted-foreground hover:text-primary transition-colors p-1" title="Печать карточки клиента">
      <Icon name="Printer" size={14} />
    </button>
  );
}

const emptyClient = {
  parent_id: '', name: '', login: '', password: '', is_active: true, inn: '', address: '',
  director_name: '', director_phone: '', director_email: '',
  accountant_name: '', accountant_phone: '', accountant_email: '',
  contact_name: '', contact_phone: '', contact_email: '',
};

function ClientsSection({ configDbs, onClientsChanged }: { configDbs: ConfigDB[]; onClientsChanged?: (clients: Client[]) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'blocked'>('all');
  const [modal, setModal] = useState<{ open: boolean; item?: Client }>({ open: false });
  const [form, setForm] = useState<typeof emptyClient>(emptyClient);
  const [clientDbs, setClientDbs] = useState<ClientDB[]>([]);
  const [dbModal, setDbModal] = useState<{ open: boolean; item?: ClientDB; clientId?: number }>({ open: false });
  const [dbForm, setDbForm] = useState({ config_database_id: '', current_config_version: '', update_date: '' });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [ctab, setCtab] = useState<'general' | 'contacts' | 'databases'>('general');

  const load = useCallback(() => {
    setLoading(true);
    api('resource=clients').then(d => {
      const list = Array.isArray(d) ? d : [];
      setClients(list);
      if (onClientsChanged) onClientsChanged(list);
      setLoading(false);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm(emptyClient);
    setClientDbs([]);
    setCtab('general');
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
    setCtab('general');
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
      await api(`resource=clients&id=${clientId}`, 'PUT', payload);
    } else {
      const res = await api('resource=clients', 'POST', payload);
      clientId = res.id;
    }
    for (const db of clientDbs) {
      if (!db.id && clientId) {
        await api(`resource=clients&id=${clientId}&sub=db`, 'POST', { config_database_id: db.config_database_id, current_config_version: db.current_config_version, update_date: db.update_date || null });
      } else if (db.id) {
        await api(`resource=clients&id=${db.client_id}&sub=db&subid=${db.id}`, 'PUT', { config_database_id: db.config_database_id, current_config_version: db.current_config_version, update_date: db.update_date || null });
      }
    }
    setSaving(false);
    setModal({ open: false });
    load();
  };

  const toggleActive = async (c: Client) => {
    await api(`resource=clients&id=${c.id}`, 'PATCH');
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

  // Фильтрация
  const q = search.toLowerCase();
  const visibleClients = clients.filter(c => {
    const matchSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      (c.inn || '').includes(q) ||
      (c.login || '').toLowerCase().includes(q) ||
      (c.director_name || '').toLowerCase().includes(q) ||
      (c.director_phone || '').includes(q);
    const matchActive =
      filterActive === 'all' ||
      (filterActive === 'active' && c.is_active) ||
      (filterActive === 'blocked' && !c.is_active);
    return matchSearch && matchActive;
  });

  // Build tree: roots + children
  const roots = visibleClients.filter(c => !c.parent_id);
  const children = (parentId: number) => visibleClients.filter(c => c.parent_id === parentId);

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
          <div className="flex items-center justify-end gap-0.5">
            <ClientPrintView client={c} />
            <button onClick={() => openEdit(c)} className="text-muted-foreground hover:text-primary transition-colors p-1">
              <Icon name="Pencil" size={14} />
            </button>
          </div>
        </td>
      </tr>,
      ...(isExpanded ? children(c.id).flatMap(child => renderRow(child, depth + 1)) : []),
    ];
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-xl uppercase">Клиенты</h2>
        <Button size="sm" onClick={openAdd} className="bg-primary text-primary-foreground hover:bg-primary/90 h-8">
          <Icon name="Plus" size={15} className="mr-1" /> Добавить
        </Button>
      </div>

      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Icon name="Search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию, ИНН, логину, директору..." className="pl-8 h-8 text-sm bg-secondary/40 border-border" />
        </div>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([['all', 'Все'], ['active', 'Активные'], ['blocked', 'Блок.']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilterActive(v)}
              className={`px-3 h-8 text-xs transition-colors ${filterActive === v ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground hover:text-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
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
              {visibleClients.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">{search || filterActive !== 'all' ? 'Ничего не найдено' : 'Нет клиентов'}</td></tr>
              )}
              {roots.flatMap(c => renderRow(c))}
              {visibleClients.filter(c => c.parent_id && !roots.find(r => r.id === c.parent_id)).map(c => renderRow(c)[0])}
            </tbody>
          </table>
        </div>
      )}

      {/* Client modal — 3 вкладки, без скролла */}
      {(() => {
        const ctabs = [
          { id: 'general' as const, label: 'Общие', icon: 'Building2' },
          { id: 'contacts' as const, label: 'Контакты', icon: 'Users' },
          { id: 'databases' as const, label: 'Базы данных', icon: 'Database' },
        ];
        return (
          <Dialog open={modal.open} onOpenChange={o => { if (!o) { setModal({ open: false }); setCtab('general'); } }}>
            <DialogContent className="bg-card border-border max-w-2xl p-0 gap-0 overflow-hidden" style={{ maxHeight: '92vh' }}>
              <DialogHeader className="px-6 pt-5 pb-0">
                <DialogTitle className="font-display uppercase text-base">
                  {modal.item ? 'Редактировать клиента' : 'Новый клиент'}
                </DialogTitle>
              </DialogHeader>

              {/* Вкладки */}
              <div className="flex gap-1 px-6 pt-3 border-b border-border pb-0">
                {ctabs.map(t => (
                  <button key={t.id} onClick={() => setCtab(t.id)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-t-lg border-b-2 transition-all -mb-px ${
                      ctab === t.id
                        ? 'border-primary text-primary bg-primary/5 font-medium'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}>
                    <Icon name={t.icon} size={14} />{t.label}
                  </button>
                ))}
              </div>

              {/* Тело вкладок */}
              <div className="px-6 py-4">

                {/* ── Вкладка 1: Общие ── */}
                {ctab === 'general' && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Наименование *">
                      <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Головная организация" half>
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
                    <Field label="ИНН" half>
                      <Input value={form.inn} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Активен" half>
                      <div className="flex items-center h-8 gap-2">
                        <Switch checked={form.is_active} onChange={v => setForm(f => ({ ...f, is_active: v }))} />
                        <span className="text-sm text-muted-foreground">{form.is_active ? 'Да' : 'Нет'}</span>
                      </div>
                    </Field>
                    <Field label="Адрес">
                      <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label="Логин" half>
                      <Input value={form.login} onChange={e => setForm(f => ({ ...f, login: e.target.value }))} className={inputCls} />
                    </Field>
                    <Field label={modal.item ? 'Новый пароль' : 'Пароль'} half>
                      <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className={inputCls} placeholder={modal.item ? 'Не менять' : ''} />
                    </Field>
                  </div>
                )}

                {/* ── Вкладка 2: Контакты ── */}
                {ctab === 'contacts' && (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                    {/* Заголовок-строка */}
                    <div className="text-xs font-mono text-primary uppercase tracking-widest col-span-3 border-b border-border pb-1">Директор</div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
                      <Input value={form.director_name} onChange={e => setForm(f => ({ ...f, director_name: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                      <Input value={form.director_phone} onChange={e => setForm(f => ({ ...f, director_phone: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Email</label>
                      <Input value={form.director_email} onChange={e => setForm(f => ({ ...f, director_email: e.target.value }))} className={inputCls} /></div>

                    <div className="text-xs font-mono text-primary uppercase tracking-widest col-span-3 border-b border-border pb-1 pt-2">Бухгалтер</div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
                      <Input value={form.accountant_name} onChange={e => setForm(f => ({ ...f, accountant_name: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                      <Input value={form.accountant_phone} onChange={e => setForm(f => ({ ...f, accountant_phone: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Email</label>
                      <Input value={form.accountant_email} onChange={e => setForm(f => ({ ...f, accountant_email: e.target.value }))} className={inputCls} /></div>

                    <div className="text-xs font-mono text-primary uppercase tracking-widest col-span-3 border-b border-border pb-1 pt-2">Контактное лицо</div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">ФИО</label>
                      <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Телефон</label>
                      <Input value={form.contact_phone} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} className={inputCls} /></div>
                    <div><label className="text-xs text-muted-foreground mb-1 block">Email</label>
                      <Input value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} className={inputCls} /></div>
                  </div>
                )}

                {/* ── Вкладка 3: Базы данных ── */}
                {ctab === 'databases' && (
                  <div className="space-y-2">
                    {clientDbs.length === 0 && (
                      <p className="text-sm text-muted-foreground py-2">Нет привязанных баз данных</p>
                    )}
                    {clientDbs.map((row, idx) => (
                      <div key={idx} className="grid grid-cols-[1fr_130px_130px_auto] gap-2 items-end">
                        <div><label className="text-xs text-muted-foreground mb-1 block">Конфигурация</label>
                          <Select value={String(row.config_database_id || '')} onValueChange={v => updateDbRow(idx, 'config_database_id', v)}>
                            <SelectTrigger className="bg-secondary/40 border-border h-8 text-sm">
                              <SelectValue placeholder="Выбрать..." />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              {configDbs.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.config_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Версия</label>
                          <Input value={row.current_config_version || ''} onChange={e => updateDbRow(idx, 'current_config_version', e.target.value)} className={inputCls} placeholder="3.0.71" /></div>
                        <div><label className="text-xs text-muted-foreground mb-1 block">Дата обновл.</label>
                          <Input type="date" value={row.update_date || ''} onChange={e => updateDbRow(idx, 'update_date', e.target.value)} className={inputCls} /></div>
                        <button onClick={() => removeDbRow(idx)} className="text-destructive hover:opacity-70 h-8 flex items-center mt-4">
                          <Icon name="Trash2" size={15} />
                        </button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addDbRow}
                      className="border-dashed border-border text-muted-foreground hover:text-foreground h-8 w-full mt-1">
                      <Icon name="Plus" size={14} className="mr-1" /> Добавить базу
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter className="px-6 pb-5 pt-2 border-t border-border">
                <Button variant="outline" onClick={() => setModal({ open: false })} className="border-border">Отмена</Button>
                <Button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

type AuthInfo = { role: 'admin' | 'user'; user_id: number; login: string; full_name?: string };

function AdminLogin({ onLogin }: { onLogin: (info: AuthInfo) => void }) {
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
      onLogin({ role: res.role, user_id: res.user_id, login: res.login || login, full_name: res.full_name });
    } else {
      setError(res.error || 'Неверный логин или пароль');
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
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [tab, setTab] = useState<Tab>('clients');
  const [configDbs, setConfigDbs] = useState<ConfigDB[]>([]);
  const [allClients, setAllClients] = useState<{ id: number; name: string }[]>([]);

  // Проверяем сохранённый токен при загрузке
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch(AUTH_URL, { headers: { 'X-Admin-Token': token } })
      .then(r => r.json())
      .then(d => {
        if (d.ok) setAuthInfo({ role: d.role, user_id: d.user_id, login: d.login, full_name: d.full_name });
      })
      .catch(() => {});
  }, []);

  // При входе устанавливаем дефолтный таб в зависимости от роли
  const handleLogin = (info: AuthInfo) => {
    setAuthInfo(info);
    setTab(info.role === 'admin' ? 'users' : 'clients');
  };

  useEffect(() => {
    if (!authInfo) return;
    api('resource=databases').then(d => { if (Array.isArray(d)) setConfigDbs(d); });
    api('resource=clients').then(d => {
      if (Array.isArray(d)) setAllClients(d.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
    });
  }, [authInfo]);

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthInfo(null);
    setTab('clients');
  };

  if (!authInfo) return <AdminLogin onLogin={handleLogin} />;

  const isAdmin = authInfo.role === 'admin';

  const allTabs: { id: Tab; label: string; icon: string; adminOnly: boolean }[] = [
    { id: 'users', label: 'Пользователи', icon: 'Users', adminOnly: true },
    { id: 'clients', label: 'Клиенты', icon: 'Building2', adminOnly: false },
    { id: 'databases', label: 'Базы данных', icon: 'Database', adminOnly: false },
  ];
  const tabs = allTabs.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/15 border border-primary/40">
              <Icon name={isAdmin ? 'ShieldCheck' : 'User'} className="text-primary" size={17} />
            </span>
            <span className="font-display text-base uppercase tracking-wide">
              Спец<span className="text-primary">Системы</span>
            </span>
            <span className="text-xs font-mono text-muted-foreground border border-border rounded px-2 py-0.5 hidden sm:inline">
              {isAdmin ? 'Администратор' : (authInfo.full_name || authInfo.login)}
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
            <button onClick={logout} className="ml-2 text-muted-foreground hover:text-destructive transition-colors p-1.5" title="Выйти">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 container py-8">
        {tab === 'users' && isAdmin && <UsersSection allClients={allClients} />}
        {tab === 'clients' && <ClientsSection configDbs={configDbs} onClientsChanged={d => setAllClients(d.map(c => ({ id: c.id, name: c.name })))} />}
        {tab === 'databases' && <DatabasesSection onLoaded={setConfigDbs} />}
      </main>
    </div>
  );
}
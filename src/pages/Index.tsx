import { useState, useEffect } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const TICKETS_URL = 'https://functions.poehali.dev/4866cc97-c798-42d4-a280-d35071d704a8';
const CLIENT_TOKEN_KEY = 'client_token';

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low:    { label: 'Низкий',   color: 'text-muted-foreground' },
  medium: { label: 'Средний',  color: 'text-blue-400' },
  high:   { label: 'Высокий',  color: 'text-yellow-400' },
  urgent: { label: 'Срочно',   color: 'text-red-400' },
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  new:         { label: 'Новая',      color: 'text-blue-400',   icon: 'CircleDot' },
  in_progress: { label: 'В процессе', color: 'text-yellow-400', icon: 'Loader' },
  resolved:    { label: 'Решена',     color: 'text-green-400',  icon: 'CheckCircle' },
  cancelled:   { label: 'Отменена',   color: 'text-muted-foreground', icon: 'XCircle' },
};

const PROBLEM_TYPES = [
  'Вопрос по 1С', 'Проблема с доступом', 'Нужно обновление',
  'Ошибка при работе', 'Нужна доработка', 'Нужна консультация',
  'Проблемы с оборудованием', 'Прочее',
];

const PRIORITIES = [
  { value: 'low',    label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high',   label: 'Высокий' },
  { value: 'urgent', label: 'Срочно' },
];

const services = [
  { icon: 'RefreshCw', title: 'Обновления', desc: 'Релизы и патчи 1С' },
  { icon: 'MessageCircleQuestion', title: 'Вопросы', desc: 'Ответы по 1С' },
  { icon: 'FileText', title: 'Отчётность', desc: 'Помощь с формами' },
  { icon: 'Headphones', title: 'Поддержка', desc: 'Техническое обслуживание' },
];

type ClientInfo = { client_id: number; name: string; login: string };

type Ticket = {
  id: number;
  client_id: number;
  submitted_at: string;
  priority: string;
  problem_type: string;
  description: string;
  deadline: string | null;
  extra_info: string | null;
  result: string | null;
  status: string;
  resolved_at: string | null;
  status_changed_at: string;
  assignee_name: string | null;
};

function isOverdue(ticket: Ticket) {
  return !ticket.resolved_at && ticket.deadline && new Date(ticket.deadline) < new Date();
}

// ─── Форма входа клиента ─────────────────────────────────────────────────────

function ClientLogin({ onLogin }: { onLogin: (info: ClientInfo, token: string) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await fetch(`${TICKETS_URL}?resource=client-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    }).then(r => r.json());
    setLoading(false);
    if (res.token) {
      localStorage.setItem(CLIENT_TOKEN_KEY, res.token);
      onLogin({ client_id: res.client_id, name: res.name, login }, res.token);
    } else {
      setError(res.error || 'Неверный логин или пароль');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center h-16">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/15 border border-primary/40">
              <Icon name="Hexagon" className="text-primary" size={20} />
            </span>
            <span className="font-display text-xl tracking-wide uppercase">
              Спец<span className="text-primary">Системы</span>
            </span>
          </div>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <span className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/15 border border-primary/40 mx-auto mb-4">
              <Icon name="User" className="text-primary" size={28} />
            </span>
            <h1 className="font-display text-2xl uppercase tracking-wide">Личный кабинет</h1>
            <p className="text-sm text-muted-foreground mt-2">Войдите для управления заявками</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Логин</label>
              <Input value={login} onChange={e => setLogin(e.target.value)} className="bg-secondary/40 border-border" autoComplete="username" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Пароль</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="bg-secondary/40 border-border" autoComplete="current-password" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10">
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Форма новой заявки ──────────────────────────────────────────────────────

function NewTicketForm({ token, onCreated, onClose }: { token: string; onCreated: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    priority: 'medium',
    problem_type: PROBLEM_TYPES[0],
    description: '',
    deadline: '',
    extra_info: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    const body: Record<string, string> = {
      priority: form.priority,
      problem_type: form.problem_type,
      description: form.description,
    };
    if (form.deadline) body.deadline = new Date(form.deadline).toISOString();
    if (form.extra_info.trim()) body.extra_info = form.extra_info.trim();

    const res = await fetch(`${TICKETS_URL}?resource=tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Client-Token': token },
      body: JSON.stringify(body),
    }).then(r => r.json());
    setLoading(false);
    if (res.id) { onCreated(); onClose(); }
    else setError(res.error || 'Ошибка при создании заявки');
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Приоритет</label>
          <select value={form.priority} onChange={e => set('priority', e.target.value)}
            className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Решить до</label>
          <Input type="datetime-local" value={form.deadline} onChange={e => set('deadline', e.target.value)} className="bg-secondary/40 border-border text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Тип проблемы</label>
        <select value={form.problem_type} onChange={e => set('problem_type', e.target.value)}
          className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          {PROBLEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Описание проблемы <span className="text-destructive">*</span></label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)} required rows={4}
          className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Дополнительная информация</label>
        <textarea value={form.extra_info} onChange={e => set('extra_info', e.target.value)} rows={2}
          className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Отмена</Button>
        <Button type="submit" disabled={loading} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
          {loading ? 'Отправка...' : 'Подать заявку'}
        </Button>
      </div>
    </form>
  );
}

// ─── Детали заявки ───────────────────────────────────────────────────────────

function TicketDetail({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const st = STATUS_LABELS[ticket.status] || STATUS_LABELS.new;
  const pr = PRIORITY_LABELS[ticket.priority] || PRIORITY_LABELS.medium;
  const overdue = isOverdue(ticket);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-3 flex-wrap">
        <span className={`flex items-center gap-1.5 font-medium ${st.color}`}>
          <Icon name={st.icon} size={14} /> {st.label}
        </span>
        <span className={`font-medium ${pr.color}`}>{pr.label}</span>
        {overdue && <span className="text-red-500 font-bold text-xs">⚠ Просрочена</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div><span className="text-muted-foreground">Подана:</span> <span>{new Date(ticket.submitted_at).toLocaleString('ru')}</span></div>
        <div><span className="text-muted-foreground">Тип:</span> <span>{ticket.problem_type}</span></div>
        {ticket.deadline && <div><span className="text-muted-foreground">Решить до:</span> <span className={overdue ? 'text-red-400 font-semibold' : ''}>{new Date(ticket.deadline).toLocaleString('ru')}</span></div>}
        {ticket.resolved_at && <div><span className="text-muted-foreground">Решена:</span> <span className="text-green-400">{new Date(ticket.resolved_at).toLocaleString('ru')}</span></div>}
        {ticket.assignee_name && <div><span className="text-muted-foreground">Ответственный:</span> <span>{ticket.assignee_name}</span></div>}
        <div><span className="text-muted-foreground">Статус изменён:</span> <span>{new Date(ticket.status_changed_at).toLocaleString('ru')}</span></div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Описание:</p>
        <p className="bg-secondary/30 rounded-md p-3 whitespace-pre-wrap">{ticket.description}</p>
      </div>
      {ticket.extra_info && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Дополнительная информация:</p>
          <p className="bg-secondary/30 rounded-md p-3 whitespace-pre-wrap">{ticket.extra_info}</p>
        </div>
      )}
      {ticket.result && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Результат:</p>
          <p className="bg-green-500/10 border border-green-500/20 rounded-md p-3 whitespace-pre-wrap text-green-300">{ticket.result}</p>
        </div>
      )}
      <Button variant="outline" onClick={onClose} className="w-full">Закрыть</Button>
    </div>
  );
}

// ─── Личный кабинет (после входа) ───────────────────────────────────────────

function ClientDashboard({ clientInfo, token, onLogout }: { clientInfo: ClientInfo; token: string; onLogout: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null);

  const load = async () => {
    setLoading(true);
    const data = await fetch(`${TICKETS_URL}?resource=tickets`, {
      headers: { 'X-Client-Token': token },
    }).then(r => r.json());
    setLoading(false);
    if (Array.isArray(data)) setTickets(data);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/15 border border-primary/40">
              <Icon name="Hexagon" className="text-primary" size={16} />
            </span>
            <span className="font-display text-base uppercase tracking-wide">
              Спец<span className="text-primary">Системы</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon name="User" size={14} />
              <span className="hidden sm:inline">{clientInfo.name}</span>
            </div>
            <Button onClick={() => setShowNew(true)} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 text-xs gap-1.5">
              <Icon name="Plus" size={13} /> Подать заявку
            </Button>
            <button onClick={onLogout} className="text-muted-foreground hover:text-destructive transition-colors p-1.5" title="Выйти">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="container py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl uppercase tracking-wide">Мои заявки</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{tickets.length} заявок</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            <Icon name="Loader" size={20} className="animate-spin mr-2" /> Загрузка...
          </div>
        )}

        {!loading && tickets.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <Icon name="TicketCheck" size={40} className="opacity-20" />
            <p className="text-sm">Заявок пока нет</p>
            <Button onClick={() => setShowNew(true)} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              Подать первую заявку
            </Button>
          </div>
        )}

        {!loading && tickets.length > 0 && (
          <div className="space-y-3">
            {tickets.map(t => {
              const st = STATUS_LABELS[t.status] || STATUS_LABELS.new;
              const pr = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.medium;
              const overdue = isOverdue(t);
              return (
                <div
                  key={t.id}
                  onClick={() => setDetailTicket(t)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all hover:border-primary/50 ${
                    overdue
                      ? 'border-red-500/50 bg-red-500/5'
                      : 'border-border bg-card hover:bg-card/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-xs font-medium ${st.color} flex items-center gap-1`}>
                          <Icon name={st.icon} size={12} /> {st.label}
                        </span>
                        <span className={`text-xs font-medium ${pr.color}`}>{pr.label}</span>
                        <span className="text-xs text-muted-foreground">{t.problem_type}</span>
                        {overdue && <span className="text-xs text-red-500 font-bold">Просрочена</span>}
                      </div>
                      <p className={`text-sm line-clamp-2 ${overdue ? 'text-red-300 font-bold' : 'text-foreground'}`}>
                        {t.description}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">#{t.id}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{new Date(t.submitted_at).toLocaleDateString('ru')}</p>
                      {t.deadline && (
                        <p className={`text-xs mt-0.5 ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                          до {new Date(t.deadline).toLocaleDateString('ru')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Новая заявка */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">Новая заявка</DialogTitle>
          </DialogHeader>
          <NewTicketForm token={token} onCreated={load} onClose={() => setShowNew(false)} />
        </DialogContent>
      </Dialog>

      {/* Детали заявки */}
      <Dialog open={!!detailTicket} onOpenChange={() => setDetailTicket(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">Заявка #{detailTicket?.id}</DialogTitle>
          </DialogHeader>
          {detailTicket && <TicketDetail ticket={detailTicket} onClose={() => setDetailTicket(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Корневой компонент ───────────────────────────────────────────────────────

export default function Index() {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [token, setToken] = useState('');
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(CLIENT_TOKEN_KEY);
    if (!saved) { setChecking(false); return; }
    fetch(`${TICKETS_URL}?resource=client-verify`, {
      headers: { 'X-Client-Token': saved },
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        setClientInfo({ client_id: d.client_id, name: d.name, login: d.login });
        setToken(saved);
      }
    }).finally(() => setChecking(false));
  }, []);

  const handleLogin = (info: ClientInfo, t: string) => {
    setClientInfo(info);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem(CLIENT_TOKEN_KEY);
    setClientInfo(null);
    setToken('');
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Icon name="Loader" size={24} className="animate-spin" />
      </div>
    );
  }

  if (clientInfo) {
    return <ClientDashboard clientInfo={clientInfo} token={token} onLogout={handleLogout} />;
  }

  return <ClientLogin onLogin={handleLogin} />;
}

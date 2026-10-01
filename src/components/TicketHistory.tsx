import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

type HistoryRow = {
  id: number;
  actor_name: string | null;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

const STATUS_NAMES: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В процессе',
  resolved: 'Решена',
  cancelled: 'Отменена',
};

const PRIORITY_NAMES: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
  urgent: 'Срочный',
};

const FIELD_ICONS: Record<string, string> = {
  created: 'Plus',
  status: 'RefreshCw',
  assignee: 'UserCheck',
  result: 'CheckCircle',
  priority: 'Flag',
  problem_type: 'Tag',
  deadline: 'CalendarClock',
  archived: 'Archive',
};

const short = (v: string | null, n = 80) => (v && v.length > n ? v.slice(0, n) + '…' : v);

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleString('ru') : 'не задан';
}

function describe(r: HistoryRow): string {
  switch (r.field) {
    case 'created':
      return 'создал(а) заявку';
    case 'status':
      return `изменил(а) статус: ${STATUS_NAMES[r.old_value || ''] || r.old_value} → ${STATUS_NAMES[r.new_value || ''] || r.new_value}`;
    case 'assignee':
      if (!r.new_value) return `снял(а) ответственного (${r.old_value})`;
      if (!r.old_value) return `назначил(а) ответственного: ${r.new_value}`;
      return `сменил(а) ответственного: ${r.old_value} → ${r.new_value}`;
    case 'result':
      if (!r.new_value) return 'очистил(а) результат';
      return r.old_value ? `изменил(а) результат: «${short(r.new_value)}»` : `указал(а) результат: «${short(r.new_value)}»`;
    case 'priority':
      return `изменил(а) приоритет: ${PRIORITY_NAMES[r.old_value || ''] || r.old_value} → ${PRIORITY_NAMES[r.new_value || ''] || r.new_value}`;
    case 'problem_type':
      return `изменил(а) тип: ${r.old_value} → ${r.new_value}`;
    case 'deadline':
      return `изменил(а) срок: ${fmtDate(r.old_value)} → ${fmtDate(r.new_value)}`;
    case 'archived':
      return r.new_value === 'yes' ? 'отправил(а) заявку в архив' : 'вернул(а) заявку из архива';
    default:
      return 'внёс(ла) изменение';
  }
}

export default function TicketHistory({ ticketUrl, token }: { ticketUrl: string; token: string }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    fetch(ticketUrl, { headers: { 'X-Admin-Token': token } })
      .then(r => r.json())
      .then(d => { if (!cancelled) setRows(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [ticketUrl, token]);

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Icon name="History" size={13} /> История изменений
      </p>
      {rows === null ? (
        <p className="text-xs text-muted-foreground">Загрузка...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Изменений пока нет</p>
      ) : (
        <ul className="bg-secondary/30 rounded-md p-3 space-y-2 max-h-52 overflow-y-auto">
          {rows.map(r => (
            <li key={r.id} className="flex items-start gap-2 text-xs">
              <Icon name={FIELD_ICONS[r.field] || 'Circle'} size={13} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="break-words">
                  <span className="font-medium">{r.actor_name || 'Система'}</span> {describe(r)}
                </div>
                <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString('ru')}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

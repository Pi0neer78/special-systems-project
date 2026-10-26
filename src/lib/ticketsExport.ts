import * as XLSX from 'xlsx';

export type ExportTicket = {
  id: number;
  submitted_at: string;
  priority: string;
  problem_type: string;
  description: string;
  deadline: string | null;
  extra_info: string | null;
  result: string | null;
  status: string;
  resolved_at: string | null;
  assignee_name: string | null;
};

const STATUS: Record<string, string> = { new: 'Новая', in_progress: 'В процессе', resolved: 'Решена', cancelled: 'Отменена' };
const PRIORITY: Record<string, string> = { low: 'Низкий', medium: 'Средний', high: 'Высокий', urgent: 'Срочно' };

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString('ru', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const isOverdue = (t: ExportTicket) => !t.resolved_at && !!t.deadline && new Date(t.deadline) < new Date() && t.status !== 'cancelled';
const esc = (s: string | null | undefined) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

export function exportTicketsToExcel(tickets: ExportTicket[], clientName: string) {
  const rows = tickets.map(t => ({
    '№ заявки': t.id,
    'Статус': STATUS[t.status] || t.status,
    'Приоритет': PRIORITY[t.priority] || t.priority,
    'Состояние': isOverdue(t) ? 'Просрочена' : '',
    'Тип заявки': t.problem_type,
    'Описание заявки': t.description,
    'Подана': fmt(t.submitted_at),
    'Решить до': fmt(t.deadline),
    'Решена': fmt(t.resolved_at),
    'Ответственный': t.assignee_name || '',
    'Результат': t.result || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [8, 12, 12, 12, 24, 50, 18, 18, 18, 22, 40].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Заявки');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Заявки_${clientName.replace(/[^\p{L}\p{N}]+/gu, '_')}_${date}.xlsx`);
}

export function printTickets(tickets: ExportTicket[], clientName: string) {
  const cards = tickets.map(t => {
    const over = isOverdue(t);
    return `
    <div class="card ${over ? 'over' : ''}">
      <div class="head">
        <b>Заявка № ${t.id}</b>
        <span>${esc(STATUS[t.status] || t.status)}${over ? ' · <span class="red">Просрочена</span>' : ''}</span>
      </div>
      <table>
        <tr><td>Приоритет</td><td>${esc(PRIORITY[t.priority] || t.priority)}</td><td>Тип заявки</td><td>${esc(t.problem_type)}</td></tr>
        <tr><td>Подана</td><td>${fmt(t.submitted_at)}</td><td>Решить до</td><td>${fmt(t.deadline) || '—'}</td></tr>
        ${t.resolved_at || t.assignee_name ? `<tr><td>Решена</td><td>${fmt(t.resolved_at) || '—'}</td><td>Ответственный</td><td>${esc(t.assignee_name) || '—'}</td></tr>` : ''}
        <tr><td>Описание заявки</td><td colspan="3">${esc(t.description)}</td></tr>
        ${t.result ? `<tr><td>Результат</td><td colspan="3">${esc(t.result)}</td></tr>` : ''}
      </table>
    </div>`;
  }).join('');

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Список заявок</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #111; display: flex; justify-content: space-between; }
  .card { border: 1px solid #999; border-radius: 6px; margin-bottom: 10px; page-break-inside: avoid; overflow: hidden; }
  .card.over { border-color: #c00; }
  .head { background: #eee; padding: 6px 10px; display: flex; justify-content: space-between; font-size: 13px; }
  .over .head { background: #fde8e8; }
  .red { color: #c00; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 10px; border-top: 1px solid #ddd; vertical-align: top; width: 35%; }
  td:nth-child(odd) { color: #555; width: 15%; white-space: nowrap; }
  td[colspan] { width: auto; color: #111; }
  .foot { margin-top: 12px; color: #777; font-size: 10px; }
</style></head><body>
  <h1>Список заявок</h1>
  <div class="sub"><span>Клиент: ${esc(clientName)}</span><span>Сформировано: ${fmt(new Date().toISOString())} · Заявок: ${tickets.length}</span></div>
  ${cards || '<p>Заявок нет</p>'}
  <div class="foot">СпецСистемы — личный кабинет</div>
  <script>window.onload=function(){window.focus();window.print();}</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

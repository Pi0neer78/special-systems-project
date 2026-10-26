import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface SearchNav {
  folder_id?: number; credential_id?: number; files?: boolean;
  ticket_id?: number; task_id?: number; tab?: string;
}
export interface SearchItem {
  section: string; kind: string; title: string; subtitle: string;
  field: string; snippet: string; hl_start: number; hl_len: number; nav: SearchNav;
}

const SECTIONS: { id: string; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'credentials', label: 'Учетные данные', icon: 'KeyRound' },
  { id: 'tickets', label: 'Заявки клиентов', icon: 'LifeBuoy' },
  { id: 'tasks', label: 'Задачи', icon: 'CheckSquare' },
  { id: 'users', label: 'Пользователи', icon: 'Users', adminOnly: true },
  { id: 'clients', label: 'Клиенты', icon: 'Building2', adminOnly: true },
  { id: 'databases', label: 'Базы данных', icon: 'Database', adminOnly: true },
  { id: 'work_types', label: 'Виды работ', icon: 'ClipboardList', adminOnly: true },
  { id: 'planned_works', label: 'Плановые работы', icon: 'CalendarClock', adminOnly: true },
];

const STORAGE_KEY = 'wp_global_search';

export default function GlobalSearch({ open, onClose, apiUrl, token, isAdmin, onNavigate }: {
  open: boolean; onClose: () => void; apiUrl: string; token: string; isAdmin: boolean;
  onNavigate: (item: SearchItem) => void;
}) {
  const available = SECTIONS.filter(s => !s.adminOnly || isAdmin);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; } })();
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState<boolean>(!!saved.matchCase);
  const [wholeWord, setWholeWord] = useState<boolean>(!!saved.wholeWord);
  const [sections, setSections] = useState<Set<string>>(new Set(saved.sections || available.map(s => s.id)));
  const [loading, setLoading] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [results, setResults] = useState<Record<string, SearchItem[]>>({});
  const [lastQuery, setLastQuery] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ matchCase, wholeWord, sections: [...sections] }));
  }, [matchCase, wholeWord, sections]);

  const toggle = (id: string) => setSections(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const run = async () => {
    const q = query.trim();
    if (!q) { toast.error('Введите, что искать'); return; }
    const chosen = available.filter(s => sections.has(s.id)).map(s => s.id);
    if (chosen.length === 0) { toast.error('Выберите хотя бы один раздел'); return; }
    setLoading(true);
    const params = new URLSearchParams({ resource: 'search', q, sections: chosen.join(','), case: matchCase ? '1' : '0', whole: wholeWord ? '1' : '0' });
    const d = await fetch(`${apiUrl}?${params}`, { headers: { 'X-Admin-Token': token } }).then(r => r.json()).catch(() => null);
    setLoading(false);
    if (!d || !d.results) { toast.error('Не удалось выполнить поиск'); return; }
    setResults(d.results);
    setLastQuery(q);
    onClose();
    setResultsOpen(true);
  };

  const total = Object.values(results).reduce((n, l) => n + l.length, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Глобальный поиск</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Что искать"
              onKeyDown={e => { if (e.key === 'Enter') run(); }} />
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={matchCase} onChange={e => setMatchCase(e.target.checked)} /> Учитывать регистр</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={wholeWord} onChange={e => setWholeWord(e.target.checked)} /> Слова целиком</label>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs font-medium text-muted-foreground">Где искать</div>
                <div className="flex gap-3 text-xs">
                  <button className="text-primary hover:underline" onClick={() => setSections(new Set(available.map(s => s.id)))}>Все</button>
                  <button className="text-muted-foreground hover:underline" onClick={() => setSections(new Set())}>Снять</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {available.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={sections.has(s.id)} onChange={() => toggle(s.id)} />
                    <Icon name={s.icon} size={13} className="text-muted-foreground" /> {s.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Отмена</Button>
              <Button onClick={run} disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Icon name={loading ? 'Loader' : 'Search'} size={14} className={`mr-1 ${loading ? 'animate-spin' : ''}`} /> {loading ? 'Поиск...' : 'Поиск'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="pr-6">Результаты поиска: «{lastQuery}» <span className="text-muted-foreground font-normal text-sm">— найдено {total}</span></DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {total === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Ничего не найдено</p>}
            {SECTIONS.filter(s => results[s.id]?.length).map(s => (
              <div key={s.id}>
                <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-primary mb-1.5">
                  <Icon name={s.icon} size={13} /> {s.label} <span className="text-muted-foreground">({results[s.id].length})</span>
                </div>
                <div className="border border-border rounded-md divide-y divide-border/60">
                  {results[s.id].map((it, i) => (
                    <button key={i} onClick={() => { setResultsOpen(false); onNavigate(it); }}
                      className="w-full text-left px-3 py-2 hover:bg-secondary/50 transition-colors">
                      <div className="text-sm font-medium text-primary hover:underline break-words">{it.title}</div>
                      {it.subtitle && <div className="text-[11px] text-muted-foreground">{it.subtitle}</div>}
                      <div className="text-xs text-muted-foreground mt-0.5 break-words">
                        {it.field}: {it.snippet.slice(0, it.hl_start)}
                        <mark className="bg-yellow-400/40 text-foreground rounded-sm px-0.5">{it.snippet.slice(it.hl_start, it.hl_start + it.hl_len)}</mark>
                        {it.snippet.slice(it.hl_start + it.hl_len)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setResultsOpen(false); onClose(); setTimeout(() => window.dispatchEvent(new Event('global-search-open')), 0); }}>
              <Icon name="ArrowLeft" size={14} className="mr-1" /> Новый поиск
            </Button>
            <Button variant="outline" onClick={() => setResultsOpen(false)}>Закрыть</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

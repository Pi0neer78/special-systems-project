import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';


const AUTH_URL = 'https://functions.poehali.dev/115d85ec-a990-4455-824d-27487ad441c1';
const API_URL = 'https://functions.poehali.dev/448dd00e-0d3a-4719-8808-375730e12b42';
const TOKEN_KEY = 'admin_token';

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

async function api(qs: string, method = 'GET', body?: object) {
  const res = await fetch(`${API_URL}?${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

interface Folder { id: number; parent_id: number | null; name: string; sort_order: number; }
interface Credential {
  id: number; folder_id: number | null; name: string;
  login: string; password: string;
  login1: string; password1: string; login2: string; password2: string;
  login3: string; password3: string; ip: string; notes: string;
}
interface UpdateRow {
  client_db_id: number; client_id: number; client_name: string;
  config_db_id: number; config_name: string;
  current_config_version: string | null; actual_config_version: string | null;
  update_date: string | null; updated_by_name: string | null; updated_by_login: string | null;
}
interface HistoryRow {
  id: number; client_name: string; config_name: string;
  updated_by_name: string | null; updated_by_login: string | null;
  old_version: string | null; new_version: string | null;
  update_date: string; created_at: string; info: string | null;
}
interface AdminUser { id: number; login: string; full_name: string | null; }

// ══════════════════════════════════════════════════════════════════════════════
// COPY BUTTON
// ══════════════════════════════════════════════════════════════════════════════

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title="Копировать" className={`p-1.5 rounded transition-colors ${copied ? 'text-green-400' : 'text-muted-foreground hover:text-foreground'}`}>
      <Icon name={copied ? 'Check' : 'Copy'} size={14} />
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREDENTIALS SECTION
// ══════════════════════════════════════════════════════════════════════════════

const EMPTY_CRED: Omit<Credential, 'id'> = {
  folder_id: null, name: '', login: '', password: '',
  login1: '', password1: '', login2: '', password2: '',
  login3: '', password3: '', ip: '', notes: '',
};

function buildTree(folders: Folder[], parentId: number | null = null): Folder[] {
  return folders.filter(f => f.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function FolderNode({
  folder, folders, selectedId, onSelect, onMenu, depth,
}: {
  folder: Folder; folders: Folder[]; selectedId: number | null;
  onSelect: (id: number) => void; onMenu: (e: React.MouseEvent, folder: Folder) => void; depth: number;
}) {
  const [open, setOpen] = useState(true);
  const children = buildTree(folders, folder.id);
  const isRoot = folder.parent_id === null;

  return (
    <div>
      <div
        className={`group flex items-center gap-1 px-2 py-1 rounded cursor-pointer select-none transition-colors ${
          selectedId === folder.id ? 'bg-primary/20 text-primary' : 'hover:bg-secondary/60'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => { onSelect(folder.id); if (children.length) setOpen(o => !o); }}
        onContextMenu={e => { e.preventDefault(); onMenu(e, folder); }}
      >
        {children.length > 0
          ? <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={12} className="text-muted-foreground shrink-0" />
          : <span className="w-3 shrink-0" />
        }
        <Icon name={isRoot ? 'Database' : 'Folder'} size={13} className={selectedId === folder.id ? 'text-primary' : 'text-muted-foreground'} />
        <span className="text-sm truncate">{folder.name}</span>
      </div>
      {open && children.map(ch => (
        <FolderNode key={ch.id} folder={ch} folders={folders} selectedId={selectedId}
          onSelect={onSelect} onMenu={onMenu} depth={depth + 1} />
      ))}
    </div>
  );
}

const PANEL_WIDTH_KEY = 'wp_cred_panel_width';
const DEFAULT_PANEL_W = 30;

function CredentialsSection() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [creds, setCreds] = useState<Credential[]>([]);
  const [selectedCred, setSelectedCred] = useState<Credential | null>(null);
  const [form, setForm] = useState<Omit<Credential, 'id'>>(EMPTY_CRED);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const [modal, setModal] = useState<{ type: 'rename' | 'create' | 'move'; folder?: Folder } | null>(null);
  const [modalVal, setModalVal] = useState('');
  const [moveTo, setMoveTo] = useState<string>('');
  const ctxRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const savedW = parseFloat(localStorage.getItem(PANEL_WIDTH_KEY) || String(DEFAULT_PANEL_W));
  const [panelW, setPanelW] = useState<number>(isNaN(savedW) ? DEFAULT_PANEL_W : savedW);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(Math.max(pct, 15), 60);
      setPanelW(clamped);
    };
    const onUp = () => {
      isResizing.current = false;
      setPanelW(prev => { localStorage.setItem(PANEL_WIDTH_KEY, String(prev)); return prev; });
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const loadFolders = () => api('resource=folders').then(d => { if (Array.isArray(d)) setFolders(d); });

  const selectCredData = (c: Credential) => {
    setSelectedCred(c);
    setForm({ folder_id: c.folder_id, name: c.name, login: c.login || '', password: c.password || '', login1: c.login1 || '', password1: c.password1 || '', login2: c.login2 || '', password2: c.password2 || '', login3: c.login3 || '', password3: c.password3 || '', ip: c.ip || '', notes: c.notes || '' });
    setDirty(false);
  };
  const selectCred = selectCredData;

  const loadCreds = (fid: number) => api(`resource=credentials&folder_id=${fid}`).then(d => {
    if (Array.isArray(d)) {
      setCreds(d);
      if (d.length > 0) selectCredData(d[0]);
      else { setSelectedCred(null); setForm(EMPTY_CRED); setDirty(false); }
    }
  });

  useEffect(() => { loadFolders(); }, []);
  useEffect(() => {
    if (selectedFolder !== null) { loadCreds(selectedFolder); }
  }, [selectedFolder]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const newCred = () => {
    setSelectedCred(null);
    setForm({ ...EMPTY_CRED, folder_id: selectedFolder });
    setDirty(true);
  };

  const save = async () => {
    if (selectedCred) {
      await api(`resource=credentials&id=${selectedCred.id}`, 'PUT', form);
    } else {
      await api('resource=credentials', 'POST', form);
    }
    setDirty(false);
    if (selectedFolder !== null) loadCreds(selectedFolder);
  };

  const cancel = () => {
    if (selectedCred) selectCred(selectedCred);
    else { setForm(EMPTY_CRED); setDirty(false); }
  };

  const ff = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(f => ({ ...f, [field]: e.target.value })); setDirty(true);
  };

  const onMenu = (e: React.MouseEvent, folder: Folder) => {
    setCtxMenu({ x: e.clientX, y: e.clientY, folder });
  };

  const doRename = async () => {
    if (!modal?.folder) return;
    await api(`resource=folders&id=${modal.folder.id}`, 'PUT', { name: modalVal });
    setModal(null); loadFolders();
  };

  const doCreate = async () => {
    const parentId = modal?.type === 'create' ? (modal.folder?.id ?? null) : null;
    await api('resource=folders', 'POST', { parent_id: parentId, name: modalVal });
    setModal(null); loadFolders();
  };

  const doMove = async () => {
    if (!modal?.folder) return;
    await api(`resource=folders&id=${modal.folder.id}`, 'PATCH', { parent_id: moveTo === '__root__' ? null : Number(moveTo) });
    setModal(null); loadFolders();
  };

  const filteredFolders = filter
    ? folders.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
    : folders;

  const rootFolders = buildTree(filteredFolders, null);

  const F_W = 'w-[24ch] h-7 bg-secondary/40 border-border text-sm font-mono px-2';

  return (
    <div ref={containerRef} className="flex gap-0 h-[calc(100vh-120px)] relative select-none">
      {/* Левая панель — дерево */}
      <div className="border-r border-border flex flex-col shrink-0" style={{ width: `${panelW}%` }}>
        <div className="p-2 border-b border-border flex gap-1">
          <Input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Фильтр разделов..." className="h-7 text-xs bg-secondary/40 border-border" />
          <Button size="icon" variant="outline" className="h-7 w-7 shrink-0 border-border" title="Новый корневой раздел" onClick={() => { setModalVal(''); setModal({ type: 'create', folder: undefined }); }}>
            <Icon name="Plus" size={13} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1 relative" onClick={() => setCtxMenu(null)}>
          {rootFolders.map(f => (
            <FolderNode key={f.id} folder={f} folders={filteredFolders} selectedId={selectedFolder}
              onSelect={setSelectedFolder} onMenu={onMenu} depth={0} />
          ))}
        </div>
      </div>

      {/* Ресайзер */}
      <div
        onMouseDown={startResize}
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors z-10"
        title="Перетащите для изменения ширины"
      />

      {/* Контекстное меню */}
      {ctxMenu && (
        <div ref={ctxRef} className="fixed z-50 bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-secondary/60 text-left" onClick={() => { setModalVal(ctxMenu.folder.name); setModal({ type: 'rename', folder: ctxMenu.folder }); setCtxMenu(null); }}>
            <Icon name="Pencil" size={13} /> Переименовать
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-secondary/60 text-left" onClick={() => { setModalVal(''); setModal({ type: 'create', folder: ctxMenu.folder }); setCtxMenu(null); }}>
            <Icon name="FolderPlus" size={13} /> Создать подраздел
          </button>
          <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-secondary/60 text-left" onClick={() => { setMoveTo(''); setModal({ type: 'move', folder: ctxMenu.folder }); setCtxMenu(null); }}>
            <Icon name="FolderSymlink" size={13} /> Переместить
          </button>
        </div>
      )}

      {/* Правая панель — учётные данные */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedFolder !== null ? (
          <>
            {/* Список записей */}
            <div className="border-b border-border p-2 flex gap-2 items-center flex-wrap">
              {creds.map(c => (
                <button key={c.id} onClick={() => selectCred(c)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${selectedCred?.id === c.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 hover:bg-secondary border border-border'}`}>
                  {c.name || '(без названия)'}
                </button>
              ))}
              <Button size="sm" variant="outline" className="h-7 border-dashed border-border text-muted-foreground hover:text-foreground" onClick={newCred}>
                <Icon name="Plus" size={13} className="mr-1" /> Новая запись
              </Button>
            </div>

            {/* Форма */}
            <div className="flex-1 overflow-y-auto p-5">
              {(selectedCred || dirty) ? (
                <div className="space-y-4 max-w-xl">
                  {/* Название */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Название</label>
                    <Input value={form.name} onChange={ff('name')} className="bg-secondary/40 border-border h-8 text-sm" placeholder="Название записи" />
                  </div>

                  {/* Логин и Пароль */}
                  <div className="flex items-end gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Логин</label>
                      <div className="flex items-center gap-1">
                        <Input value={form.login} onChange={ff('login')} className={F_W} placeholder="Логин" />
                        <CopyBtn value={form.login} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Пароль</label>
                      <div className="flex items-center gap-1">
                        <Input type="text" value={form.password} onChange={ff('password')} className={F_W} placeholder="Пароль" />
                        <CopyBtn value={form.password} />
                      </div>
                    </div>
                  </div>

                  {/* IP */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">IP-адрес</label>
                    <div className="flex items-center gap-1">
                      <Input value={form.ip} onChange={ff('ip')} className={F_W} />
                      <CopyBtn value={form.ip} />
                    </div>
                  </div>

                  {/* Логины/пароли */}
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">Учётные записи</div>
                    {([
                      { n: 1, lk: 'login1' as const, pk: 'password1' as const },
                      { n: 2, lk: 'login2' as const, pk: 'password2' as const },
                      { n: 3, lk: 'login3' as const, pk: 'password3' as const },
                    ]).map(({ n, lk, pk }) => (
                      <div key={n} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-8 shrink-0">ID{n}</span>
                        <Input value={form[lk] || ''} onChange={ff(lk)} className={F_W} placeholder={`Логин ${n}`} />
                        <CopyBtn value={form[lk] || ''} />
                        <span className="text-xs text-muted-foreground w-10 shrink-0">PWD{n}</span>
                        <Input type="text" value={form[pk] || ''} onChange={ff(pk)} className={F_W} placeholder={`Пароль ${n}`} />
                        <CopyBtn value={form[pk] || ''} />
                      </div>
                    ))}
                  </div>

                  {/* Заметки */}
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Заметки</label>
                    <Textarea value={form.notes} onChange={ff('notes')} rows={8} className="bg-secondary/40 border-border text-sm resize-none" />
                  </div>

                  {/* Кнопки */}
                  <div className="flex justify-center gap-3 pt-2">
                    <Button onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">
                      <Icon name="Save" size={15} className="mr-2" /> Сохранить
                    </Button>
                    <Button variant="outline" onClick={cancel} className="border-border">
                      <Icon name="X" size={15} className="mr-2" /> Отменить
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                  <Icon name="Lock" size={40} className="opacity-20" />
                  <p className="text-sm">Выберите запись или создайте новую</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Icon name="FolderOpen" size={48} className="opacity-20" />
            <p className="text-sm">Выберите раздел в дереве слева</p>
          </div>
        )}
      </div>

      {/* Модалки */}
      <Dialog open={modal?.type === 'rename'} onOpenChange={() => setModal(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>Переименовать раздел</DialogTitle></DialogHeader>
          <Input value={modalVal} onChange={e => setModalVal(e.target.value)} className="bg-secondary/40 border-border" autoFocus onKeyDown={e => e.key === 'Enter' && doRename()} />
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
            <Button onClick={doRename}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.type === 'create'} onOpenChange={() => setModal(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>{modal?.folder ? `Подраздел в «${modal.folder.name}»` : 'Новый корневой раздел'}</DialogTitle></DialogHeader>
          <Input value={modalVal} onChange={e => setModalVal(e.target.value)} placeholder="Название раздела" className="bg-secondary/40 border-border" autoFocus onKeyDown={e => e.key === 'Enter' && doCreate()} />
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
            <Button onClick={doCreate}>Создать</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modal?.type === 'move'} onOpenChange={() => setModal(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>Переместить «{modal?.folder?.name}»</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <label className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
              <input type="radio" name="move" value="__root__" checked={moveTo === '__root__'} onChange={e => setMoveTo(e.target.value)} />
              <span className="text-sm">/ (корень)</span>
            </label>
            {folders.filter(f => f.id !== modal?.folder?.id).map(f => (
              <label key={f.id} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
                <input type="radio" name="move" value={String(f.id)} checked={moveTo === String(f.id)} onChange={e => setMoveTo(e.target.value)} />
                <span className="text-sm">{f.name}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
            <Button onClick={doMove} disabled={!moveTo}>Переместить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// UPDATES SECTION
// ══════════════════════════════════════════════════════════════════════════════

function versionGt(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0, nb = pb[i] ?? 0;
    if (nb > na) return true;
    if (nb < na) return false;
  }
  return false;
}

function UpdatesSection() {
  const [rows, setRows] = useState<UpdateRow[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [updateModal, setUpdateModal] = useState<UpdateRow | null>(null);
  const [historyModal, setHistoryModal] = useState<{ row: UpdateRow; history: HistoryRow[] } | null>(null);
  const [upForm, setUpForm] = useState({ user_id: '', version: '', date: new Date().toISOString().slice(0, 10), info: '' });
  const [saving, setSaving] = useState(false);

  const load = () => api('resource=updates').then(d => { if (Array.isArray(d)) setRows(d); });
  useEffect(() => {
    load();
    api('resource=users').then(d => { if (Array.isArray(d)) setUsers(d); });
  }, []);

  const openHistory = async (row: UpdateRow) => {
    const h = await api(`resource=history&client_db_id=${row.client_db_id}`);
    setHistoryModal({ row, history: Array.isArray(h) ? h : [] });
  };

  const openUpdate = (row: UpdateRow) => {
    setUpForm({ user_id: '', version: row.actual_config_version || '', date: new Date().toISOString().slice(0, 10), info: '' });
    setUpdateModal(row);
  };

  const submitUpdate = async () => {
    if (!updateModal) return;
    setSaving(true);
    await api('resource=history', 'POST', {
      client_id: updateModal.client_id,
      client_database_id: updateModal.client_db_id,
      updated_by_user_id: upForm.user_id ? Number(upForm.user_id) : null,
      old_version: updateModal.current_config_version,
      new_version: upForm.version,
      update_date: upForm.date,
      info: upForm.info,
    });
    setSaving(false);
    setUpdateModal(null);
    load();
  };

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase">Клиент</th>
            <th className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase">База данных</th>
            <th className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase">Текущая версия</th>
            <th className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase">Актуальная</th>
            <th className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase">Дата обновления</th>
            <th className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase">Кто обновил</th>
            <th className="px-3 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const outdated = versionGt(row.actual_config_version, row.current_config_version);
            return (
              <tr key={row.client_db_id} className={`border-b border-border/50 transition-colors ${outdated ? 'bg-yellow-500/8 hover:bg-yellow-500/12' : 'hover:bg-secondary/30'}`}>
                <td className="px-3 py-2.5 font-medium">{row.client_name}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{row.config_name}</td>
                <td className={`px-3 py-2.5 font-mono text-sm ${outdated ? 'text-yellow-400 font-semibold' : ''}`}>
                  {row.current_config_version || <span className="text-muted-foreground">—</span>}
                  {outdated && <Icon name="AlertTriangle" size={13} className="inline ml-1.5 text-yellow-400" />}
                </td>
                <td className="px-3 py-2.5 font-mono text-sm text-green-400">{row.actual_config_version || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{row.update_date || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground text-xs">{row.updated_by_name || row.updated_by_login || '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1.5 justify-end">
                    <Button size="sm" className="h-7 text-xs bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25" onClick={() => openUpdate(row)}>
                      <Icon name="RefreshCw" size={12} className="mr-1" /> Обновить
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-border" onClick={() => openHistory(row)}>
                      <Icon name="History" size={12} className="mr-1" /> История
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground text-sm">Нет данных</td></tr>
          )}
        </tbody>
      </table>

      {/* Модалка обновления */}
      <Dialog open={!!updateModal} onOpenChange={() => setUpdateModal(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="RefreshCw" className="text-primary" size={20} />
              Обновление версии
            </DialogTitle>
          </DialogHeader>
          {updateModal && (
            <div className="space-y-4 mt-1">
              <div className="p-3 rounded-lg bg-secondary/40 border border-border text-sm">
                <div className="text-muted-foreground mb-1">Клиент: <span className="text-foreground font-medium">{updateModal.client_name}</span></div>
                <div className="text-muted-foreground">База: <span className="text-foreground">{updateModal.config_name}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Старая версия</label>
                  <Input value={updateModal.current_config_version || ''} disabled className="bg-secondary/20 border-border h-8 text-sm opacity-60" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Новая версия *</label>
                  <Input value={upForm.version} onChange={e => setUpForm(f => ({ ...f, version: e.target.value }))} className="bg-secondary/40 border-border h-8 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Кто обновил *</label>
                <select value={upForm.user_id} onChange={e => setUpForm(f => ({ ...f, user_id: e.target.value }))}
                  className="w-full h-8 text-sm bg-secondary/40 border border-border rounded-md px-2 text-foreground">
                  <option value="">— выберите —</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.login}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Дата обновления *</label>
                <Input type="date" value={upForm.date} onChange={e => setUpForm(f => ({ ...f, date: e.target.value }))} className="bg-secondary/40 border-border h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Информация</label>
                <Textarea value={upForm.info} onChange={e => setUpForm(f => ({ ...f, info: e.target.value }))} rows={3} className="bg-secondary/40 border-border text-sm resize-none" />
              </div>
              <div className="flex gap-2 justify-center pt-1">
                <Button onClick={submitUpdate} disabled={saving || !upForm.version || !upForm.date} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Icon name="Save" size={15} className="mr-2" /> {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
                <Button variant="outline" onClick={() => setUpdateModal(null)} className="border-border">Отмена</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Модалка истории */}
      <Dialog open={!!historyModal} onOpenChange={() => setHistoryModal(null)}>
        <DialogContent className="bg-card border-border max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="History" className="text-primary" size={20} />
              История обновлений — {historyModal?.row.client_name} / {historyModal?.row.config_name}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Дата обновления</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Кто обновил</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground font-mono">Старая</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground font-mono">Новая</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Информация</th>
                  <th className="text-left px-3 py-2 text-xs text-muted-foreground">Запись</th>
                </tr>
              </thead>
              <tbody>
                {historyModal?.history.map(h => (
                  <tr key={h.id} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="px-3 py-2 text-xs">{h.update_date}</td>
                    <td className="px-3 py-2 text-xs">{h.updated_by_name || h.updated_by_login || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{h.old_version || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-green-400">{h.new_version || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate" title={h.info || ''}>{h.info || '—'}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(h.created_at).toLocaleString('ru')}</td>
                  </tr>
                ))}
                {historyModal?.history.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">История пуста</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TICKETS SECTION (заглушка)
// ══════════════════════════════════════════════════════════════════════════════

function TicketsSection() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
      <Icon name="TicketCheck" size={48} className="opacity-20" />
      <p className="text-sm">Раздел «Заявки клиентов» в разработке</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════

type AuthInfo = { role: 'admin' | 'user'; user_id: number; login: string; full_name?: string };

function WorkLogin({ onLogin }: { onLogin: (info: AuthInfo) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
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
            <Icon name="Briefcase" className="text-primary" size={20} />
          </span>
          <div>
            <div className="font-display text-lg uppercase tracking-wide">Спец<span className="text-primary">Системы</span></div>
            <div className="text-xs text-muted-foreground font-mono">Рабочая панель</div>
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
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'credentials' | 'updates' | 'tickets';

export default function WorkPanel() {
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);
  const [tab, setTab] = useState<Tab>('credentials');

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch(AUTH_URL, { headers: { 'X-Admin-Token': token } })
      .then(r => r.json())
      .then(d => { if (d.ok) setAuthInfo({ role: d.role, user_id: d.user_id, login: d.login, full_name: d.full_name }); })
      .catch(() => {});
  }, []);

  const logout = () => { localStorage.removeItem(TOKEN_KEY); setAuthInfo(null); };

  if (!authInfo) return <WorkLogin onLogin={setAuthInfo} />;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'credentials', label: 'Учётные данные', icon: 'Lock' },
    { id: 'updates', label: 'Обновления', icon: 'RefreshCw' },
    { id: 'tickets', label: 'Заявки клиентов', icon: 'TicketCheck' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/15 border border-primary/40">
              <Icon name="Briefcase" className="text-primary" size={16} />
            </span>
            <span className="font-display text-base uppercase tracking-wide">
              Спец<span className="text-primary">Системы</span>
            </span>
            <span className="hidden sm:inline text-xs font-mono text-muted-foreground border border-border rounded px-2 py-0.5">
              Рабочая панель
            </span>
          </div>
          <div className="flex items-center gap-2">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all ${
                  tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}>
                <Icon name={t.icon} size={14} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
            <div className="ml-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Icon name="User" size={13} />
              <span className="hidden sm:inline">{authInfo.full_name || authInfo.login}</span>
            </div>
            <a href="/admin" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="Перейти в панель администратора">
              <Icon name="ShieldCheck" size={14} />
              <span className="hidden sm:inline">Админ</span>
            </a>
            <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors p-1.5" title="Выйти">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {tab === 'credentials' && <CredentialsSection />}
        {tab === 'updates' && (
          <div className="container py-6">
            <UpdatesSection />
          </div>
        )}
        {tab === 'tickets' && (
          <div className="container py-6">
            <TicketsSection />
          </div>
        )}
      </main>
    </div>
  );
}
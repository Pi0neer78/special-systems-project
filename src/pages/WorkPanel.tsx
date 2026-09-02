import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import ThemeToggle from '@/components/ThemeToggle';
import workPanelBg from '@/assets/work-panel-bg.jpg';
import { tryReadStoredKey, pickAndReadKey, pickKeyViaInput, clearKeyFileHandle, isFileSystemAccessSupported } from '@/lib/keyFileStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';


const AUTH_URL = 'https://functions.poehali.dev/115d85ec-a990-4455-824d-27487ad441c1';
const API_URL = 'https://functions.poehali.dev/448dd00e-0d3a-4719-8808-375730e12b42';
const TICKETS_URL = 'https://functions.poehali.dev/4866cc97-c798-42d4-a280-d35071d704a8';
const TASKS_URL = 'https://functions.poehali.dev/98d6bd0b-ee47-46a8-9fdb-701e4c507b47';
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
interface CredFile {
  id: number; credential_id: number; file_name: string; file_url: string;
  file_size: number | null; content_type: string | null; created_at: string;
}
interface UpdateRow {
  client_db_id: number; client_id: number; client_parent_id: number | null; client_name: string;
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

async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    throw new Error('clipboard API unavailable');
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

async function launchAnyDesk(id: string, password: string) {
  if (!id) { toast.error('Не заполнен ID1 для AnyDesk'); return; }
  const copied = password ? await copyToClipboard(password) : false;
  window.location.href = `anydesk:${id}`;
  if (password && !copied) {
    toast.error('AnyDesk запущен, но пароль скопировать не удалось — скопируйте вручную');
  } else {
    toast.success(copied ? 'AnyDesk запущен, пароль скопирован — вставьте Ctrl+V' : 'AnyDesk запущен');
  }
}

function rmsQuote(v: string) {
  return v.includes(' ') ? `"${v}"` : v;
}

function toHex(str: string) {
  return Array.from(new TextEncoder().encode(str)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function launchRMS(id: string, password: string) {
  if (!id) { toast.error('Не заполнен ID2 для RMS'); return; }
  const lines = [
    '-create',
    `-name:${rmsQuote('Быстрое подключение')}`,
    `-host:${id}`,
  ];
  if (password) lines.push(`-password:${rmsQuote(password)}`, '-savepassword');
  lines.push('-fullcontrol');
  const uri = `rms:${toHex(lines.join('\r\n'))}`;
  window.location.href = uri;
  toast.success('RMS запущен с подключением к ' + id);
}

async function launchRuDesktop(id: string, password: string) {
  if (!id) { toast.error('Не заполнен ID3 для RuDesktop'); return; }
  const copied = password ? await copyToClipboard(password) : false;
  window.location.href = `rudesktop://${id}`;
  if (password && !copied) {
    toast.error('RuDesktop запущен, но пароль скопировать не удалось — скопируйте вручную');
  } else {
    toast.success(copied ? 'RuDesktop запущен, пароль скопирован — вставьте Ctrl+V' : 'RuDesktop запущен');
  }
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const ok = await copyToClipboard(value || '');
    if (!ok) { toast.error('Не удалось скопировать'); return; }
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
// CREDENTIAL FILES
// ══════════════════════════════════════════════════════════════════════════════

function formatFileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileIconName(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'Image';
  if (['pdf'].includes(ext)) return 'FileText';
  if (['doc', 'docx'].includes(ext)) return 'FileText';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'FileSpreadsheet';
  if (['zip', 'rar', '7z'].includes(ext)) return 'FileArchive';
  return 'File';
}

function CredFilesBlock({ credentialId, onCountChange }: { credentialId: number; onCountChange?: (count: number) => void }) {
  const [files, setFiles] = useState<CredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    api(`resource=files&credential_id=${credentialId}`).then(d => {
      setLoading(false);
      if (Array.isArray(d)) { setFiles(d); onCountChange?.(d.length); }
    });
  };

  useEffect(() => { load(); }, [credentialId]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list || list.length === 0) return;
    setUploading(true);
    for (const file of Array.from(list)) {
      const data: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api('resource=files', 'POST', {
        credential_id: credentialId,
        file_name: file.name,
        content_type: file.type || 'application/octet-stream',
        data,
      });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    load();
  };

  const doDelete = async (id: number) => {
    setDeletingId(id);
    await api(`resource=files&id=${id}`, 'DELETE');
    setDeletingId(null);
    load();
  };

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-mono text-primary uppercase tracking-widest">Файлы</div>
        <Button size="sm" variant="outline" disabled={uploading} className="h-7 border-dashed border-border text-muted-foreground hover:text-foreground" onClick={() => inputRef.current?.click()}>
          <Icon name={uploading ? 'Loader' : 'Upload'} size={13} className={`mr-1 ${uploading ? 'animate-spin' : ''}`} /> {uploading ? 'Загрузка...' : 'Добавить файл'}
        </Button>
        <input ref={inputRef} type="file" multiple className="hidden" onChange={onPick} />
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2 py-2">
          <Icon name="Loader" size={13} className="animate-spin" /> Загрузка...
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">Файлов пока нет</p>
      ) : (
        <div className="space-y-1.5">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-2 group bg-secondary/30 rounded-md px-2.5 py-1.5">
              <Icon name={fileIconName(f.file_name)} size={14} className="text-muted-foreground shrink-0" />
              <a href={f.file_url} target="_blank" rel="noreferrer" className="text-sm truncate hover:text-primary transition-colors flex-1 min-w-0">
                {f.file_name}
              </a>
              {f.file_size != null && <span className="text-xs text-muted-foreground shrink-0">{formatFileSize(f.file_size)}</span>}
              <button onClick={() => doDelete(f.id)} disabled={deletingId === f.id} title="Удалить файл"
                className="p-1 rounded text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Icon name={deletingId === f.id ? 'Loader' : 'Trash2'} size={13} className={deletingId === f.id ? 'animate-spin' : ''} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-inherit rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function FolderNode({
  folder, folders, selectedId, onSelect, onMenu, depth, forceExpand, highlight,
}: {
  folder: Folder; folders: Folder[]; selectedId: number | null;
  onSelect: (id: number) => void; onMenu: (e: React.MouseEvent, folder: Folder) => void; depth: number;
  forceExpand?: boolean; highlight?: string;
}) {
  const isRoot = folder.parent_id === null;
  const [open, setOpen] = useState(isRoot);
  const children = buildTree(folders, folder.id);
  const effectiveOpen = forceExpand || open;

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
          ? <Icon name={effectiveOpen ? 'ChevronDown' : 'ChevronRight'} size={12} className="text-muted-foreground shrink-0" />
          : <span className="w-3 shrink-0" />
        }
        <Icon name={isRoot ? 'Database' : 'Folder'} size={13} className={selectedId === folder.id ? 'text-primary' : 'text-muted-foreground'} />
        <span className="text-sm truncate"><HighlightText text={folder.name} query={highlight || ''} /></span>
      </div>
      {effectiveOpen && children.map(ch => (
        <FolderNode key={ch.id} folder={ch} folders={folders} selectedId={selectedId}
          onSelect={onSelect} onMenu={onMenu} depth={depth + 1} forceExpand={forceExpand} highlight={highlight} />
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
  const [filesContainer, setFilesContainer] = useState<{ id: number; folder_id: number; name: string } | null>(null);
  const [filesCount, setFilesCount] = useState(0);
  const [viewingFiles, setViewingFiles] = useState(false);
  const [form, setForm] = useState<Omit<Credential, 'id'>>(EMPTY_CRED);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; folder: Folder } | null>(null);
  const [modal, setModal] = useState<{ type: 'rename' | 'create' | 'move' | 'delete-folder'; folder?: Folder } | null>(null);
  const [modalVal, setModalVal] = useState('');
  const [moveTo, setMoveTo] = useState<string>('');
  const [deletingFolder, setDeletingFolder] = useState(false);
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
    setViewingFiles(false);
    setSelectedCred(c);
    setForm({ folder_id: c.folder_id, name: c.name, login: c.login || '', password: c.password || '', login1: c.login1 || '', password1: c.password1 || '', login2: c.login2 || '', password2: c.password2 || '', login3: c.login3 || '', password3: c.password3 || '', ip: c.ip || '', notes: c.notes || '' });
    setDirty(false);
  };
  const selectCred = selectCredData;

  const loadCreds = (fid: number) => api(`resource=credentials&folder_id=${fid}`).then(d => {
    if (Array.isArray(d)) {
      setCreds(d);
      if (d.length > 0) selectCredData(d[0]);
      else { setViewingFiles(false); setSelectedCred(null); setForm(EMPTY_CRED); setDirty(false); }
    }
  });

  const loadFilesContainer = (fid: number) => api(`resource=files-container&folder_id=${fid}`).then(d => {
    if (d && d.id) {
      setFilesContainer(d);
      api(`resource=files&credential_id=${d.id}`).then(files => {
        if (Array.isArray(files)) setFilesCount(files.length);
      });
    }
  });

  useEffect(() => { loadFolders(); }, []);
  useEffect(() => {
    if (selectedFolder !== null) { loadCreds(selectedFolder); loadFilesContainer(selectedFolder); }
  }, [selectedFolder]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const newCred = () => {
    setViewingFiles(false);
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
    toast.success('Данные сохранены');
  };

  const [confirmCancel, setConfirmCancel] = useState(false);

  const cancel = () => {
    if (selectedCred) selectCred(selectedCred);
    else { setForm(EMPTY_CRED); setDirty(false); }
    setConfirmCancel(false);
  };

  const [confirmDeleteCred, setConfirmDeleteCred] = useState<Credential | null>(null);
  const [deletingCred, setDeletingCred] = useState(false);

  const doDeleteCred = async () => {
    if (!confirmDeleteCred) return;
    setDeletingCred(true);
    await api(`resource=credentials&id=${confirmDeleteCred.id}`, 'DELETE');
    setDeletingCred(false);
    setConfirmDeleteCred(null);
    if (selectedFolder !== null) loadCreds(selectedFolder);
    toast.success('Данные удалены');
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

  const doDeleteFolder = async () => {
    if (!modal?.folder) return;
    setDeletingFolder(true);
    await api(`resource=folders&id=${modal.folder.id}`, 'DELETE');
    setDeletingFolder(false);
    if (selectedFolder === modal.folder.id) { setSelectedFolder(null); setSelectedCred(null); setForm(EMPTY_CRED); setDirty(false); }
    setModal(null);
    loadFolders();
  };

  const filteredFolders = (() => {
    if (!filter) return folders;
    const q = filter.toLowerCase();
    const byId = new Map(folders.map(f => [f.id, f]));
    const keep = new Set<number>();

    const addAncestors = (f: Folder) => {
      let cur: Folder | undefined = f;
      while (cur) {
        if (keep.has(cur.id)) break;
        keep.add(cur.id);
        cur = cur.parent_id !== null ? byId.get(cur.parent_id) : undefined;
      }
    };
    const addDescendants = (id: number) => {
      for (const ch of folders.filter(f => f.parent_id === id)) {
        if (!keep.has(ch.id)) { keep.add(ch.id); addDescendants(ch.id); }
      }
    };

    for (const f of folders) {
      if (f.name.toLowerCase().includes(q)) {
        addAncestors(f);
        addDescendants(f.id);
      }
    }
    return folders.filter(f => keep.has(f.id));
  })();

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
              onSelect={setSelectedFolder} onMenu={onMenu} depth={0} forceExpand={!!filter} highlight={filter} />
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
          <div className="h-px bg-border my-1" />
          <button className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-destructive/10 text-destructive text-left" onClick={() => { setModal({ type: 'delete-folder', folder: ctxMenu.folder }); setCtxMenu(null); }}>
            <Icon name="Trash2" size={13} /> Удалить раздел
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
                <div key={c.id} className={`group flex items-center rounded text-sm transition-colors ${selectedCred?.id === c.id ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 hover:bg-secondary border border-border'}`}>
                  <button onClick={() => selectCred(c)} className="pl-3 pr-1.5 py-1">
                    {c.name || '(без названия)'}
                  </button>
                  <button onClick={() => setConfirmDeleteCred(c)} title="Удалить запись"
                    className={`pr-2 pl-0.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity ${selectedCred?.id === c.id ? 'hover:text-destructive-foreground/70' : 'hover:text-destructive'}`}>
                    <Icon name="X" size={12} />
                  </button>
                </div>
              ))}
              <Button size="sm" variant="outline" className="h-7 border-dashed border-border text-muted-foreground hover:text-foreground" onClick={newCred}>
                <Icon name="Plus" size={13} className="mr-1" /> Новая запись
              </Button>
              {filesContainer && (
                <button
                  onClick={() => { setViewingFiles(true); setSelectedCred(null); setDirty(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm font-medium transition-colors ml-auto ${
                    viewingFiles ? 'bg-primary text-primary-foreground' : 'bg-secondary/50 hover:bg-secondary border border-border text-foreground'
                  }`}
                >
                  <Icon name="Paperclip" size={13} />
                  ФАЙЛЫ ({filesCount} шт)
                </button>
              )}
            </div>

            {/* Форма */}
            <div className="flex-1 overflow-y-auto p-5">
              {viewingFiles && filesContainer ? (
                <div className="max-w-xl">
                  <CredFilesBlock credentialId={filesContainer.id} onCountChange={setFilesCount} />
                </div>
              ) : (selectedCred || dirty) ? (
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
                      { n: 1, lk: 'login1' as const, pk: 'password1' as const, icon: '/icons/anydesk.png', app: 'AnyDesk' },
                      { n: 2, lk: 'login2' as const, pk: 'password2' as const, icon: '/icons/rms.png', app: 'RMS' },
                      { n: 3, lk: 'login3' as const, pk: 'password3' as const, icon: '/icons/rudesktop.png', app: 'RuDesktop' },
                    ]).map(({ n, lk, pk, icon, app }) => (
                      <div key={n} className="grid grid-cols-[20px_28px_minmax(0,1fr)_auto_36px_minmax(0,1fr)_auto] items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (n === 1) launchAnyDesk(form.login1, form.password1);
                            else if (n === 2) launchRMS(form.login2, form.password2);
                            else launchRuDesktop(form.login3, form.password3);
                          }}
                          title={n === 1 ? 'Запустить AnyDesk с этим ID' : n === 2 ? 'Запустить RMS с этим ID и паролем' : 'Запустить RuDesktop с этим ID'}
                          className="w-5 h-5 shrink-0 rounded hover:scale-110 transition-transform"
                        >
                          <img src={icon} alt={app} className="w-5 h-5 rounded" />
                        </button>
                        <span className="text-xs text-muted-foreground shrink-0">ID{n}</span>
                        <Input value={form[lk] || ''} onChange={ff(lk)} className="h-7 min-w-0 bg-secondary/40 border-border text-sm font-mono px-2" placeholder={`Логин ${n}`} />
                        <CopyBtn value={form[lk] || ''} />
                        <span className="text-xs text-muted-foreground shrink-0">PWD{n}</span>
                        <Input type="text" value={form[pk] || ''} onChange={ff(pk)} className="h-7 min-w-0 bg-secondary/40 border-border text-sm font-mono px-2" placeholder={`Пароль ${n}`} />
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
                    <Button variant="outline" onClick={() => setConfirmCancel(true)} className="border-border">
                      <Icon name="X" size={15} className="mr-2" /> Отменить
                    </Button>
                    {selectedCred && (
                      <Button variant="outline" onClick={() => setConfirmDeleteCred(selectedCred)}
                        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive">
                        <Icon name="Trash2" size={15} className="mr-2" /> Удалить запись
                      </Button>
                    )}
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

      <Dialog open={modal?.type === 'delete-folder'} onOpenChange={() => setModal(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="TriangleAlert" size={17} className="text-destructive" />
              Удалить «{modal?.folder?.name}»?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Раздел, все его подразделы, учётные записи и прикреплённые файлы будут удалены без возможности восстановления.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setModal(null)}>Отмена</Button>
            <Button disabled={deletingFolder} onClick={doDeleteFolder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingFolder ? 'Удаление...' : 'Удалить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="TriangleAlert" size={17} className="text-destructive" />
              Отменить изменения?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Несохранённые изменения будут потеряны.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>Нет</Button>
            <Button onClick={cancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Да</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDeleteCred} onOpenChange={() => setConfirmDeleteCred(null)}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="TriangleAlert" size={17} className="text-destructive" />
              Удалить данные «{confirmDeleteCred?.name || '(без названия)'}»?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Запись и все прикреплённые к ней файлы будут удалены без возможности восстановления.
          </p>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="outline" onClick={() => setConfirmDeleteCred(null)}>Нет</Button>
            <Button disabled={deletingCred} onClick={doDeleteCred} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deletingCred ? 'Удаление...' : 'Да'}
            </Button>
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
    if (na > nb) return true;
    if (na < nb) return false;
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
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [filterDb, setFilterDb] = useState('');
  const [onlyOutdated, setOnlyOutdated] = useState(false);

  const toggleClient = (clientId: number) =>
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) { next.delete(clientId); } else { next.add(clientId); }
      return next;
    });

  const load = () => api('resource=updates').then(d => { if (Array.isArray(d)) setRows(d); });
  useEffect(() => {
    load();
    api('resource=users').then(d => { if (Array.isArray(d)) setUsers(d); });
  }, []);

  const dbNames = [...new Set(rows.map(r => r.config_name))].sort();
  const outdatedCount = rows.filter(r => versionGt(r.actual_config_version, r.current_config_version)).length;
  const filterActive = !!filterDb || onlyOutdated;
  const matchesFilter = (r: UpdateRow) =>
    (!filterDb || r.config_name === filterDb) &&
    (!onlyOutdated || versionGt(r.actual_config_version, r.current_config_version));

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
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={filterDb} onChange={e => setFilterDb(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary/40 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">Все базы данных</option>
          {dbNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <button onClick={() => setOnlyOutdated(v => !v)}
          className={`h-8 px-3 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-colors ${onlyOutdated ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40' : 'border-border text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
          <Icon name="AlertTriangle" size={12} />
          Требуют обновления
          {outdatedCount > 0 && <span className="text-[10px] bg-black/20 rounded px-1.5 py-0.5">{outdatedCount}</span>}
        </button>
        {filterActive && (
          <button onClick={() => { setFilterDb(''); setOnlyOutdated(false); }}
            className="h-8 px-2.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            Сбросить фильтр
          </button>
        )}
      </div>
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
          {(() => {
            if (rows.length === 0) {
              return <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground text-sm">Нет данных</td></tr>;
            }

            // Базы данных клиента (все строки с данным client_id)
            const dbsByClient = new Map<number, UpdateRow[]>();
            // Имя клиента по id
            const clientNameById = new Map<number, string>();
            // Список подчинённых client_id (уникальные, по порядку) для каждого родителя
            const childIdsByParent = new Map<number, number[]>();
            const addedChild = new Set<number>();
            // Список главных client_id (без родителя), уникальные, по порядку
            const topClientIds: number[] = [];
            const addedTop = new Set<number>();

            rows.forEach(r => {
              dbsByClient.set(r.client_id, [...(dbsByClient.get(r.client_id) ?? []), r]);
              clientNameById.set(r.client_id, r.client_name);
              if (r.client_parent_id) {
                if (!addedChild.has(r.client_id)) {
                  addedChild.add(r.client_id);
                  const arr = childIdsByParent.get(r.client_parent_id) ?? [];
                  arr.push(r.client_id);
                  childIdsByParent.set(r.client_parent_id, arr);
                }
              } else if (!addedTop.has(r.client_id)) {
                addedTop.add(r.client_id);
                topClientIds.push(r.client_id);
              }
            });

            const dbRow = (row: UpdateRow, depth: number) => {
              const outdated = versionGt(row.actual_config_version, row.current_config_version);
              return (
                <tr key={row.client_db_id} className={`border-b border-border/40 transition-colors ${outdated ? 'bg-yellow-500/5 hover:bg-yellow-500/10' : 'hover:bg-secondary/20'}`}>
                  <td className="py-2" style={{ paddingLeft: `${12 + depth * 20}px` }}>
                    <span className="flex items-center gap-1.5">
                      <Icon name="Database" size={11} className="text-border shrink-0" />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-sm">{row.config_name}</td>
                  <td className={`px-3 py-2 font-mono text-sm ${outdated ? 'text-yellow-400 font-semibold' : ''}`}>
                    {row.current_config_version || <span className="text-muted-foreground">—</span>}
                    {outdated && <Icon name="AlertTriangle" size={13} className="inline ml-1.5 text-yellow-400" />}
                  </td>
                  <td className="px-3 py-2 font-mono text-sm text-green-400">{row.actual_config_version || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{row.update_date || '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">{row.updated_by_name || row.updated_by_login || '—'}</td>
                  <td className="px-3 py-2">
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
            };

            // Есть ли хоть одна подходящая под фильтр база в поддереве клиента
            const matchCache = new Map<number, boolean>();
            const hasMatchDeep = (clientId: number): boolean => {
              if (matchCache.has(clientId)) return matchCache.get(clientId)!;
              const dbs = dbsByClient.get(clientId) ?? [];
              const childIds = childIdsByParent.get(clientId) ?? [];
              const result = dbs.some(matchesFilter) || childIds.some(hasMatchDeep);
              matchCache.set(clientId, result);
              return result;
            };

            const renderClient = (clientId: number, depth: number): React.ReactNode[] => {
              if (filterActive && !hasMatchDeep(clientId)) return [];

              const allDbs = dbsByClient.get(clientId) ?? [];
              const dbs = filterActive ? allDbs.filter(matchesFilter) : allDbs;
              const allChildIds = childIdsByParent.get(clientId) ?? [];
              const childIds = filterActive ? allChildIds.filter(hasMatchDeep) : allChildIds;
              const hasContent = dbs.length > 0 || childIds.length > 0;
              const isExpanded = filterActive ? true : expandedClients.has(clientId);
              const name = clientNameById.get(clientId) ?? '';
              const totalCount = dbs.length + childIds.length;
              const out: React.ReactNode[] = [];

              out.push(
                <tr key={`client-${clientId}`} className={`border-b transition-colors hover:bg-secondary/30 ${depth === 0 ? 'border-t-2 border-t-border border-b-border/50' : 'border-b-border/40'}`}>
                  <td className="py-2.5" style={{ paddingLeft: `${12 + depth * 20}px` }} colSpan={2}>
                    <span className="flex items-center gap-1">
                      {hasContent ? (
                        <button onClick={() => toggleClient(clientId)} disabled={filterActive} className="flex items-center justify-center w-5 h-5 rounded hover:bg-secondary/60 shrink-0 transition-colors disabled:opacity-60">
                          <Icon name={isExpanded ? 'ChevronDown' : 'ChevronRight'} size={13} className="text-muted-foreground" />
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}
                      {depth === 0
                        ? <Icon name="Building2" size={13} className="text-muted-foreground shrink-0" />
                        : <Icon name="CornerDownRight" size={12} className="text-border shrink-0" />}
                      <span className={depth === 0 ? 'font-medium' : 'text-muted-foreground text-sm'}>{name}</span>
                      {!isExpanded && totalCount > 0 && (
                        <span className="text-[10px] text-muted-foreground bg-secondary/60 rounded px-1.5 py-0.5 ml-1">{totalCount}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5" colSpan={5}></td>
                </tr>
              );

              if (isExpanded) {
                dbs.forEach(row => out.push(dbRow(row, depth + 1)));
                childIds.forEach(childId => out.push(...renderClient(childId, depth + 1)));
              }

              return out;
            };

            const rendered = topClientIds.flatMap(id => renderClient(id, 0));
            if (rendered.length === 0) {
              return <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground text-sm">Ничего не найдено по заданному фильтру</td></tr>;
            }
            return rendered;
          })()}
        </tbody>
      </table>
      </div>

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
// TICKETS SECTION
// ══════════════════════════════════════════════════════════════════════════════

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low:    { label: 'Низкий',  color: 'text-muted-foreground' },
  medium: { label: 'Средний', color: 'text-blue-400' },
  high:   { label: 'Высокий', color: 'text-yellow-400' },
  urgent: { label: 'Срочно',  color: 'text-red-400' },
};

const STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  new:         { label: 'Новая',      color: 'text-blue-400',            icon: 'CircleDot' },
  in_progress: { label: 'В процессе', color: 'text-yellow-400',          icon: 'Loader' },
  resolved:    { label: 'Решена',     color: 'text-green-400',           icon: 'CheckCircle' },
  cancelled:   { label: 'Отменена',   color: 'text-muted-foreground',    icon: 'XCircle' },
};

const STATUSES_LIST = [
  { value: 'new',         label: 'Новая' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'resolved',    label: 'Решена' },
  { value: 'cancelled',   label: 'Отменена' },
];

const PROBLEM_TYPES = [
  'Вопрос по 1С', 'Проблема с доступом', 'Нужно обновление',
  'Ошибка при работе', 'Нужна доработка', 'Нужна консультация',
  'Проблемы с оборудованием', 'Прочее',
];

type Ticket = {
  id: number;
  client_id: number;
  client_name: string;
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
  assignee_id: number | null;
  assignee_name: string | null;
  assignee_login: string | null;
};

type TicketMeta = {
  clients: { id: number; name: string }[];
  users: { id: number; full_name: string | null; login: string }[];
  problem_types: string[];
  priorities: string[];
};

function isOverdue(t: Ticket) {
  return !t.resolved_at && t.deadline && new Date(t.deadline) < new Date();
}

const PRIORITY_COLOR: Record<string, string> = { low: 'gray', medium: 'blue', high: 'yellow', urgent: 'red' };
const TICKETS_VIEW_KEY = 'wp_tickets_view';

function TicketsSection({ token, isAdmin }: { token: string; isAdmin: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [meta, setMeta] = useState<TicketMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const [view, setView] = useState<'table' | 'cards' | 'board'>(() => (localStorage.getItem(TICKETS_VIEW_KEY) as 'table' | 'cards' | 'board') || 'table');
  const [dragTicketId, setDragTicketId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const changeView = (v: 'table' | 'cards' | 'board') => {
    setView(v);
    localStorage.setItem(TICKETS_VIEW_KEY, v);
  };

  const toggleStatus = (val: string) =>
    setFilterStatuses(prev => {
      const next = new Set(prev);
      if (next.has(val)) { next.delete(val); } else { next.add(val); }
      return next;
    });
  const [editModal, setEditModal] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState({ status: '', assignee_id: '', result: '' });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailModal, setDetailModal] = useState<Ticket | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Ticket | null>(null);

  const apiHeaders = { 'X-Admin-Token': token };

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ resource: 'tickets' });
    if (filterStatuses.size > 0) params.set('status', [...filterStatuses].join(','));
    if (filterClient) params.set('client_id', filterClient);
    if (filterType) params.set('problem_type', filterType);
    const data = await fetch(`${TICKETS_URL}?${params}`, { headers: apiHeaders }).then(r => r.json());
    setLoading(false);
    if (Array.isArray(data)) setTickets(data);
  };

  const loadMeta = async () => {
    const data = await fetch(`${TICKETS_URL}?resource=ticket-meta`, { headers: apiHeaders }).then(r => r.json());
    if (data.clients) setMeta(data);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [filterStatuses, filterClient, filterType]);

  const openEdit = (t: Ticket) => {
    setEditForm({
      status: t.status,
      assignee_id: t.assignee_id ? String(t.assignee_id) : '',
      result: t.result || '',
    });
    setEditModal(t);
  };

  const saveEdit = async () => {
    if (!editModal) return;
    setSaving(true);
    const body: Record<string, string | number | null> = {
      status: editForm.status,
      assignee_id: editForm.assignee_id ? Number(editForm.assignee_id) : null,
      result: editForm.result,
    };
    await fetch(`${TICKETS_URL}?resource=tickets&id=${editModal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify(body),
    });
    setSaving(false);
    setEditModal(null);
    load();
  };

  const changeTicketStatus = async (t: Ticket, status: string) => {
    await fetch(`${TICKETS_URL}?resource=tickets&id=${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteTicket = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    await fetch(`${TICKETS_URL}?resource=tickets&id=${confirmDelete.id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': token },
    });
    setDeleting(false);
    setConfirmDelete(null);
    setDetailModal(null);
    setEditModal(null);
    load();
  };

  return (
    <div>
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-1.5 bg-secondary/30 border border-border rounded-md px-2 h-8">
          {STATUSES_LIST.map(s => {
            const active = filterStatuses.has(s.value);
            return (
              <button key={s.value} onClick={() => toggleStatus(s.value)}
                className={`h-5 px-2 rounded text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                {s.label}
              </button>
            );
          })}
        </div>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary/40 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">Все клиенты</option>
          {meta?.clients.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary/40 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">Все типы</option>
          {PROBLEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={load} className="h-8 px-3 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Icon name="RefreshCw" size={12} />
        </button>
        <div className="flex items-center gap-0.5 bg-secondary/30 border border-border rounded-md p-0.5 h-8">
          <button onClick={() => changeView('table')} title="Таблица"
            className={`h-6 w-7 rounded flex items-center justify-center transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="Table" size={13} />
          </button>
          <button onClick={() => changeView('cards')} title="Стикеры"
            className={`h-6 w-7 rounded flex items-center justify-center transition-colors ${view === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="LayoutGrid" size={13} />
          </button>
          <button onClick={() => changeView('board')} title="Доска (канбан)"
            className={`h-6 w-7 rounded flex items-center justify-center transition-colors ${view === 'board' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="Columns3" size={13} />
          </button>
        </div>
        <span className="ml-auto text-xs text-muted-foreground self-center">{tickets.length} заявок</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Icon name="Loader" size={18} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
          <Icon name="TicketCheck" size={36} className="opacity-20" />
          <p className="text-sm">Заявок не найдено</p>
        </div>
      ) : view === 'table' ? (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['#', 'Клиент', 'Тип', 'Описание', 'Приоритет', 'Статус', 'Подана', 'Решить до', 'Ответственный', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const st = STATUS_LABELS[t.status] || STATUS_LABELS.new;
                const pr = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.medium;
                const overdue = isOverdue(t);
                return (
                  <tr key={t.id} className={`border-b border-border/50 transition-colors ${overdue ? 'bg-red-500/8 hover:bg-red-500/12' : 'hover:bg-secondary/30'}`}>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">#{t.id}</td>
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">{t.client_name}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{t.problem_type}</td>
                    <td className="px-3 py-2.5 max-w-[220px]">
                      <button className="truncate text-sm text-left hover:text-primary transition-colors block w-full" onClick={() => setDetailModal(t)}>
                        <span className={overdue ? 'text-red-400 font-bold' : ''}>{t.description}</span>
                      </button>
                    </td>
                    <td className={`px-3 py-2.5 text-xs font-medium whitespace-nowrap ${pr.color}`}>{pr.label}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <select value={t.status} onChange={e => changeTicketStatus(t, e.target.value)}
                        className={`bg-transparent text-xs font-medium focus:outline-none ${st.color}`}>
                        {STATUSES_LIST.map(s => <option key={s.value} value={s.value} className="text-foreground bg-background">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(t.submitted_at).toLocaleString('ru')}</td>
                    <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${overdue ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
                      {t.deadline ? new Date(t.deadline).toLocaleString('ru') : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {t.assignee_name || t.assignee_login || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5 justify-end">
                        <Button size="sm" className="h-7 text-xs bg-secondary/60 text-foreground border border-border hover:bg-secondary" onClick={() => setDetailModal(t)}>
                          <Icon name="Eye" size={12} />
                        </Button>
                        <Button size="sm" className="h-7 text-xs bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25" onClick={() => openEdit(t)}>
                          <Icon name="Pencil" size={12} />
                        </Button>
                        {isAdmin && (
                          <Button size="sm" className="h-7 text-xs bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25" onClick={() => setConfirmDelete(t)}>
                            <Icon name="Trash2" size={12} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tickets.map(t => {
            const st = STATUS_LABELS[t.status] || STATUS_LABELS.new;
            const pr = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.medium;
            const overdue = isOverdue(t);
            return (
              <div key={t.id} className={`relative rounded-lg border p-3.5 flex flex-col gap-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md ${colorSticky(PRIORITY_COLOR[t.priority] || 'blue')} ${overdue ? 'ring-1 ring-red-500/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left font-medium text-sm break-words hover:text-primary transition-colors" onClick={() => setDetailModal(t)}>
                    #{t.id} · {t.client_name}
                  </button>
                  <div className="flex gap-0.5 shrink-0">
                    <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/10 transition-colors" onClick={() => openEdit(t)} title="Редактировать">
                      <Icon name="Pencil" size={12} />
                    </button>
                    {isAdmin && (
                      <button className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-black/10 transition-colors" onClick={() => setConfirmDelete(t)} title="Удалить">
                        <Icon name="Trash2" size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{t.problem_type}</div>
                <p className="text-xs text-muted-foreground line-clamp-3">{t.description}</p>
                <div className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                  <Icon name="Clock" size={11} />
                  {t.deadline ? new Date(t.deadline).toLocaleString('ru') : 'без срока'}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.assignee_name || t.assignee_login || 'не назначен'}
                </div>
                <div className={`text-xs font-medium ${pr.color}`}>{pr.label}</div>
                <select value={t.status} onChange={e => changeTicketStatus(t, e.target.value)}
                  className={`mt-auto h-7 bg-black/10 rounded text-xs font-medium px-1.5 focus:outline-none ${st.color}`}>
                  {STATUSES_LIST.map(s => <option key={s.value} value={s.value} className="text-foreground bg-background">{s.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUSES_LIST.map(col => {
            const colTickets = tickets.filter(t => t.status === col.value);
            const stMeta = STATUS_LABELS[col.value];
            const isOver = dragOverStatus === col.value;
            return (
              <div key={col.value}
                onDragOver={e => { e.preventDefault(); setDragOverStatus(col.value); }}
                onDragLeave={() => setDragOverStatus(prev => (prev === col.value ? null : prev))}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverStatus(null);
                  const id = dragTicketId;
                  setDragTicketId(null);
                  if (id === null) return;
                  const ticket = tickets.find(x => x.id === id);
                  if (ticket && ticket.status !== col.value) changeTicketStatus(ticket, col.value);
                }}
                className={`flex flex-col shrink-0 w-72 rounded-lg border bg-secondary/20 transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border/60">
                  <Icon name={stMeta.icon} size={13} className={stMeta.color} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${stMeta.color}`}>{col.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">{colTickets.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-2 p-2 min-h-[80px]">
                  {colTickets.map(t => {
                    const pr = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.medium;
                    const overdue = isOverdue(t);
                    const dragging = dragTicketId === t.id;
                    return (
                      <div key={t.id} draggable
                        onDragStart={e => { setDragTicketId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => { setDragTicketId(null); setDragOverStatus(null); }}
                        className={`rounded-lg border p-3 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing shadow-sm transition-all ${colorSticky(PRIORITY_COLOR[t.priority] || 'blue')} ${overdue ? 'ring-1 ring-red-500/40' : ''} ${dragging ? 'opacity-40' : 'opacity-100'}`}>
                        <div className="flex items-start justify-between gap-1.5">
                          <button className="text-left font-medium text-sm break-words hover:text-primary transition-colors" onClick={() => setDetailModal(t)}>
                            #{t.id} · {t.client_name}
                          </button>
                          <div className="flex gap-0.5 shrink-0">
                            <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/10 transition-colors" onClick={() => openEdit(t)} title="Редактировать">
                              <Icon name="Pencil" size={11} />
                            </button>
                            {isAdmin && (
                              <button className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-black/10 transition-colors" onClick={() => setConfirmDelete(t)} title="Удалить">
                                <Icon name="Trash2" size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">{t.problem_type}</div>
                        <div className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                          <Icon name="Clock" size={11} />
                          {t.deadline ? new Date(t.deadline).toLocaleDateString('ru') : 'без срока'}
                        </div>
                        <div className={`text-xs font-medium ${pr.color}`}>{pr.label}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.assignee_name || t.assignee_login || 'не назначен'}
                        </div>
                      </div>
                    );
                  })}
                  {colTickets.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/50 py-6">
                      пусто
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модал редактирования */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">Заявка #{editModal?.id}</DialogTitle>
          </DialogHeader>
          {editModal && (
            <div className="space-y-4 text-sm">
              <div className="p-3 rounded-lg bg-secondary/30 text-xs space-y-1">
                <p><span className="text-muted-foreground">Клиент:</span> {editModal.client_name}</p>
                <p><span className="text-muted-foreground">Тип:</span> {editModal.problem_type}</p>
                <p><span className="text-muted-foreground">Описание:</span> {editModal.description}</p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Статус</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {STATUSES_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Ответственный</label>
                <select value={editForm.assignee_id} onChange={e => setEditForm(f => ({ ...f, assignee_id: e.target.value }))}
                  className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="">— не назначен —</option>
                  {meta?.users.map(u => <option key={u.id} value={String(u.id)}>{u.full_name || u.login}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Результат</label>
                <Textarea value={editForm.result} onChange={e => setEditForm(f => ({ ...f, result: e.target.value }))}
                  rows={4} className="bg-secondary/40 border-border resize-none text-sm" placeholder="Описание результата работы по заявке..." />
              </div>
              <div className="flex gap-3">
                {isAdmin && (
                  <Button variant="outline" onClick={() => editModal && setConfirmDelete(editModal)}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                    <Icon name="Trash2" size={14} />
                  </Button>
                )}
                <Button variant="outline" onClick={() => setEditModal(null)} className="flex-1">Отмена</Button>
                <Button disabled={saving} onClick={saveEdit} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Модал просмотра */}
      <Dialog open={!!detailModal} onOpenChange={() => setDetailModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">Заявка #{detailModal?.id} — {detailModal?.client_name}</DialogTitle>
          </DialogHeader>
          {detailModal && (() => {
            const t = detailModal;
            const st = STATUS_LABELS[t.status] || STATUS_LABELS.new;
            const pr = PRIORITY_LABELS[t.priority] || PRIORITY_LABELS.medium;
            const overdue = isOverdue(t);
            return (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`flex items-center gap-1.5 font-medium ${st.color}`}><Icon name={st.icon} size={14} /> {st.label}</span>
                  <span className={`font-medium ${pr.color}`}>{pr.label}</span>
                  {overdue && <span className="text-red-500 font-bold text-xs">⚠ Просрочена</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Подана:</span> {new Date(t.submitted_at).toLocaleString('ru')}</div>
                  <div><span className="text-muted-foreground">Тип:</span> {t.problem_type}</div>
                  {t.deadline && <div><span className="text-muted-foreground">Решить до:</span> <span className={overdue ? 'text-red-400 font-semibold' : ''}>{new Date(t.deadline).toLocaleString('ru')}</span></div>}
                  {t.resolved_at && <div><span className="text-muted-foreground">Дата решения:</span> <span className="text-green-400">{new Date(t.resolved_at).toLocaleString('ru')}</span></div>}
                  {(t.assignee_name || t.assignee_login) && <div><span className="text-muted-foreground">Ответственный:</span> {t.assignee_name || t.assignee_login}</div>}
                  <div><span className="text-muted-foreground">Статус изменён:</span> {new Date(t.status_changed_at).toLocaleString('ru')}</div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Описание:</p>
                  <p className="bg-secondary/30 rounded-md p-3 whitespace-pre-wrap text-sm">{t.description}</p>
                </div>
                {t.extra_info && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Доп. информация:</p>
                    <p className="bg-secondary/30 rounded-md p-3 whitespace-pre-wrap text-sm">{t.extra_info}</p>
                  </div>
                )}
                {t.result && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Результат:</p>
                    <p className="bg-green-500/10 border border-green-500/20 rounded-md p-3 whitespace-pre-wrap text-sm text-green-300">{t.result}</p>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  {isAdmin && (
                    <Button variant="outline" onClick={() => setConfirmDelete(t)}
                      className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                      <Icon name="Trash2" size={14} />
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDetailModal(null)} className="flex-1">Закрыть</Button>
                  <Button className="flex-1 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25" onClick={() => { setDetailModal(null); openEdit(t); }}>
                    <Icon name="Pencil" size={13} className="mr-1.5" /> Редактировать
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Icon name="TriangleAlert" size={17} className="text-destructive" />
              Удалить заявку?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Заявка #{confirmDelete?.id} от «{confirmDelete?.client_name}» будет удалена без возможности восстановления.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1">Отмена</Button>
            <Button disabled={deleting} onClick={deleteTicket} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Удаление...' : 'Удалить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TASKS SECTION
// ══════════════════════════════════════════════════════════════════════════════

const TASK_STATUS_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  new:         { label: 'Новая',      color: 'text-blue-400',         icon: 'CircleDot' },
  in_progress: { label: 'Выполняется', color: 'text-yellow-400',      icon: 'Loader' },
  done:        { label: 'Завершена',  color: 'text-green-400',        icon: 'CheckCircle' },
  cancelled:   { label: 'Отменена',   color: 'text-muted-foreground', icon: 'XCircle' },
};

const TASK_STATUSES_LIST = [
  { value: 'new',         label: 'Новая' },
  { value: 'in_progress', label: 'Выполняется' },
  { value: 'done',        label: 'Завершена' },
  { value: 'cancelled',   label: 'Отменена' },
];

const TASK_COLORS: { value: string; label: string; dot: string; sticky: string }[] = [
  { value: 'blue',   label: 'Синий',    dot: 'bg-blue-500',   sticky: 'bg-blue-500/10 border-blue-500/30' },
  { value: 'green',  label: 'Зелёный',  dot: 'bg-green-500',  sticky: 'bg-green-500/10 border-green-500/30' },
  { value: 'yellow', label: 'Жёлтый',   dot: 'bg-yellow-500', sticky: 'bg-yellow-500/10 border-yellow-500/30' },
  { value: 'red',    label: 'Красный',  dot: 'bg-red-500',    sticky: 'bg-red-500/10 border-red-500/30' },
  { value: 'purple', label: 'Фиолетовый', dot: 'bg-purple-500', sticky: 'bg-purple-500/10 border-purple-500/30' },
  { value: 'gray',   label: 'Серый',    dot: 'bg-gray-400',   sticky: 'bg-gray-400/10 border-gray-400/30' },
];

const REPEAT_LABELS: Record<string, string> = {
  none: 'Не повторяется', daily: 'Ежедневно', weekly: 'Еженедельно', monthly: 'Ежемесячно', yearly: 'Ежегодно',
};

function colorDot(color: string) {
  return TASK_COLORS.find(c => c.value === color)?.dot || 'bg-gray-400';
}

function colorSticky(color: string) {
  return TASK_COLORS.find(c => c.value === color)?.sticky || 'bg-gray-400/10 border-gray-400/30';
}

type TaskUser = { id: number; full_name: string | null; login: string };

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  color: string;
  due_date: string | null;
  due_time: string | null;
  all_day: boolean;
  repeat_rule: string;
  repeat_until: string | null;
  author_id: number | null;
  assignee_id: number | null;
  author_name: string | null;
  author_login: string | null;
  assignee_name: string | null;
  assignee_login: string | null;
  created_at: string;
  updated_at: string;
  watchers: TaskUser[];
};

type TaskMeta = { users: TaskUser[]; statuses: string[]; colors: string[]; repeat_rules: string[] };

const EMPTY_TASK_FORM = {
  title: '', description: '', status: 'new', color: 'blue',
  due_date: '', due_time: '', all_day: true,
  repeat_rule: 'none', repeat_until: '',
  assignee_id: '', watcher_ids: [] as number[],
};

function userLabel(u?: TaskUser | null) {
  if (!u) return '—';
  return u.full_name || u.login;
}

function isTaskOverdue(t: Task) {
  if (t.status === 'done' || t.status === 'cancelled' || !t.due_date) return false;
  const due = new Date(t.due_date + (t.due_time ? `T${t.due_time}` : 'T23:59:59'));
  return due < new Date();
}

const TASKS_VIEW_KEY = 'wp_tasks_view';

function TasksSection({ token }: { token: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meta, setMeta] = useState<TaskMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(new Set());
  const [filterAssignee, setFilterAssignee] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('due_date');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [view, setView] = useState<'table' | 'cards' | 'board'>(() => (localStorage.getItem(TASKS_VIEW_KEY) as 'table' | 'cards' | 'board') || 'table');
  const [dragTaskId, setDragTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const [editModal, setEditModal] = useState<Task | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY_TASK_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [detailModal, setDetailModal] = useState<Task | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Task | null>(null);

  const changeView = (v: 'table' | 'cards' | 'board') => {
    setView(v);
    localStorage.setItem(TASKS_VIEW_KEY, v);
  };

  const apiHeaders = { 'X-Admin-Token': token };

  const toggleStatus = (val: string) =>
    setFilterStatuses(prev => {
      const next = new Set(prev);
      if (next.has(val)) { next.delete(val); } else { next.add(val); }
      return next;
    });

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ resource: 'tasks', sort, order });
    if (filterStatuses.size > 0) params.set('status', [...filterStatuses].join(','));
    if (filterAssignee) params.set('assignee_id', filterAssignee);
    if (search) params.set('search', search);
    const data = await fetch(`${TASKS_URL}?${params}`, { headers: apiHeaders }).then(r => r.json());
    setLoading(false);
    if (Array.isArray(data)) setTasks(data);
  };

  const loadMeta = async () => {
    const data = await fetch(`${TASKS_URL}?resource=task-meta`, { headers: apiHeaders }).then(r => r.json());
    if (data.users) setMeta(data);
  };

  useEffect(() => { loadMeta(); }, []);
  useEffect(() => { load(); }, [filterStatuses, filterAssignee, search, sort, order]);

  const openNew = () => {
    setForm(EMPTY_TASK_FORM);
    setEditModal('new');
  };

  const openEdit = (t: Task) => {
    setForm({
      title: t.title,
      description: t.description || '',
      status: t.status,
      color: t.color,
      due_date: t.due_date || '',
      due_time: t.due_time || '',
      all_day: t.all_day,
      repeat_rule: t.repeat_rule,
      repeat_until: t.repeat_until || '',
      assignee_id: t.assignee_id ? String(t.assignee_id) : '',
      watcher_ids: t.watchers.map(w => w.id),
    });
    setEditModal(t);
  };

  const toggleWatcher = (id: number) => {
    setForm(f => ({
      ...f,
      watcher_ids: f.watcher_ids.includes(id) ? f.watcher_ids.filter(w => w !== id) : [...f.watcher_ids, id],
    }));
  };

  const save = async () => {
    setSaving(true);
    const body: Record<string, unknown> = {
      title: form.title,
      description: form.description,
      status: form.status,
      color: form.color,
      due_date: form.due_date || null,
      due_time: form.all_day ? null : (form.due_time || null),
      all_day: form.all_day,
      repeat_rule: form.repeat_rule,
      repeat_until: form.repeat_rule !== 'none' ? (form.repeat_until || null) : null,
      assignee_id: form.assignee_id ? Number(form.assignee_id) : null,
      watcher_ids: form.watcher_ids,
    };
    if (editModal === 'new') {
      await fetch(`${TASKS_URL}?resource=tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify(body),
      });
    } else if (editModal) {
      await fetch(`${TASKS_URL}?resource=tasks&id=${editModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify(body),
      });
    }
    setSaving(false);
    setEditModal(null);
    load();
  };

  const changeStatus = async (t: Task, status: string) => {
    await fetch(`${TASKS_URL}?resource=tasks&id=${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteTask = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    await fetch(`${TASKS_URL}?resource=tasks&id=${confirmDelete.id}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': token },
    });
    setDeleting(false);
    setConfirmDelete(null);
    setDetailModal(null);
    setEditModal(null);
    load();
  };

  const sortOptions = [
    { value: 'due_date', label: 'По сроку' },
    { value: 'created_at', label: 'По дате создания' },
    { value: 'title', label: 'По названию' },
    { value: 'status', label: 'По статусу' },
  ];

  return (
    <div>
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-1.5 bg-secondary/30 border border-border rounded-md px-2 h-8">
          {TASK_STATUSES_LIST.map(s => {
            const active = filterStatuses.has(s.value);
            return (
              <button key={s.value} onClick={() => toggleStatus(s.value)}
                className={`h-5 px-2 rounded text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}>
                {s.label}
              </button>
            );
          })}
        </div>
        <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary/40 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          <option value="">Все ответственные</option>
          {meta?.users.map(u => <option key={u.id} value={String(u.id)}>{userLabel(u)}</option>)}
        </select>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по названию..."
          className="h-8 w-48 text-xs bg-secondary/40 border-border" />
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="h-8 rounded-md border border-border bg-secondary/40 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
          {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={() => setOrder(o => o === 'asc' ? 'desc' : 'asc')}
          className="h-8 px-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Icon name={order === 'asc' ? 'ArrowUp' : 'ArrowDown'} size={13} />
        </button>
        <div className="flex items-center gap-0.5 bg-secondary/30 border border-border rounded-md p-0.5 h-8">
          <button onClick={() => changeView('table')} title="Таблица"
            className={`h-6 w-7 rounded flex items-center justify-center transition-colors ${view === 'table' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="Table" size={13} />
          </button>
          <button onClick={() => changeView('cards')} title="Стикеры"
            className={`h-6 w-7 rounded flex items-center justify-center transition-colors ${view === 'cards' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="LayoutGrid" size={13} />
          </button>
          <button onClick={() => changeView('board')} title="Доска (канбан)"
            className={`h-6 w-7 rounded flex items-center justify-center transition-colors ${view === 'board' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon name="Columns3" size={13} />
          </button>
        </div>
        <Button onClick={openNew} size="sm" className="h-8 ml-auto bg-primary text-primary-foreground hover:bg-primary/90">
          <Icon name="Plus" size={14} className="mr-1" /> Новая задача
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          <Icon name="Loader" size={18} className="animate-spin mr-2" /> Загрузка...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
          <Icon name="ListTodo" size={36} className="opacity-20" />
          <p className="text-sm">Задач не найдено</p>
        </div>
      ) : view === 'table' ? (
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['color', 'Название', 'Срок', 'Повтор', 'Статус', 'Ответственный', 'Автор', 'Создана', 'actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-mono text-muted-foreground uppercase whitespace-nowrap">{h === 'color' || h === 'actions' ? '' : h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => {
                const st = TASK_STATUS_LABELS[t.status] || TASK_STATUS_LABELS.new;
                const overdue = isTaskOverdue(t);
                return (
                  <tr key={t.id} className={`border-b border-border/50 transition-colors ${overdue ? 'bg-red-500/8 hover:bg-red-500/12' : 'hover:bg-secondary/30'}`}>
                    <td className="px-3 py-2.5">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorDot(t.color)}`} />
                    </td>
                    <td className="px-3 py-2.5 max-w-[240px]">
                      <button className="text-left font-medium truncate hover:text-primary transition-colors" onClick={() => setDetailModal(t)}>
                        {t.title}
                      </button>
                    </td>
                    <td className={`px-3 py-2.5 text-xs whitespace-nowrap ${overdue ? 'text-red-400 font-bold' : 'text-muted-foreground'}`}>
                      {t.due_date ? new Date(t.due_date).toLocaleDateString('ru') : '—'}
                      {t.due_date && !t.all_day && t.due_time && <span> {t.due_time.slice(0, 5)}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {t.repeat_rule !== 'none' ? REPEAT_LABELS[t.repeat_rule] : '—'}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <select value={t.status} onChange={e => changeStatus(t, e.target.value)}
                        className={`bg-transparent text-xs font-medium focus:outline-none ${st.color}`}>
                        {TASK_STATUSES_LIST.map(s => <option key={s.value} value={s.value} className="text-foreground bg-background">{s.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {t.assignee_name || t.assignee_login || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {t.author_name || t.author_login || '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {t.created_at ? new Date(t.created_at).toLocaleString('ru') : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5 justify-end">
                        <Button size="sm" className="h-7 text-xs bg-secondary/60 text-foreground border border-border hover:bg-secondary" onClick={() => setDetailModal(t)}>
                          <Icon name="Eye" size={12} />
                        </Button>
                        <Button size="sm" className="h-7 text-xs bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25" onClick={() => openEdit(t)}>
                          <Icon name="Pencil" size={12} />
                        </Button>
                        <Button size="sm" className="h-7 text-xs bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25" onClick={() => setConfirmDelete(t)}>
                          <Icon name="Trash2" size={12} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tasks.map(t => {
            const st = TASK_STATUS_LABELS[t.status] || TASK_STATUS_LABELS.new;
            const overdue = isTaskOverdue(t);
            return (
              <div key={t.id} className={`relative rounded-lg border p-3.5 flex flex-col gap-2 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md ${colorSticky(t.color)} ${overdue ? 'ring-1 ring-red-500/40' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <button className="text-left font-medium text-sm break-words hover:text-primary transition-colors" onClick={() => setDetailModal(t)}>
                    {t.title}
                  </button>
                  <div className="flex gap-0.5 shrink-0">
                    <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/10 transition-colors" onClick={() => openEdit(t)} title="Редактировать">
                      <Icon name="Pencil" size={12} />
                    </button>
                    <button className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-black/10 transition-colors" onClick={() => setConfirmDelete(t)} title="Удалить">
                      <Icon name="Trash2" size={12} />
                    </button>
                  </div>
                </div>
                {t.description && <p className="text-xs text-muted-foreground line-clamp-3">{t.description}</p>}
                <div className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                  <Icon name="Clock" size={11} />
                  {t.due_date ? new Date(t.due_date).toLocaleDateString('ru') : 'без срока'}
                  {t.due_date && !t.all_day && t.due_time && <span>{t.due_time.slice(0, 5)}</span>}
                  {t.repeat_rule !== 'none' && <Icon name="Repeat" size={11} className="ml-0.5" />}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.assignee_name || t.assignee_login || 'не назначен'}
                </div>
                <select value={t.status} onChange={e => changeStatus(t, e.target.value)}
                  className={`mt-auto h-7 bg-black/10 rounded text-xs font-medium px-1.5 focus:outline-none ${st.color}`}>
                  {TASK_STATUSES_LIST.map(s => <option key={s.value} value={s.value} className="text-foreground bg-background">{s.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {TASK_STATUSES_LIST.map(col => {
            const colTasks = tasks.filter(t => t.status === col.value);
            const stMeta = TASK_STATUS_LABELS[col.value];
            const isOver = dragOverStatus === col.value;
            return (
              <div key={col.value}
                onDragOver={e => { e.preventDefault(); setDragOverStatus(col.value); }}
                onDragLeave={() => setDragOverStatus(prev => (prev === col.value ? null : prev))}
                onDrop={e => {
                  e.preventDefault();
                  setDragOverStatus(null);
                  const id = dragTaskId;
                  setDragTaskId(null);
                  if (id === null) return;
                  const task = tasks.find(x => x.id === id);
                  if (task && task.status !== col.value) changeStatus(task, col.value);
                }}
                className={`flex flex-col shrink-0 w-72 rounded-lg border bg-secondary/20 transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-border/60">
                  <Icon name={stMeta.icon} size={13} className={stMeta.color} />
                  <span className={`text-xs font-semibold uppercase tracking-wide ${stMeta.color}`}>{col.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono">{colTasks.length}</span>
                </div>
                <div className="flex-1 flex flex-col gap-2 p-2 min-h-[80px]">
                  {colTasks.map(t => {
                    const overdue = isTaskOverdue(t);
                    const dragging = dragTaskId === t.id;
                    return (
                      <div key={t.id} draggable
                        onDragStart={e => { setDragTaskId(t.id); e.dataTransfer.effectAllowed = 'move'; }}
                        onDragEnd={() => { setDragTaskId(null); setDragOverStatus(null); }}
                        className={`rounded-lg border p-3 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing shadow-sm transition-all ${colorSticky(t.color)} ${overdue ? 'ring-1 ring-red-500/40' : ''} ${dragging ? 'opacity-40' : 'opacity-100'}`}>
                        <div className="flex items-start justify-between gap-1.5">
                          <button className="text-left font-medium text-sm break-words hover:text-primary transition-colors" onClick={() => setDetailModal(t)}>
                            {t.title}
                          </button>
                          <div className="flex gap-0.5 shrink-0">
                            <button className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-black/10 transition-colors" onClick={() => openEdit(t)} title="Редактировать">
                              <Icon name="Pencil" size={11} />
                            </button>
                            <button className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-black/10 transition-colors" onClick={() => setConfirmDelete(t)} title="Удалить">
                              <Icon name="Trash2" size={11} />
                            </button>
                          </div>
                        </div>
                        <div className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
                          <Icon name="Clock" size={11} />
                          {t.due_date ? new Date(t.due_date).toLocaleDateString('ru') : 'без срока'}
                          {t.due_date && !t.all_day && t.due_time && <span>{t.due_time.slice(0, 5)}</span>}
                          {t.repeat_rule !== 'none' && <Icon name="Repeat" size={11} className="ml-0.5" />}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t.assignee_name || t.assignee_login || 'не назначен'}
                        </div>
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground/50 py-6">
                      пусто
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Модал создания/редактирования */}
      <Dialog open={!!editModal} onOpenChange={() => setEditModal(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide">
              {editModal === 'new' ? 'Новая задача' : `Задача #${(editModal as Task)?.id ?? ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Наименование</label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="bg-secondary/40 border-border text-sm" placeholder="Название задачи" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Описание</label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3} className="bg-secondary/40 border-border resize-none text-sm" placeholder="Описание задачи..." />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="all_day" checked={form.all_day}
                onChange={e => setForm(f => ({ ...f, all_day: e.target.checked }))}
                className="w-4 h-4 accent-primary" />
              <label htmlFor="all_day" className="text-xs text-muted-foreground">Весь день</label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Дата выполнения</label>
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              {!form.all_day && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Время</label>
                  <input type="time" value={form.due_time} onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))}
                    className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Повторение</label>
                <select value={form.repeat_rule} onChange={e => setForm(f => ({ ...f, repeat_rule: e.target.value }))}
                  className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {Object.entries(REPEAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.repeat_rule !== 'none' && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Повторять до</label>
                  <input type="date" value={form.repeat_until} onChange={e => setForm(f => ({ ...f, repeat_until: e.target.value }))}
                    className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Статус</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {TASK_STATUSES_LIST.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Цвет</label>
                <select value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                  {TASK_COLORS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ответственный</label>
              <select value={form.assignee_id} onChange={e => setForm(f => ({ ...f, assignee_id: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-secondary/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">— не назначен —</option>
                {meta?.users.map(u => <option key={u.id} value={String(u.id)}>{userLabel(u)}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Видят задачу</label>
              <div className="flex flex-wrap gap-1.5">
                {meta?.users.map(u => {
                  const active = form.watcher_ids.includes(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => toggleWatcher(u.id)}
                      className={`h-7 px-2.5 rounded-md text-xs transition-colors border ${active ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary/40 text-muted-foreground border-border hover:text-foreground'}`}>
                      {userLabel(u)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              {editModal !== 'new' && (
                <Button variant="outline" onClick={() => editModal && setConfirmDelete(editModal)}
                  className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                  <Icon name="Trash2" size={14} />
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditModal(null)} className="flex-1">Отмена</Button>
              <Button disabled={saving || !form.title} onClick={save} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                {saving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Модал просмотра */}
      <Dialog open={!!detailModal} onOpenChange={() => setDetailModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-wide flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorDot(detailModal?.color || 'blue')}`} />
              {detailModal?.title}
            </DialogTitle>
          </DialogHeader>
          {detailModal && (() => {
            const t = detailModal;
            const st = TASK_STATUS_LABELS[t.status] || TASK_STATUS_LABELS.new;
            const overdue = isTaskOverdue(t);
            return (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`flex items-center gap-1.5 font-medium ${st.color}`}><Icon name={st.icon} size={14} /> {st.label}</span>
                  {overdue && <span className="text-red-500 font-bold text-xs">⚠ Просрочена</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Срок:</span> {t.due_date ? new Date(t.due_date).toLocaleDateString('ru') : '—'}{!t.all_day && t.due_time ? ` ${t.due_time.slice(0, 5)}` : ''}{t.all_day && t.due_date ? ' (весь день)' : ''}</div>
                  <div><span className="text-muted-foreground">Повтор:</span> {REPEAT_LABELS[t.repeat_rule]}</div>
                  <div><span className="text-muted-foreground">Ответственный:</span> {t.assignee_name || t.assignee_login || '—'}</div>
                  <div><span className="text-muted-foreground">Автор:</span> {t.author_name || t.author_login || '—'}</div>
                  <div><span className="text-muted-foreground">Создана:</span> {new Date(t.created_at).toLocaleString('ru')}</div>
                  <div><span className="text-muted-foreground">Изменена:</span> {new Date(t.updated_at).toLocaleString('ru')}</div>
                </div>
                {t.watchers.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Видят задачу:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {t.watchers.map(w => (
                        <span key={w.id} className="px-2 py-0.5 rounded bg-secondary/40 text-xs">{userLabel(w)}</span>
                      ))}
                    </div>
                  </div>
                )}
                {t.description && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Описание:</p>
                    <p className="bg-secondary/30 rounded-md p-3 whitespace-pre-wrap text-sm">{t.description}</p>
                  </div>
                )}
                <div className="flex gap-3 pt-1">
                  <Button variant="outline" onClick={() => setConfirmDelete(t)}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
                    <Icon name="Trash2" size={14} />
                  </Button>
                  <Button variant="outline" onClick={() => setDetailModal(null)} className="flex-1">Закрыть</Button>
                  <Button className="flex-1 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25" onClick={() => { setDetailModal(null); openEdit(t); }}>
                    <Icon name="Pencil" size={13} className="mr-1.5" /> Редактировать
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Icon name="TriangleAlert" size={17} className="text-destructive" />
              Удалить задачу?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Задача «{confirmDelete?.title}» будет удалена без возможности восстановления.
          </p>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1">Отмена</Button>
            <Button disabled={deleting} onClick={deleteTask} className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Удаление...' : 'Удалить'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════════════════════════

type AuthInfo = { role: 'admin' | 'user'; user_id: number; login: string; full_name?: string };

const SUPER_ADMIN_LOGIN = 'Pioneer78';

function WorkLogin({ onLogin }: { onLogin: (info: AuthInfo) => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyStatus, setKeyStatus] = useState<'idle' | 'reading' | 'need_pick' | 'ready'>('idle');
  const [keyValue, setKeyValue] = useState<string | null>(null);
  const [keyFileName, setKeyFileName] = useState('');

  const isSuperAdmin = login.trim() === SUPER_ADMIN_LOGIN;

  // При изменении логина пробуем молча прочитать ранее запомненный файл ключа
  useEffect(() => {
    let cancelled = false;
    const trimmed = login.trim();
    if (!trimmed || isSuperAdmin) {
      setKeyStatus('idle'); setKeyValue(null); setKeyFileName('');
      return;
    }
    setKeyStatus('reading');
    tryReadStoredKey(trimmed).then(key => {
      if (cancelled) return;
      if (key) {
        setKeyValue(key);
        setKeyFileName('ключ найден автоматически');
        setKeyStatus('ready');
      } else {
        setKeyValue(null);
        setKeyStatus('need_pick');
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login]);

  const choosePicker = async () => {
    const trimmed = login.trim();
    if (!trimmed) { toast.error('Сначала введите логин'); return; }
    let key: string | null = null;
    if (isFileSystemAccessSupported()) {
      key = await pickAndReadKey(trimmed);
    } else {
      key = await pickKeyViaInput();
    }
    if (key) {
      setKeyValue(key);
      setKeyFileName('файл выбран');
      setKeyStatus('ready');
    }
  };

  const forgetKeyFile = async () => {
    const trimmed = login.trim();
    if (trimmed) await clearKeyFileHandle(trimmed);
    setKeyValue(null);
    setKeyFileName('');
    setKeyStatus('need_pick');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin && !keyValue) {
      setError('Укажите местоположение файла ключа доступа');
      return;
    }
    setLoading(true); setError('');
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password, access_key: keyValue || undefined }),
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
      <ThemeToggle className="absolute top-4 right-4" />
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

          {!isSuperAdmin && login.trim() && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ключ доступа</label>
              {keyStatus === 'reading' && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Icon name="Loader2" size={13} className="animate-spin" /> Проверяю сохранённое местоположение ключа...
                </p>
              )}
              {keyStatus === 'need_pick' && (
                <Button type="button" variant="outline" onClick={choosePicker} className="w-full border-border h-9 text-sm">
                  <Icon name="FileKey2" size={14} className="mr-2" /> Выбрать файл ключа
                </Button>
              )}
              {keyStatus === 'ready' && (
                <div className="flex items-center justify-between gap-2 text-xs bg-secondary/40 border border-border rounded-md px-2.5 py-2">
                  <span className="flex items-center gap-1.5 text-green-500">
                    <Icon name="CheckCircle2" size={13} /> {keyFileName}
                  </span>
                  <button type="button" onClick={forgetKeyFile} className="text-muted-foreground hover:text-foreground transition-colors">
                    Изменить
                  </button>
                </div>
              )}
            </div>
          )}

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
// TASK REMINDER (напоминание за 15 минут до срока)
// ══════════════════════════════════════════════════════════════════════════════

const REMINDER_LEAD_MS = 15 * 60 * 1000;
const REMINDER_POLL_MS = 30 * 1000;
const SNOOZE_OPTIONS = [
  { value: 5, label: '5 мин' },
  { value: 10, label: '10 мин' },
  { value: 15, label: '15 мин' },
  { value: 30, label: '30 мин' },
  { value: 60, label: '1 час' },
];

function dueTimestamp(t: Task) {
  if (!t.due_date) return null;
  const iso = `${t.due_date}T${t.due_time || '00:00:00'}`;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function TaskReminder({ token, userId }: { token: string; userId: number }) {
  const [queue, setQueue] = useState<Task[]>([]);
  const [snoozing, setSnoozing] = useState(false);
  const remindedRef = useRef<Map<number, string>>(new Map());
  const snoozeUntilRef = useRef<Map<number, number>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const params = new URLSearchParams({ resource: 'tasks', status: 'new,in_progress' });
      const data = await fetch(`${TASKS_URL}?${params}`, { headers: { 'X-Admin-Token': token } }).then(r => r.json()).catch(() => null);
      if (cancelled || !Array.isArray(data)) return;

      const now = Date.now();
      const due: Task[] = data.filter((t: Task) => {
        const relevant = t.assignee_id === userId || t.watchers.some(w => w.id === userId);
        if (!relevant) return false;
        const suppressUntil = snoozeUntilRef.current.get(t.id) || 0;
        if (now < suppressUntil) return false;
        const ts = dueTimestamp(t);
        if (ts === null) return false;
        const key = `${t.due_date}_${t.due_time || ''}`;
        if (remindedRef.current.get(t.id) === key) return false;
        return ts - now <= REMINDER_LEAD_MS;
      });

      if (due.length === 0) return;
      due.forEach(t => remindedRef.current.set(t.id, `${t.due_date}_${t.due_time || ''}`));
      setQueue(q => {
        const ids = new Set(q.map(x => x.id));
        const fresh = due.filter(t => !ids.has(t.id));
        if (fresh.length > 0) {
          audioRef.current?.play().catch(() => {});
        }
        return [...q, ...fresh];
      });
    };

    check();
    const interval = setInterval(check, REMINDER_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token, userId]);

  const current = queue[0];
  const dismiss = () => setQueue(q => q.slice(1));

  const complete = async () => {
    if (!current) return;
    setSnoozing(true);
    const res = await fetch(`${TASKS_URL}?resource=tasks&id=${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ status: 'done' }),
    }).catch(() => null);
    setSnoozing(false);
    if (!res || !res.ok) {
      toast.error('Не удалось отметить задачу выполненной');
      return;
    }
    remindedRef.current.delete(current.id);
    snoozeUntilRef.current.delete(current.id);
    toast.success('Задача отмечена выполненной');
    dismiss();
  };

  const snooze = async (minutes: number) => {
    if (!current) return;
    setSnoozing(true);
    const newDue = new Date(Date.now() + minutes * 60000);
    const due_date = newDue.toISOString().slice(0, 10);
    const due_time = newDue.toTimeString().slice(0, 8);
    const res = await fetch(`${TASKS_URL}?resource=tasks&id=${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ due_date, due_time, all_day: false }),
    }).catch(() => null);
    setSnoozing(false);
    if (!res || !res.ok) {
      toast.error('Не удалось отложить напоминание');
      return;
    }
    remindedRef.current.delete(current.id);
    snoozeUntilRef.current.set(current.id, Date.now() + minutes * 60000);
    toast.success(`Напоминание отложено на ${SNOOZE_OPTIONS.find(o => o.value === minutes)?.label || `${minutes} мин`}`);
    dismiss();
  };

  const cancelTask = async () => {
    if (!current) return;
    setSnoozing(true);
    const res = await fetch(`${TASKS_URL}?resource=tasks&id=${current.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ status: 'cancelled' }),
    }).catch(() => null);
    setSnoozing(false);
    if (!res || !res.ok) {
      toast.error('Не удалось отменить задачу');
      return;
    }
    remindedRef.current.delete(current.id);
    snoozeUntilRef.current.delete(current.id);
    toast.success('Задача отменена');
    dismiss();
  };

  if (!current) return null;

  const ts = dueTimestamp(current);
  const overdue = ts !== null && ts < Date.now();

  return (
    <Dialog open onOpenChange={dismiss}>
      <DialogContent
        className="max-w-sm border-primary/40"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Icon name="BellRing" size={17} className="text-primary animate-pulse" />
            Напоминание о задаче
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <span className={`inline-block w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 ${colorDot(current.color)}`} />
            <div className="min-w-0">
              <p className="font-medium text-sm break-words">{current.title}</p>
              {current.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{current.description}</p>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-xs ${overdue ? 'text-red-400 font-semibold' : 'text-muted-foreground'}`}>
            <Icon name="Clock" size={12} />
            {ts !== null && new Date(ts).toLocaleString('ru')}
            {overdue && <span>— просрочена</span>}
          </div>
          <Button disabled={snoozing} onClick={complete} className="w-full bg-green-600 hover:bg-green-700 text-white">
            <Icon name="Check" size={14} className="mr-1.5" /> Выполнить
          </Button>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Отложить на:</p>
            <div className="grid grid-cols-5 gap-1.5">
              {SNOOZE_OPTIONS.map(o => (
                <button key={o.value} disabled={snoozing} onClick={() => snooze(o.value)}
                  className="h-8 rounded-md border border-border bg-secondary/40 text-xs hover:bg-secondary transition-colors disabled:opacity-50">
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button disabled={snoozing} variant="outline" onClick={dismiss} className="flex-1 border-border">
              Закрыть
            </Button>
            <Button disabled={snoozing} variant="outline" onClick={cancelTask}
              className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Icon name="X" size={14} className="mr-1.5" /> Отменить задачу
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW TICKET NOTIFIER (звук + системное уведомление о новых заявках)
// ══════════════════════════════════════════════════════════════════════════════

const TICKET_POLL_MS = 60 * 1000;

function NewTicketNotifier({ token }: { token: string }) {
  const seenRef = useRef<Set<number> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio('/notification.mp3');
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const data = await fetch(`${TICKETS_URL}?resource=tickets`, { headers: { 'X-Admin-Token': token } })
        .then(r => r.json()).catch(() => null);
      if (cancelled || !Array.isArray(data)) return;

      const ids = new Set<number>(data.map((t: Ticket) => t.id));

      if (seenRef.current === null) {
        seenRef.current = ids;
        return;
      }

      const fresh = data.filter((t: Ticket) => !seenRef.current!.has(t.id));
      seenRef.current = ids;
      if (fresh.length === 0) return;

      audioRef.current?.play().catch(() => {});

      fresh.forEach((t: Ticket) => {
        const title = fresh.length === 1 ? 'Новая заявка' : `Новых заявок: ${fresh.length}`;
        const body = `${t.client_name} — ${t.problem_type}`;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const n = new Notification(title, { body, icon: '/favicon.svg', tag: `ticket-${t.id}` });
          n.onclick = () => { window.focus(); n.close(); };
        }
      });

      toast(fresh.length === 1 ? 'Новая заявка от клиента' : `Новых заявок: ${fresh.length}`, {
        description: fresh.length === 1 ? `${fresh[0].client_name} — ${fresh[0].problem_type}` : undefined,
      });
    };

    check();
    const interval = setInterval(check, TICKET_POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [token]);

  return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════

type Tab = 'credentials' | 'updates' | 'tickets' | 'tasks';

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
    { id: 'tasks', label: 'Задачи', icon: 'ListTodo' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      {/* Фоновая иллюстрация IT-тематики */}
      <div
        className="fixed inset-0 z-0 pointer-events-none bg-cover bg-center opacity-[0.05] dark:opacity-[0.08]"
        style={{ backgroundImage: `url(${workPanelBg})` }}
      />

      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40 relative">
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
            <a href="/admin?from=work-panel" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all" title="Перейти в панель администратора">
              <Icon name="ShieldCheck" size={14} />
              <span className="hidden sm:inline">Админ</span>
            </a>
            <ThemeToggle />
            <button onClick={logout} className="text-muted-foreground hover:text-destructive transition-colors p-1.5" title="Выйти">
              <Icon name="LogOut" size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative z-10">
        {tab === 'credentials' && <CredentialsSection />}
        {tab === 'updates' && (
          <div className="container py-6">
            <UpdatesSection />
          </div>
        )}
        {tab === 'tickets' && (
          <div className="container py-6">
            <TicketsSection token={localStorage.getItem(TOKEN_KEY) || ''} isAdmin={authInfo.role === 'admin'} />
          </div>
        )}
        {tab === 'tasks' && (
          <div className="container py-6">
            <TasksSection token={localStorage.getItem(TOKEN_KEY) || ''} />
          </div>
        )}
      </main>

      <TaskReminder token={localStorage.getItem(TOKEN_KEY) || ''} userId={authInfo.user_id} />
      <NewTicketNotifier token={localStorage.getItem(TOKEN_KEY) || ''} />
    </div>
  );
}
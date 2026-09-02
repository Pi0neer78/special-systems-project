import { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const TICKETS_URL = 'https://functions.poehali.dev/4866cc97-c798-42d4-a280-d35071d704a8';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const POLL_MS = 15 * 1000;

type TicketMessage = {
  id: number;
  ticket_id: number;
  sender_type: 'client' | 'staff';
  sender_id: number;
  sender_name: string | null;
  message: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
};

function formatSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function isImage(contentType: string | null) {
  return !!contentType && contentType.startsWith('image/');
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TicketChat({
  ticketId,
  authHeader,
  mySenderType,
}: {
  ticketId: number;
  authHeader: Record<string, string>;
  mySenderType: 'client' | 'staff';
}) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    const data = await fetch(`${TICKETS_URL}?resource=ticket-messages&ticket_id=${ticketId}`, { headers: authHeader })
      .then(r => r.json()).catch(() => null);
    if (Array.isArray(data)) setMessages(data);
  }, [ticketId, authHeader]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const pickFile = (file: File | null) => {
    setError('');
    if (file && file.size > MAX_FILE_SIZE) {
      setError('Файл слишком большой (максимум 10 МБ)');
      return;
    }
    setPendingFile(file);
  };

  const send = async () => {
    if (!text.trim() && !pendingFile) return;
    setSending(true);
    setError('');
    const body: Record<string, unknown> = { ticket_id: ticketId };
    if (text.trim()) body.message = text.trim();
    if (pendingFile) {
      body.file_base64 = await fileToBase64(pendingFile);
      body.file_name = pendingFile.name;
      body.content_type = pendingFile.type || 'application/octet-stream';
    }
    const res = await fetch(`${TICKETS_URL}?resource=ticket-messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(body),
    }).then(r => r.json()).catch(() => null);
    setSending(false);
    if (res?.id) {
      setText('');
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } else {
      setError(res?.error || 'Не удалось отправить сообщение');
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div
      className="flex flex-col border border-border rounded-lg overflow-hidden bg-background"
      onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) setDragOver(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) pickFile(file);
      }}
    >
      <div className="px-3 py-2 border-b border-border/60 bg-secondary/30 flex items-center gap-1.5">
        <Icon name="MessageCircle" size={13} className="text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Переписка</span>
      </div>

      <div className={`flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-[180px] max-h-[320px] relative ${dragOver ? 'bg-primary/5' : ''}`}>
        {dragOver && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-md pointer-events-none">
            <span className="text-xs font-medium text-primary">Отпустите файл, чтобы прикрепить</span>
          </div>
        )}
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Сообщений пока нет</p>
        )}
        {messages.map(m => {
          const own = m.sender_type === mySenderType;
          return (
            <div key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
              <span className="text-[10px] text-muted-foreground mb-0.5 px-1">
                {m.sender_name || (m.sender_type === 'client' ? 'Клиент' : 'Сотрудник')} · {new Date(m.created_at).toLocaleString('ru', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${own ? 'bg-primary/15 border border-primary/30 text-foreground' : 'bg-secondary/50 border border-border/60 text-foreground'}`}>
                {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
                {m.file_url && (
                  isImage(m.content_type) ? (
                    <a href={m.file_url} target="_blank" rel="noreferrer" className="block mt-1">
                      <img src={m.file_url} alt={m.file_name || 'файл'} className="max-w-full max-h-48 rounded-md border border-border/60" />
                    </a>
                  ) : (
                    <a href={m.file_url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 mt-1 px-2 py-1.5 rounded-md bg-background/60 border border-border/60 hover:bg-background transition-colors">
                      <Icon name="Paperclip" size={13} className="text-muted-foreground shrink-0" />
                      <span className="text-xs truncate">{m.file_name || 'Файл'}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{formatSize(m.file_size)}</span>
                    </a>
                  )
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/60 p-2.5 space-y-2">
        {pendingFile && (
          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-secondary/40 text-xs">
            <Icon name="Paperclip" size={12} className="text-muted-foreground" />
            <span className="truncate flex-1">{pendingFile.name}</span>
            <span className="text-muted-foreground shrink-0">{formatSize(pendingFile.size)}</span>
            <button onClick={() => { setPendingFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-muted-foreground hover:text-destructive shrink-0">
              <Icon name="X" size={12} />
            </button>
          </div>
        )}
        {error && <p className="text-xs text-destructive px-1">{error}</p>}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={e => pickFile(e.target.files?.[0] || null)} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Прикрепить файл"
            type="button"
          >
            <Icon name="Paperclip" size={16} />
          </button>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Написать сообщение..."
            rows={1}
            className="bg-secondary/40 border-border resize-none text-sm min-h-[36px] py-2"
          />
          <Button
            onClick={send}
            disabled={sending || (!text.trim() && !pendingFile)}
            size="icon"
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Icon name={sending ? 'Loader' : 'Send'} size={15} className={sending ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { toast } from 'sonner';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  special: '!@#$%^&*()-_=+[]{};:,.?',
};

function randomInt(max: number) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}

function generate(length: number, pools: string[]) {
  const chars = pools.map(p => p[randomInt(p.length)]);
  const all = pools.join('');
  while (chars.length < length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export default function PasswordGenerator({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(true);
  const [special, setSpecial] = useState(false);
  const [digits, setDigits] = useState(true);
  const [length, setLength] = useState(16);
  const [passwords, setPasswords] = useState<string[]>([]);

  const build = () => {
    const pools: string[] = [];
    if (lower) pools.push(SETS.lower);
    if (upper) pools.push(SETS.upper);
    if (special) pools.push(SETS.special);
    if (digits) pools.push(SETS.digits);
    if (pools.length === 0) {
      toast.error('Выберите хотя бы один тип символов');
      return;
    }
    setPasswords(Array.from({ length: 5 }, () => generate(length, pools)));
  };

  const fallbackCopy = (text: string, host: HTMLElement) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    host.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    host.removeChild(ta);
    return ok;
  };

  const copy = async (pwd: string, host: HTMLElement) => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(pwd);
      ok = true;
    } catch {
      ok = fallbackCopy(pwd, host);
    }
    if (ok) {
      toast.success('Пароль скопирован');
      onOpenChange(false);
    } else {
      toast.error('Не удалось скопировать. Выделите пароль и нажмите Ctrl+C');
    }
  };

  const opts = [
    { label: 'Прописные (a-z)', value: lower, set: setLower },
    { label: 'Заглавные (A-Z)', value: upper, set: setUpper },
    { label: 'Спецсимволы (!@#$)', value: special, set: setSpecial },
    { label: 'Цифры (0-9)', value: digits, set: setDigits },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="KeyRound" size={18} className="text-primary" /> Генератор паролей
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {opts.map(o => (
              <label key={o.label} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={o.value} onCheckedChange={v => o.set(v === true)} />
                {o.label}
              </label>
            ))}
          </div>
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span>Длина пароля</span>
              <span className="font-mono font-semibold text-primary">{length}</span>
            </div>
            <Slider min={6} max={28} step={1} value={[length]} onValueChange={v => setLength(v[0])} />
            <div className="flex justify-between text-xs text-muted-foreground mt-1"><span>6</span><span>28</span></div>
          </div>
          <Button className="w-full" onClick={build}>
            <Icon name="RefreshCw" size={14} className="mr-2" /> Сформировать
          </Button>
          {passwords.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {passwords.map((p, i) => (
                <div key={`${p}-${i}`} className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5">
                  <span className="flex-1 font-mono text-sm break-all select-all">{p}</span>
                  <button onClick={e => copy(p, e.currentTarget.parentElement as HTMLElement)} title="Копировать"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0">
                    <Icon name="Copy" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

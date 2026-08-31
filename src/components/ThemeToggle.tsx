import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import Icon from '@/components/ui/icon';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    return <div className={`p-1.5 w-[30px] h-[30px] ${className}`} />;
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={`text-muted-foreground hover:text-foreground transition-colors p-1.5 ${className}`}
      title={isDark ? 'Светлая тема' : 'Тёмная тема'}
    >
      <Icon name={isDark ? 'Sun' : 'Moon'} size={16} />
    </button>
  );
}

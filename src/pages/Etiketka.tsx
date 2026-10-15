import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const files = [
  { href: '/etiketka/etiketka.png', name: 'etiketka-100x145.png', label: 'Скачать PNG' },
  { href: '/etiketka/etiketka.jpg', name: 'etiketka-100x145.jpg', label: 'Скачать JPG' },
];

export default function Etiketka() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Этикетка 100×145 мм, 300 dpi</h1>
      <img src="/etiketka/etiketka.png" alt="Этикетка" className="max-h-[70vh] rounded-lg shadow-lg" />
      <div className="flex flex-wrap gap-3 justify-center">
        {files.map(f => (
          <Button key={f.href} asChild>
            <a href={f.href} download={f.name}>
              <Icon name="Download" size={16} className="mr-2" /> {f.label}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}

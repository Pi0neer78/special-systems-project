import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const services = [
  { icon: 'RefreshCw', title: 'Обновления', desc: 'Релизы и патчи 1С' },
  { icon: 'MessageCircleQuestion', title: 'Вопросы', desc: 'Ответы по 1С' },
  { icon: 'FileText', title: 'Отчётность', desc: 'Помощь с формами' },
  { icon: 'Headphones', title: 'Поддержка', desc: 'Техническое обслуживание' },
];

// ─── Публичная страница ───────────────────────────────────────────────────────

function PublicPage() {
  return (
    <div className="min-h-screen flex flex-col">
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

      {/* Hero */}
      <section className="relative flex-1 flex items-center justify-center py-32 overflow-hidden grid-bg">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-primary/15 rounded-full blur-[150px] animate-glow pointer-events-none" />
        <div className="container relative text-center max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 mb-8 rounded-full border border-primary/40 bg-primary/10 text-primary text-xs font-mono uppercase tracking-widest animate-fade-in">
            <Icon name="Shield" size={13} />
            Сервисный центр поддержки
          </span>

          <h1 className="font-display text-5xl md:text-7xl font-700 leading-[1.05] uppercase tracking-tight animate-fade-in">
            Поддержка{' '}
            <span className="text-primary text-glow">1С:Бухгалтерия</span>
          </h1>

          <p className="mt-7 text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed animate-fade-in">
            <strong className="text-foreground">СпецСистемы</strong> — партнёр по
            сопровождению 1С для вашего бизнеса. Обновления, консультации,
            обслуживание и обратная связь — всё в одном месте.
          </p>

          <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-4 animate-fade-in">
            {services.map((s) => (
              <div
                key={s.title}
                className="p-5 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <Icon name={s.icon} className="text-primary mx-auto mb-3" size={28} />
                <div className="font-display text-sm uppercase tracking-wide">
                  {s.title}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{s.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in">
            <Button
              size="lg"
              variant="outline"
              className="border-border bg-secondary/40 hover:bg-secondary h-12 px-8 w-full sm:w-auto"
              onClick={() =>
                document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              О компании
            </Button>
          </div>
        </div>
      </section>

      {/* About */}
      <section id="about" className="border-t border-border/60 py-20">
        <div className="container grid md:grid-cols-3 gap-10">
          <div className="md:col-span-2">
            <span className="font-mono text-sm text-primary uppercase tracking-widest">
              / О компании
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-700 uppercase mt-3 mb-5">
              СпецСистемы
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Мы специализируемся на внедрении и сопровождении программ семейства
              1С для малого и среднего бизнеса. Наша команда сертифицированных
              специалистов обеспечивает бесперебойную работу вашей бухгалтерии.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Портал поддержки доступен зарегистрированным пользователям —
              войдите, чтобы получить доступ к актуальным обновлениям, задать
              вопрос специалисту и отправить обращение.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { icon: 'Users', v: '500+', l: 'клиентов' },
              { icon: 'Clock', v: '10 лет', l: 'на рынке' },
              { icon: 'Star', v: '98%', l: 'решённых обращений' },
            ].map((s) => (
              <div
                key={s.l}
                className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 border border-primary/30 shrink-0">
                  <Icon name={s.icon} className="text-primary" size={20} />
                </span>
                <div>
                  <div className="font-display text-xl text-primary">{s.v}</div>
                  <div className="text-sm text-muted-foreground">{s.l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="container flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>© 2026 СпецСистемы. Все права защищены.</span>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5">
              <Icon name="Phone" size={14} className="text-primary" />
              +7 (800) 000-00-00
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="Mail" size={14} className="text-primary" />
              support@specsystems.ru
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}



// ─── Корневой компонент ───────────────────────────────────────────────────────

const Index = () => {
  return <PublicPage />;
};

export default Index;
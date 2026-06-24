import { useState } from 'react';
import Icon from '@/components/ui/icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── Данные ──────────────────────────────────────────────────────────────────

const updates = [
  {
    date: '18 июн 2026',
    version: '3.0.71',
    tag: 'Обновление',
    tagColor: 'bg-primary/20 text-primary border-primary/30',
    title: 'Релиз 1С:Бухгалтерия 3.0.71',
    desc: 'Исправлены ошибки при формировании декларации по НДС, обновлены формы отчётности за 2 квартал 2026 г.',
  },
  {
    date: '05 июн 2026',
    version: null,
    tag: 'Изменения в законодательстве',
    tagColor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    title: 'Новые формы 6-НДФЛ',
    desc: 'С 1 июля применяются обновлённые расчёты 6-НДФЛ. Проверьте настройки перед сдачей отчётности.',
  },
  {
    date: '22 май 2026',
    version: '3.0.70',
    tag: 'Обновление',
    tagColor: 'bg-primary/20 text-primary border-primary/30',
    title: 'Обновление платформы 8.3.26',
    desc: 'Повышена стабильность при работе в многопользовательском режиме, улучшена производительность.',
  },
  {
    date: '10 май 2026',
    version: null,
    tag: 'Техобслуживание',
    tagColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    title: 'Плановое обслуживание серверов',
    desc: '12 мая с 01:00 до 04:00 MSK возможны кратковременные перебои в работе облачной версии.',
  },
];

const faqs = [
  {
    q: 'Как обновить 1С:Бухгалтерию до последней версии?',
    a: 'Откройте меню «Администрирование → Интернет-поддержка → Обновление конфигурации». Система проверит наличие обновлений и предложит установить их автоматически.',
  },
  {
    q: 'Что делать, если не формируется отчёт по НДС?',
    a: 'Убедитесь, что версия конфигурации актуальна. Проверьте правильность заполнения реквизитов организации и периода. Если ошибка сохраняется — оставьте вопрос через форму обратной связи.',
  },
  {
    q: 'Как добавить нового пользователя в базу?',
    a: 'Зайдите в «Администрирование → Настройки пользователей и прав → Пользователи» и нажмите «Создать». Укажите имя, пароль и роль.',
  },
  {
    q: 'Потерян доступ к базе данных. Что делать?',
    a: 'Обратитесь к администратору вашей организации или напишите нам через форму обратной связи — восстановим доступ в рабочие часы.',
  },
  {
    q: 'Можно ли перенести базу на другой компьютер?',
    a: 'Да, с помощью выгрузки/загрузки через «Администрирование → Выгрузить информационную базу». Наши специалисты могут помочь — напишите через форму.',
  },
];

const services = [
  { icon: 'RefreshCw', title: 'Обновления', desc: 'Релизы и патчи 1С' },
  { icon: 'MessageCircleQuestion', title: 'Вопросы', desc: 'Ответы по 1С' },
  { icon: 'FileText', title: 'Отчётность', desc: 'Помощь с формами' },
  { icon: 'Headphones', title: 'Поддержка', desc: 'Техническое обслуживание' },
];

// ─── Модалка входа ────────────────────────────────────────────────────────────

function AuthModal({
  open,
  onClose,
  onLogin,
}: {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const [login, setLogin] = useState('');
  const [pass, setPass] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login.trim() && pass.trim()) onLogin();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase flex items-center gap-2.5">
            <Icon name="LogIn" className="text-primary" size={22} />
            Вход для пользователей
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">
              Логин или e-mail
            </label>
            <Input
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="user@company.ru"
              className="bg-secondary/40 border-border focus-visible:ring-primary"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">
              Пароль
            </label>
            <Input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="••••••••"
              className="bg-secondary/40 border-border focus-visible:ring-primary"
            />
          </div>
          <Button
            type="submit"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-11"
          >
            <Icon name="LogIn" size={16} className="mr-2" />
            Войти
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Нет доступа?{' '}
            <button type="button" className="text-primary hover:underline">
              Обратитесь к администратору
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Публичная страница ───────────────────────────────────────────────────────

function PublicPage({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/15 border border-primary/40">
              <Icon name="Hexagon" className="text-primary" size={20} />
            </span>
            <span className="font-display text-xl tracking-wide uppercase">
              Спец<span className="text-primary">Системы</span>
            </span>
          </div>
          <Button
            onClick={onOpenAuth}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          >
            <Icon name="LogIn" size={16} className="mr-2" />
            Вход для пользователей
          </Button>
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
              onClick={onOpenAuth}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-12 px-8 w-full sm:w-auto"
            >
              <Icon name="LogIn" size={18} className="mr-2" />
              Войти в личный кабинет
            </Button>
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

// ─── Портал для авторизованных ────────────────────────────────────────────────

function Portal({ onLogout }: { onLogout: () => void }) {
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [activeTab, setActiveTab] = useState<'updates' | 'faq' | 'feedback'>('updates');

  const tabs = [
    { id: 'updates' as const, label: 'Обновления', icon: 'RefreshCw' },
    { id: 'faq' as const, label: 'Вопросы и ответы', icon: 'MessageCircleQuestion' },
    { id: 'feedback' as const, label: 'Обратная связь', icon: 'Send' },
  ];

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedbackName.trim() && feedbackText.trim()) {
      setFeedbackSent(true);
      setFeedbackName('');
      setFeedbackText('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60 bg-background/90 backdrop-blur-xl sticky top-0 z-40">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/15 border border-primary/40">
              <Icon name="Hexagon" className="text-primary" size={20} />
            </span>
            <span className="font-display text-xl tracking-wide uppercase">
              Спец<span className="text-primary">Системы</span>
            </span>
            <span className="ml-2 text-xs font-mono text-muted-foreground border border-border rounded px-2 py-0.5 hidden sm:inline">
              Портал поддержки 1С
            </span>
          </div>
          <Button
            variant="outline"
            onClick={onLogout}
            className="border-border bg-secondary/40 hover:bg-secondary text-sm"
          >
            <Icon name="LogOut" size={15} className="mr-2" />
            Выйти
          </Button>
        </div>
      </header>

      <main className="flex-1 container py-10">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40'
              }`}
            >
              <Icon name={t.icon} size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Обновления */}
        {activeTab === 'updates' && (
          <div className="space-y-4 animate-fade-in">
            <h2 className="font-display text-2xl uppercase mb-6">
              Обновления и изменения
            </h2>
            {updates.map((u, i) => (
              <div
                key={i}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full border font-mono ${u.tagColor}`}
                    >
                      {u.tag}
                    </span>
                    {u.version && (
                      <span className="text-xs font-mono text-muted-foreground border border-border px-2 py-0.5 rounded">
                        {u.version}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{u.date}</span>
                </div>
                <h3 className="font-display text-lg uppercase mb-2">{u.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{u.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* FAQ */}
        {activeTab === 'faq' && (
          <div className="animate-fade-in max-w-2xl">
            <h2 className="font-display text-2xl uppercase mb-6">Частые вопросы</h2>
            <Accordion type="single" collapsible className="w-full space-y-2">
              {faqs.map((f, i) => (
                <AccordionItem
                  key={i}
                  value={`item-${i}`}
                  className="border border-border rounded-xl px-6 bg-card"
                >
                  <AccordionTrigger className="text-left hover:text-primary font-medium py-5">
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed pb-5">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}

        {/* Обратная связь */}
        {activeTab === 'feedback' && (
          <div className="animate-fade-in max-w-xl">
            <h2 className="font-display text-2xl uppercase mb-6">Обратная связь</h2>
            {feedbackSent ? (
              <div className="p-8 rounded-xl bg-card border border-primary/40 text-center">
                <Icon name="CheckCircle" className="text-primary mx-auto mb-4" size={48} />
                <h3 className="font-display text-xl uppercase mb-2">
                  Сообщение отправлено
                </h3>
                <p className="text-muted-foreground text-sm mb-5">
                  Специалист свяжется с вами в течение рабочего дня.
                </p>
                <Button
                  variant="outline"
                  onClick={() => setFeedbackSent(false)}
                  className="border-border bg-secondary/40 hover:bg-secondary"
                >
                  Отправить ещё
                </Button>
              </div>
            ) : (
              <form
                onSubmit={handleSend}
                className="p-7 rounded-xl bg-card border border-border space-y-4"
              >
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Ваше имя
                  </label>
                  <Input
                    value={feedbackName}
                    onChange={(e) => setFeedbackName(e.target.value)}
                    placeholder="Иван Петров"
                    className="bg-secondary/40 border-border focus-visible:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1.5 block">
                    Вопрос или сообщение
                  </label>
                  <Textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Опишите проблему или задайте вопрос..."
                    rows={6}
                    className="bg-secondary/40 border-border focus-visible:ring-primary resize-none"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-11"
                >
                  <Icon name="Send" size={16} className="mr-2" />
                  Отправить обращение
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Ответ придёт на e-mail, указанный при регистрации
                </p>
              </form>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border/60 py-6">
        <div className="container text-sm text-muted-foreground flex flex-wrap justify-between gap-4">
          <span>© 2026 СпецСистемы</span>
          <span className="font-mono">Портал поддержки 1С:Бухгалтерия</span>
        </div>
      </footer>
    </div>
  );
}

// ─── Корневой компонент ───────────────────────────────────────────────────────

const Index = () => {
  const [authOpen, setAuthOpen] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  if (loggedIn) {
    return <Portal onLogout={() => setLoggedIn(false)} />;
  }

  return (
    <>
      <PublicPage onOpenAuth={() => setAuthOpen(true)} />
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={() => {
          setAuthOpen(false);
          setLoggedIn(true);
        }}
      />
    </>
  );
};

export default Index;

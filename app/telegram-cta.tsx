const TELEGRAM_CHANNEL_URL = "https://t.me/dmitrii_ireshev_Agile_PMP";

export default function TelegramCta({ afterReport = false }: { afterReport?: boolean }) {
  return (
    <aside className={`telegram-cta${afterReport ? " telegram-cta-report" : ""}`} aria-label="Канал Дмитрия Ирешева в Telegram">
      <span className="telegram-cta-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="25" height="25" fill="currentColor">
          <path d="M21.4 3.6 18.2 20c-.2 1.2-.9 1.5-1.9.9l-4.9-3.6-2.3 2.2c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.3-.1-.5-.6-.2L5.8 13.7 1 12.2c-1-.3-1-1 .2-1.5L20 3.4c.9-.3 1.6.2 1.4 1.2Z" />
        </svg>
      </span>
      <div className="telegram-cta-copy">
        <span className="telegram-cta-eyebrow">КАНАЛ ДМИТРИЯ ИРЕШЕВА</span>
        <strong>{afterReport ? "Игра закончилась. Практика продолжается." : "Об управлении проектами — в Telegram"}</strong>
        <p>{afterReport ? "Продолжим разговор о проектах в Telegram." : "Подписывайся на канал автора игры «Дедлайн»."}</p>
      </div>
      <a className="telegram-cta-link" href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
        Подписаться на канал <span aria-hidden="true">↗</span>
        <span className="sr-only"> (откроется в новой вкладке)</span>
      </a>
    </aside>
  );
}

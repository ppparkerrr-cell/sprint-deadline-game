"use client";

import { useEffect, useMemo, useState } from "react";

type GameStatus = "ready" | "running" | "paused" | "won" | "lost";
type TaskState = { progress: number; spent: number };

type GameState = {
  status: GameStatus;
  week: number;
  budget: number;
  spent: number;
  assignments: Array<number | null>;
  taskState: TaskState[];
  chance: "waiting" | "available" | "used" | "missed";
  boostUntil: number;
  eventTitle: string | null;
  eventText: string | null;
};

const DEADLINE = 18;
const BASE_BUDGET = 4_700;
const TICK = 0.25;

const people = [
  { name: "Дарья", role: "Техлид", speed: 1.35, cost: 300, color: "#ff6b4a", initials: "ДА" },
  { name: "Лев", role: "Продакт", speed: 1.05, cost: 220, color: "#8b5cf6", initials: "ЛВ" },
  { name: "Саша", role: "Аналитик", speed: 0.8, cost: 145, color: "#1fc9a5", initials: "СА" },
  { name: "Ким", role: "Дизайнер", speed: 1.15, cost: 260, color: "#f6b73c", initials: "КИ" },
];

const tasks = [
  { name: "Собрать требования", short: "Требования", start: 0, end: 3.5, effort: 2.7, budget: 510, color: "#ff7352" },
  { name: "Исследовать аудиторию", short: "Исследование", start: 1.5, end: 5.5, effort: 3.0, budget: 620, color: "#ff9f43" },
  { name: "Собрать прототип", short: "Прототип", start: 4, end: 9.5, effort: 4.2, budget: 900, color: "#8b5cf6" },
  { name: "Разработать продукт", short: "Разработка", start: 7, end: 14.5, effort: 5.7, budget: 1_430, color: "#3b82f6" },
  { name: "Провести тестирование", short: "Тестирование", start: 11, end: 16.5, effort: 3.8, budget: 790, color: "#1fc9a5" },
  { name: "Подготовить запуск", short: "Запуск", start: 14, end: 18, effort: 2.5, budget: 450, color: "#ef4f91" },
];

function freshGame(): GameState {
  return {
    status: "ready",
    week: 0,
    budget: BASE_BUDGET,
    spent: 0,
    assignments: tasks.map(() => null),
    taskState: tasks.map(() => ({ progress: 0, spent: 0 })),
    chance: "waiting",
    boostUntil: 0,
    eventTitle: null,
    eventText: null,
  };
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} тыс. ₽`;
}

function scoreFor(game: GameState) {
  const completed = game.taskState.filter((task) => task.progress >= 99.9).length;
  return Math.max(0, Math.round(completed * 1_000 + Math.max(0, game.budget - game.spent)));
}

export default function ProjectGame() {
  const [game, setGame] = useState<GameState>(freshGame);
  const [showRules, setShowRules] = useState(false);
  const [record, setRecord] = useState(0);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem("sprint-deadline-record") || 0);
    setRecord(saved);
  }, []);

  useEffect(() => {
    if (game.status !== "won") return;
    const score = scoreFor(game);
    if (score > record) {
      window.localStorage.setItem("sprint-deadline-record", String(score));
      setRecord(score);
    }
  }, [game, record]);

  useEffect(() => {
    if (game.status !== "running") return;
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "running") return current;
        const nextWeek = Math.min(DEADLINE, current.week + TICK);
        let nextSpent = current.spent;
        const activeAssignments = new Map<number, number>();

        tasks.forEach((task, index) => {
          if (current.week >= task.start && current.taskState[index].progress < 100) {
            const person = current.assignments[index];
            if (person !== null) activeAssignments.set(person, (activeAssignments.get(person) || 0) + 1);
          }
        });

        const nextTasks = current.taskState.map((state, index) => {
          const task = tasks[index];
          const personIndex = current.assignments[index];
          if (current.week < task.start || state.progress >= 100 || personIndex === null) return state;
          const person = people[personIndex];
          const overloaded = (activeAssignments.get(personIndex) || 0) > 1;
          const boost = current.boostUntil > current.week ? 1.28 : 1;
          const progressGain = (100 / task.effort) * person.speed * (overloaded ? 0.32 : 1) * boost * TICK;
          const costGain = person.cost * TICK;
          nextSpent += costGain;
          return {
            progress: Math.min(100, state.progress + progressGain),
            spent: state.spent + costGain,
          };
        });

        let nextChance = current.chance;
        if (current.chance === "waiting" && nextWeek >= 5.75) nextChance = "available";
        if (current.chance === "available" && nextWeek >= 7.5) nextChance = "missed";

        if (nextWeek >= DEADLINE) {
          const complete = nextTasks.every((task) => task.progress >= 99.9);
          const won = complete && nextSpent <= current.budget;
          const finalGame = {
            ...current,
            status: won ? ("won" as const) : ("lost" as const),
            week: DEADLINE,
            spent: nextSpent,
            taskState: nextTasks,
            chance: nextChance,
          };
          return finalGame;
        }

        return { ...current, week: nextWeek, spent: nextSpent, taskState: nextTasks, chance: nextChance };
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const activeTasks = useMemo(
    () => tasks.map((task, index) => ({ task, index })).filter(({ task, index }) => game.week >= task.start && game.taskState[index].progress < 100),
    [game.week, game.taskState],
  );

  const assignmentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    activeTasks.forEach(({ index }) => {
      const person = game.assignments[index];
      if (person !== null) counts.set(person, (counts.get(person) || 0) + 1);
    });
    return counts;
  }, [activeTasks, game.assignments]);

  const remainingCost = tasks.reduce((sum, task, index) => {
    const remaining = Math.max(0, 1 - game.taskState[index].progress / 100);
    const assigned = game.assignments[index];
    const person = assigned === null ? people[1] : people[assigned];
    return sum + remaining * task.effort * (person.cost / person.speed);
  }, 0);
  const forecast = game.spent + remainingCost;
  const completedCount = game.taskState.filter((task) => task.progress >= 99.9).length;
  const unassignedActive = activeTasks.filter(({ index }) => game.assignments[index] === null).length;
  const overloadedPeople = [...assignmentCounts.entries()].filter(([, count]) => count > 1).map(([index]) => people[index]);
  const health = overloadedPeople.length ? "Перегрузка" : unassignedActive ? "Нужен сотрудник" : forecast > game.budget ? "Риск бюджета" : "Всё по плану";
  const healthTone = overloadedPeople.length || forecast > game.budget ? "danger" : unassignedActive ? "warning" : "good";

  function assign(taskIndex: number, value: string) {
    setGame((current) => {
      const assignments = [...current.assignments];
      assignments[taskIndex] = value === "" ? null : Number(value);
      return { ...current, assignments };
    });
  }

  function toggleRun() {
    setGame((current) => {
      if (current.status === "ready" || current.status === "paused") return { ...current, status: "running", eventTitle: null, eventText: null };
      if (current.status === "running") return { ...current, status: "paused" };
      return current;
    });
  }

  function takeChance() {
    if (game.chance !== "available") return;
    const events = [
      { title: "Клиент всё согласовал", text: "+12% прогресса по активным задачам", kind: "progress" },
      { title: "Нашёлся резерв", text: "Бюджет увеличен на 600 тыс. ₽", kind: "budget" },
      { title: "Команда поймала поток", text: "+28% к скорости на 4 недели", kind: "boost" },
      { title: "Внезапная переделка", text: "Активные задачи потеряли 9% прогресса", kind: "setback" },
      { title: "Подорожали подрядчики", text: "Незапланированные расходы: 420 тыс. ₽", kind: "cost" },
    ];
    const event = events[Math.floor(Math.random() * events.length)];
    setGame((current) => {
      let budget = current.budget;
      let spent = current.spent;
      let boostUntil = current.boostUntil;
      let taskState = current.taskState;
      if (event.kind === "budget") budget += 600;
      if (event.kind === "cost") spent += 420;
      if (event.kind === "boost") boostUntil = current.week + 4;
      if (event.kind === "progress") taskState = current.taskState.map((state, index) => current.week >= tasks[index].start && state.progress < 100 ? { ...state, progress: Math.min(100, state.progress + 12) } : state);
      if (event.kind === "setback") taskState = current.taskState.map((state, index) => current.week >= tasks[index].start && state.progress < 100 ? { ...state, progress: Math.max(0, state.progress - 9) } : state);
      return { ...current, status: "paused", chance: "used", budget, spent, boostUntil, taskState, eventTitle: event.title, eventText: event.text };
    });
  }

  const isFinished = game.status === "won" || game.status === "lost";

  return (
    <main className="game-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#game" aria-label="СПРИНТ: ДЕДЛАЙН — к игровому полю">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><b>СПРИНТ</b><em>ДЕДЛАЙН</em></span>
        </a>
        <div className="top-actions">
          <button className="quiet-button" onClick={() => setShowRules(true)}>Как играть</button>
          <div className="record-pill"><span>Личный рекорд</span><b>{record.toLocaleString("ru-RU")}</b></div>
        </div>
      </header>

      <section className="hero" id="game">
        <div>
          <p className="eyebrow"><span /> ПРОЕКТ 04 · ЗАПУСК ПРИЛОЖЕНИЯ</p>
          <h1>Уложись в срок.<br /><span>Не сожги команду.</span></h1>
        </div>
        <p className="hero-copy">Распредели людей по задачам, следи за расходами и доведи продукт до релиза за 18 недель.</p>
      </section>

      <section className="stats-grid" aria-label="Состояние проекта">
        <article className="stat-card budget-card">
          <div className="stat-label"><span>БЮДЖЕТ</span><i className={game.spent > game.budget ? "dot danger-dot" : "dot"} /></div>
          <strong>{money(game.budget - game.spent)}</strong>
          <div className="meter"><i style={{ width: `${Math.min(100, (game.spent / game.budget) * 100)}%` }} /></div>
          <small>Потрачено {money(game.spent)} из {money(game.budget)}</small>
        </article>
        <article className="stat-card">
          <div className="stat-label"><span>СРОК</span><i className="calendar-icon">▦</i></div>
          <strong>Неделя {Math.min(DEADLINE, Math.floor(game.week) + (game.week > 0 ? 1 : 0))} <small>/ {DEADLINE}</small></strong>
          <div className="meter coral"><i style={{ width: `${(game.week / DEADLINE) * 100}%` }} /></div>
          <small>{Math.max(0, Math.ceil(DEADLINE - game.week))} недель до релиза</small>
        </article>
        <article className="stat-card">
          <div className="stat-label"><span>ГОТОВНОСТЬ</span><i className="mini-ring">{completedCount}</i></div>
          <strong>{Math.round(game.taskState.reduce((sum, task) => sum + task.progress, 0) / tasks.length)}%</strong>
          <div className="meter violet"><i style={{ width: `${game.taskState.reduce((sum, task) => sum + task.progress, 0) / tasks.length}%` }} /></div>
          <small>{completedCount} из {tasks.length} задач завершено</small>
        </article>
        <article className={`stat-card health-card ${healthTone}`}>
          <div className="stat-label"><span>СТАТУС</span><i className="pulse-dot" /></div>
          <strong>{health}</strong>
          <small>Прогноз: {money(forecast)}</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="team-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">КОМАНДА</p><h2>Твои люди</h2></div>
            <span>{people.length} специалиста</span>
          </div>
          <div className="people-list">
            {people.map((person, index) => {
              const load = assignmentCounts.get(index) || 0;
              return (
                <article className={`person-card ${load > 1 ? "overloaded" : ""}`} key={person.name}>
                  <div className="avatar" style={{ background: person.color }}>{person.initials}</div>
                  <div className="person-copy"><b>{person.name}</b><span>{person.role}</span></div>
                  <div className="person-meta"><b>{person.speed.toFixed(2)}×</b><span>{money(person.cost)}/нед.</span></div>
                  <div className="load-line"><i style={{ width: `${Math.min(100, load * 52)}%` }} /></div>
                  {load > 1 && <span className="burnout-badge">перегрузка ×{load}</span>}
                </article>
              );
            })}
          </div>
          <div className="legend-note"><span>!</span><p><b>Скорость ≠ стоимость</b>Дешёвый специалист может оказаться выгоднее — пока сроки не горят.</p></div>
        </aside>

        <section className="gantt-panel">
          <div className="panel-heading gantt-heading">
            <div><p className="section-kicker">ПЛАН ПРОЕКТА</p><h2>Диаграмма Ганта</h2></div>
            <div className="view-switch" aria-label="Масштаб диаграммы"><button className="active">Недели</button><button disabled>Месяцы</button></div>
          </div>

          <div className="gantt-scroll">
            <div className="gantt-board">
              <div className="gantt-top-row">
                <div className="task-col-title">ЗАДАЧА / ИСПОЛНИТЕЛЬ</div>
                <div className="week-grid week-labels">{Array.from({ length: DEADLINE }, (_, i) => <span key={i}>{i + 1}</span>)}</div>
                <div className="cost-col-title">РАСХОДЫ</div>
              </div>

              {tasks.map((task, index) => {
                const state = game.taskState[index];
                const late = game.week > task.end && state.progress < 100;
                const variance = state.spent - task.budget;
                return (
                  <div className="gantt-row" key={task.name}>
                    <div className="task-info">
                      <b>{task.name}</b>
                      <label>
                        <span className="sr-only">Исполнитель задачи «{task.name}»</span>
                        <select value={game.assignments[index] ?? ""} onChange={(event) => assign(index, event.target.value)} disabled={isFinished}>
                          <option value="">Назначить…</option>
                          {people.map((person, personIndex) => <option key={person.name} value={personIndex}>{person.name} · {person.role}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="timeline-cell">
                      <div className="week-grid grid-lines">{Array.from({ length: DEADLINE }, (_, i) => <span key={i} />)}</div>
                      <div className="task-bar" style={{ left: `${(task.start / DEADLINE) * 100}%`, width: `${((task.end - task.start) / DEADLINE) * 100}%`, background: task.color }}>
                        <i style={{ width: `${state.progress}%` }} />
                        <span>{Math.round(state.progress)}%</span>
                      </div>
                      {late && <span className="late-flag" style={{ left: `${(task.end / DEADLINE) * 100}%` }}>!</span>}
                      <div className="now-line" style={{ left: `${(game.week / DEADLINE) * 100}%` }}><i /></div>
                    </div>
                    <div className="task-cost"><b>{money(state.spent)}</b><span className={variance > 0 ? "negative" : "positive"}>{variance > 0 ? "+" : ""}{money(variance)}</span></div>
                  </div>
                );
              })}

              <div className="deadline-row">
                <div><b>ДЕДЛАЙН</b><span>Релиз продукта</span></div>
                <div className="deadline-track"><i style={{ left: `${(game.week / DEADLINE) * 100}%` }} /><span>◆ НЕДЕЛЯ {DEADLINE}</span></div>
                <div />
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className={`control-deck ${game.chance === "available" ? "chance-live" : ""}`}>
        <div className="control-status">
          <span className={`status-orb ${healthTone}`}>{game.status === "running" ? "▶" : game.status === "paused" ? "Ⅱ" : "●"}</span>
          <div><p>{game.status === "ready" ? "План готов к запуску" : game.status === "paused" ? "Симуляция на паузе" : game.status === "running" ? "Проект в работе" : game.status === "won" ? "Проект успешно запущен" : "Дедлайн наступил"}</p><span>{overloadedPeople.length ? `Перегружены: ${overloadedPeople.map((p) => p.name).join(", ")}` : unassignedActive ? `Без исполнителя: ${unassignedActive}` : "Ресурсы распределены корректно"}</span></div>
        </div>

        {game.chance === "available" && <button className="chance-button" onClick={takeChance}><span>✦</span><div><b>СЛУЧАЙНОЕ СОБЫТИЕ</b><small>Окно скоро закроется</small></div></button>}
        {game.chance === "missed" && <div className="chance-missed">Шанс упущен</div>}
        {game.chance === "used" && !game.eventTitle && <div className="chance-missed good-text">Событие разыграно</div>}

        <div className="main-controls">
          <button className="reset-button" onClick={() => setGame(freshGame())} aria-label="Начать проект заново">↻</button>
          {!isFinished && <button className="start-button" onClick={toggleRun}>{game.status === "running" ? <><span>Ⅱ</span> ПАУЗА</> : <><span>▶</span> {game.status === "ready" ? "ЗАПУСТИТЬ ПРОЕКТ" : "ПРОДОЛЖИТЬ"}</>}</button>}
          {isFinished && <button className="start-button" onClick={() => setGame(freshGame())}><span>↻</span> НОВЫЙ ПРОЕКТ</button>}
        </div>
      </section>

      <footer><p>СПРИНТ: ДЕДЛАЙН</p><span>Игра-тренажёр проектного мышления</span><button onClick={() => setShowRules(true)}>Правила игры</button></footer>

      {game.eventTitle && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className="event-modal"><span className="event-spark">✦</span><p>СЛУЧАЙНОЕ СОБЫТИЕ</p><h2 id="event-title">{game.eventTitle}</h2><strong>{game.eventText}</strong><button onClick={toggleRun}>Продолжить проект →</button></div>
        </div>
      )}

      {isFinished && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className={`result-modal ${game.status}`}>
            <span className="result-icon">{game.status === "won" ? "✓" : "!"}</span>
            <p>{game.status === "won" ? "МИССИЯ ВЫПОЛНЕНА" : "ПРОЕКТ НЕ СДАН"}</p>
            <h2 id="result-title">{game.status === "won" ? "Релиз состоялся!" : "Дедлайн оказался быстрее"}</h2>
            <div className="result-stats"><span><b>{completedCount}/{tasks.length}</b>задач</span><span><b>{money(game.budget - game.spent)}</b>остаток</span><span><b>{scoreFor(game).toLocaleString("ru-RU")}</b>очков</span></div>
            <button onClick={() => setGame(freshGame())}>Сыграть ещё раз →</button>
          </div>
        </div>
      )}

      {showRules && (
        <div className="modal-backdrop rules-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.currentTarget === event.target && setShowRules(false)}>
          <div className="rules-modal">
            <button className="close-button" onClick={() => setShowRules(false)} aria-label="Закрыть правила">×</button>
            <p className="section-kicker">КАК ИГРАТЬ</p><h2 id="rules-title">Управляй людьми,<br />а не полосками</h2>
            <ol>
              <li><span>01</span><div><b>Назначай исполнителей</b><p>Выбери сотрудника для каждой задачи. Переназначать людей можно в любой момент.</p></div></li>
              <li><span>02</span><div><b>Следи за временем и деньгами</b><p>Прогресс идёт только после старта задачи. Каждый специалист тратит бюджет каждую неделю.</p></div></li>
              <li><span>03</span><div><b>Не допускай перегрузки</b><p>Один человек на двух активных задачах работает значительно медленнее, но расходы продолжают расти.</p></div></li>
              <li><span>04</span><div><b>Лови шанс</b><p>Около шестой недели появится случайное событие. Оно может помочь — или усложнить проект.</p></div></li>
            </ol>
            <div className="win-condition"><span>ЦЕЛЬ</span><p>Заверши все 6 задач <b>до конца 18-й недели</b> и не выйди за бюджет.</p></div>
            <button className="start-button rules-start" onClick={() => setShowRules(false)}>Понятно, начинаем →</button>
          </div>
        </div>
      )}
    </main>
  );
}

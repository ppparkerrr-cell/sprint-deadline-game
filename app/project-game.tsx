"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";

type GameStatus = "ready" | "running" | "paused" | "won" | "lost";
type EventTone = "good" | "bad";
type EventKind = "task-progress" | "budget" | "boost" | "task-setback" | "task-cost" | "absence" | "training" | "discount" | "assist" | "slow-time";
type FailureReason = "deadline" | "budget" | "both" | null;

type Person = {
  name: string;
  role: string;
  speed: number;
  cost: number;
  color: string;
  initials: string;
};

type TaskState = { progress: number; spent: number };
type EventDefinition = {
  title: string;
  text: string;
  effect: string;
  icon: string;
  kind: EventKind;
  tone: EventTone;
  value: number;
  targetTask?: number;
  targetPerson?: number;
};

type EventHistoryItem = EventDefinition & { week: number };

type GameState = {
  status: GameStatus;
  seed: number;
  week: number;
  budget: number;
  spent: number;
  team: Person[];
  taskEfforts: number[];
  taskBudgets: number[];
  assignments: Array<number | null>;
  taskState: TaskState[];
  nextEventWeek: number;
  eventCount: number;
  boostUntil: number;
  absentPerson: number | null;
  absentUntil: number;
  timeScale: number;
  failureReason: FailureReason;
  pendingEvent: EventDefinition | null;
  eventHistory: EventHistoryItem[];
};

const DEADLINE = 18;
const BASE_BUDGET = 4_700;
const TICK = 0.25;
const MAX_EVENTS = 4;

const peoplePool: Person[] = [
  { name: "Дарья", role: "Техлид", speed: 1.35, cost: 300, color: "#ff6b4a", initials: "ДА" },
  { name: "Лев", role: "Продакт", speed: 1.05, cost: 220, color: "#8b5cf6", initials: "ЛВ" },
  { name: "Саша", role: "Аналитик", speed: 0.8, cost: 145, color: "#1fc9a5", initials: "СА" },
  { name: "Ким", role: "Дизайнер", speed: 1.15, cost: 260, color: "#f6b73c", initials: "КИ" },
  { name: "Марк", role: "Разработчик", speed: 1.2, cost: 285, color: "#4f8cff", initials: "МР" },
  { name: "Анна", role: "Исследователь", speed: 1, cost: 200, color: "#ec6fa8", initials: "АН" },
  { name: "Вика", role: "QA-инженер", speed: 1, cost: 195, color: "#69d2e7", initials: "ВИ" },
  { name: "Борис", role: "Архитектор", speed: 1.5, cost: 340, color: "#ff8a3d", initials: "БО" },
  { name: "Роман", role: "Интегратор", speed: 0.85, cost: 280, color: "#94a3b8", initials: "РО" },
  { name: "Жанна", role: "Редактор", speed: 0.82, cost: 135, color: "#84cc16", initials: "ЖА" },
];

const tasks = [
  { name: "Собрать требования", short: "Требования", start: 0, end: 3.5, effort: 2.7, budget: 510, color: "#ff7352", dependsOn: [] as number[] },
  { name: "Исследовать аудиторию", short: "Исследование", start: 1.5, end: 5.5, effort: 3.0, budget: 620, color: "#ff9f43", dependsOn: [] as number[] },
  { name: "Собрать прототип", short: "Прототип", start: 4, end: 9.5, effort: 4.2, budget: 900, color: "#8b5cf6", dependsOn: [0, 1] },
  { name: "Разработать продукт", short: "Разработка", start: 7, end: 14.5, effort: 5.7, budget: 1_430, color: "#3b82f6", dependsOn: [2] },
  { name: "Провести тестирование", short: "Тестирование", start: 11, end: 16.5, effort: 3.8, budget: 790, color: "#1fc9a5", dependsOn: [3] },
  { name: "Подготовить запуск", short: "Запуск", start: 14, end: 18, effort: 2.5, budget: 450, color: "#ef4f91", dependsOn: [4] },
];

function createRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function freshGame(seed = 0): GameState {
  const random = createRandom(seed || 4);
  const shuffled = [...peoplePool].sort(() => random() - 0.5);
  const team = seed === 0 ? peoplePool.slice(0, 4) : shuffled.slice(0, 4);
  if (Math.max(...team.map((person) => person.speed)) < 1.15) {
    const fastestReserve = [...peoplePool].sort((a, b) => b.speed - a.speed).find((person) => !team.includes(person));
    if (fastestReserve) team[team.length - 1] = fastestReserve;
  }
  const taskEfforts = tasks.map((task) => seed === 0 ? task.effort : task.effort * (0.9 + random() * 0.2));
  const taskBudgets = tasks.map((task) => seed === 0 ? task.budget : Math.round((task.budget * (0.92 + random() * 0.16)) / 10) * 10);
  const generatedBudget = taskBudgets.reduce((sum, value) => sum + value, 0) + (seed === 0 ? 0 : Math.round((random() * 300 - 150) / 50) * 50);
  return {
    status: "ready",
    seed,
    week: 0,
    budget: seed === 0 ? BASE_BUDGET : generatedBudget,
    spent: 0,
    team,
    taskEfforts,
    taskBudgets,
    assignments: tasks.map(() => null),
    taskState: tasks.map(() => ({ progress: 0, spent: 0 })),
    nextEventWeek: 3,
    eventCount: 0,
    boostUntil: 0,
    absentPerson: null,
    absentUntil: 0,
    timeScale: 1,
    failureReason: null,
    pendingEvent: null,
    eventHistory: [],
  };
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} тыс. ₽`;
}

function scoreFor(game: GameState) {
  const completed = game.taskState.filter((task) => task.progress >= 99.9).length;
  return Math.max(0, Math.round(completed * 1_000 + Math.max(0, game.budget - game.spent)));
}

function dependenciesComplete(taskState: TaskState[], taskIndex: number) {
  return tasks[taskIndex].dependsOn.every((dependency) => taskState[dependency].progress >= 99.9);
}

function chooseEvent(current: GameState) {
  const incomplete = tasks.map((_, index) => index).filter((index) => current.taskState[index].progress < 99.9);
  const active = incomplete.filter((index) => current.week >= tasks[index].start && dependenciesComplete(current.taskState, index));
  const unstarted = incomplete.filter((index) => current.taskState[index].progress < 1);
  const targetTask = (active.length ? active : incomplete)[Math.floor(Math.random() * (active.length || incomplete.length))];
  const waitingTask = unstarted[Math.floor(Math.random() * Math.max(1, unstarted.length))];
  const targetPerson = Math.floor(Math.random() * current.team.length);
  const person = current.team[targetPerson];
  const options: EventDefinition[] = [
    { title: "Руководство выделило резерв", text: "У проекта появился дополнительный запас на непредвиденные работы.", effect: "+500 тыс. ₽ к бюджету проекта", icon: "+", kind: "budget", tone: "good", value: 500 },
    { title: "Команда поймала рабочий ритм", text: "На несколько недель специалисты работают заметно быстрее.", effect: "+28% к скорости всей команды на 3 недели", icon: "↗", kind: "boost", tone: "good", value: 3 },
    { title: `${person.name} прошёл интенсив`, text: "Обучение дало постоянный прирост производительности.", effect: `${person.name}: скорость +0,22× до конца проекта`, icon: "↑", kind: "training", tone: "good", value: 0.22, targetPerson },
    { title: `Ставка ${person.name} снижена`, text: "Удалось пересмотреть условия участия специалиста в проекте.", effect: `${person.name}: стоимость −40 тыс. ₽/нед.`, icon: "₽", kind: "discount", tone: "good", value: 40, targetPerson },
    { title: `${person.name} временно недоступен`, text: "Специалист выпадает из работы. Его активные задачи остановятся, но исполнителя можно заменить.", effect: `${person.name} не работает 2 недели`, icon: "!", kind: "absence", tone: "bad", value: 2, targetPerson },
  ];

  if (targetTask !== undefined) {
    options.push(
      { title: `Прорыв: «${tasks[targetTask].short}»`, text: "Команда нашла решение и закрыла большой кусок работы раньше ожиданий.", effect: `+35% к задаче «${tasks[targetTask].short}»`, icon: "✓", kind: "task-progress", tone: "good", value: 35, targetTask },
      { title: `Переделка: «${tasks[targetTask].short}»`, text: "Заказчик уточнил требования, и часть результата приходится пересобрать.", effect: `−12% у задачи «${tasks[targetTask].short}»`, icon: "↺", kind: "task-setback", tone: "bad", value: 12, targetTask },
      { title: `Подорожала задача «${tasks[targetTask].short}»`, text: "Внешние сервисы и подрядчики увеличили фактическую стоимость работы.", effect: `+320 тыс. ₽ к расходам задачи`, icon: "₽", kind: "task-cost", tone: "bad", value: 320, targetTask },
    );
  }
  if (waitingTask !== undefined) {
    options.push({ title: `Помощь смежной команды`, text: `Другой отдел полностью берёт на себя этап «${tasks[waitingTask].short}».`, effect: `задача «${tasks[waitingTask].short}» завершена за 72% плановой цены`, icon: "◆", kind: "assist", tone: "good", value: 0.72, targetTask: waitingTask });
  }
  if (current.timeScale === 1) {
    options.push({ title: "Заказчик дал больше времени на решения", text: "Календарная линия движется медленнее, пока команда продолжает работать в обычном темпе.", effect: "ход времени замедлен на 35% до конца проекта", icon: "◷", kind: "slow-time", tone: "good", value: 0.65 });
  }

  const previousKind = current.eventHistory.at(-1)?.kind;
  const available = options.filter((event) => event.kind !== previousKind);
  return available[Math.floor(Math.random() * available.length)];
}

function applyEvent(current: GameState, event: EventDefinition): GameState {
  let budget = current.budget;
  let spent = current.spent;
  let boostUntil = current.boostUntil;
  let absentPerson = current.absentPerson;
  let absentUntil = current.absentUntil;
  let timeScale = current.timeScale;
  let taskState = current.taskState;
  let team = current.team;

  if (event.kind === "budget") budget += event.value;
  if (event.kind === "boost") boostUntil = current.week + event.value;
  if (event.kind === "slow-time") timeScale = event.value;
  if (event.kind === "absence") {
    absentPerson = event.targetPerson ?? 0;
    absentUntil = current.week + event.value;
  }
  if (event.kind === "training" && event.targetPerson !== undefined) {
    team = current.team.map((person, index) => index === event.targetPerson ? { ...person, speed: person.speed + event.value } : person);
  }
  if (event.kind === "discount" && event.targetPerson !== undefined) {
    team = current.team.map((person, index) => index === event.targetPerson ? { ...person, cost: Math.max(90, person.cost - event.value) } : person);
  }
  if (event.targetTask !== undefined && event.kind === "task-progress") {
    taskState = current.taskState.map((state, index) => index === event.targetTask ? { ...state, progress: Math.min(100, state.progress + event.value) } : state);
  }
  if (event.targetTask !== undefined && event.kind === "task-setback") {
    taskState = current.taskState.map((state, index) => index === event.targetTask ? { ...state, progress: Math.max(0, state.progress - event.value) } : state);
  }
  if (event.targetTask !== undefined && event.kind === "task-cost") {
    spent += event.value;
    taskState = current.taskState.map((state, index) => index === event.targetTask ? { ...state, spent: state.spent + event.value } : state);
  }
  if (event.targetTask !== undefined && event.kind === "assist") {
    const addedCost = current.taskBudgets[event.targetTask] * event.value;
    spent += addedCost;
    taskState = current.taskState.map((state, index) => index === event.targetTask ? { progress: 100, spent: state.spent + addedCost } : state);
  }

  return {
    ...current,
    status: "paused",
    budget,
    spent,
    boostUntil,
    absentPerson,
    absentUntil,
    timeScale,
    team,
    taskState,
    pendingEvent: event,
    eventHistory: [...current.eventHistory, { ...event, week: current.week }],
  };
}

export default function ProjectGame() {
  const [game, setGame] = useState<GameState>(freshGame);
  const [showRules, setShowRules] = useState(false);
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [record, setRecord] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setRecord(Number(window.localStorage.getItem("sprint-deadline-record") || 0));
      } catch {
        setRecord(0);
      }
      setGame((current) => current.seed === 0 ? freshGame(Date.now()) : current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showRules) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setShowRules(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [showRules]);

  useEffect(() => {
    if (game.status !== "won") return;
    const score = scoreFor(game);
    if (score > record) {
      const timer = window.setTimeout(() => {
        try {
          window.localStorage.setItem("sprint-deadline-record", String(score));
        } catch {
          // Рекорд остаётся доступен в текущей вкладке, даже если хранилище заблокировано.
        }
        setRecord(score);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [game, record]);

  useEffect(() => {
    if (game.status !== "running") return;
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (current.status !== "running") return current;
        const nextWeek = Math.min(DEADLINE, current.week + TICK * current.timeScale);
        let nextSpent = current.spent;
        const activeAssignments = new Map<number, number>();

        tasks.forEach((task, index) => {
          if (current.week >= task.start && dependenciesComplete(current.taskState, index) && current.taskState[index].progress < 100) {
            const person = current.assignments[index];
            if (person !== null) activeAssignments.set(person, (activeAssignments.get(person) || 0) + 1);
          }
        });

        const nextTasks = current.taskState.map((state, index) => {
          const task = tasks[index];
          const personIndex = current.assignments[index];
          if (current.week < task.start || !dependenciesComplete(current.taskState, index) || state.progress >= 100 || personIndex === null) return state;
          const person = current.team[personIndex];
          const overloaded = (activeAssignments.get(personIndex) || 0) > 1;
          const absent = current.absentPerson === personIndex && current.absentUntil > current.week;
          const boost = current.boostUntil > current.week ? 1.28 : 1;
          const stochasticStep = Math.random() < 0.34 ? 0.72 : 1.14;
          const progressGain = absent ? 0 : (100 / current.taskEfforts[index]) * person.speed * (overloaded ? 0.32 : 1) * boost * stochasticStep * TICK;
          const costGain = absent ? 0 : person.cost * (progressGain / 100) * current.taskEfforts[index] / person.speed;
          nextSpent += costGain;
          return { progress: Math.min(100, state.progress + progressGain), spent: state.spent + costGain };
        });

        const complete = nextTasks.every((task) => task.progress >= 99.9);
        if (complete) {
          const won = nextSpent <= current.budget;
          return { ...current, status: won ? "won" : "lost", failureReason: won ? null : "budget", week: nextWeek, spent: nextSpent, taskState: nextTasks };
        }

        const eventDue = current.eventCount < MAX_EVENTS && nextWeek >= current.nextEventWeek;
        if (eventDue) {
          const event = chooseEvent({ ...current, week: nextWeek, spent: nextSpent, taskState: nextTasks });
          return applyEvent({
            ...current,
            week: nextWeek,
            spent: nextSpent,
            taskState: nextTasks,
            eventCount: current.eventCount + 1,
            nextEventWeek: nextWeek + 3.5 + Math.random() * 1.5,
          }, event);
        }

        if (nextWeek >= DEADLINE) {
          const overBudget = nextSpent > current.budget;
          return { ...current, status: "lost", failureReason: overBudget ? "both" : "deadline", week: DEADLINE, spent: nextSpent, taskState: nextTasks };
        }

        return { ...current, week: nextWeek, spent: nextSpent, taskState: nextTasks };
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const activeTasks = useMemo(
    () => tasks.map((task, index) => ({ task, index })).filter(({ task, index }) => game.week >= task.start && dependenciesComplete(game.taskState, index) && game.taskState[index].progress < 100),
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
    const person = assigned === null
      ? [...game.team].sort((a, b) => (a.cost / a.speed) - (b.cost / b.speed))[0]
      : game.team[assigned];
    return sum + remaining * game.taskEfforts[index] * (person.cost / person.speed);
  }, 0);
  const forecast = game.spent + remainingCost;
  const completedCount = game.taskState.filter((task) => task.progress >= 99.9).length;
  const unassignedActive = activeTasks.filter(({ index }) => game.assignments[index] === null).length;
  const unassignedRemaining = game.assignments.filter((person, index) => person === null && game.taskState[index].progress < 99.9).length;
  const overloadedPeople = [...assignmentCounts.entries()].filter(([, count]) => count > 1).map(([index]) => game.team[index]);
  const absentName = game.absentPerson !== null && game.absentUntil > game.week ? game.team[game.absentPerson].name : null;
  const health = absentName ? `${absentName} недоступен` : overloadedPeople.length ? "Перегрузка" : unassignedRemaining ? `Не назначено: ${unassignedRemaining}` : forecast > game.budget ? "Риск бюджета" : "Всё по плану";
  const healthTone = absentName || overloadedPeople.length || forecast > game.budget ? "danger" : unassignedRemaining ? "warning" : "good";
  const overallProgress = game.taskState.reduce((sum, task) => sum + task.progress, 0) / tasks.length;
  const isFinished = game.status === "won" || game.status === "lost";

  function assign(taskIndex: number, value: string) {
    setGame((current) => {
      const assignments = [...current.assignments];
      assignments[taskIndex] = value === "" ? null : Number(value);
      return { ...current, assignments };
    });
  }

  function toggleRun() {
    if (game.status === "ready" && game.assignments.every((person) => person === null)) {
      setShowStartWarning(true);
      return;
    }
    setGame((current) => {
      if (current.status === "ready" || current.status === "paused") return { ...current, status: "running", pendingEvent: null };
      if (current.status === "running") return { ...current, status: "paused" };
      return current;
    });
  }

  function startFreshProject() {
    setShowStartWarning(false);
    setGame(freshGame(Date.now()));
  }

  function forceStart() {
    setShowStartWarning(false);
    setGame((current) => ({ ...current, status: "running" }));
  }

  function acknowledgeEvent() {
    setGame((current) => ({ ...current, status: "paused", pendingEvent: null }));
  }

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
        <div className="hero-actions">
          <p className="hero-copy">Распредели людей по задачам, реагируй на события и доведи продукт до релиза за 18 недель.</p>
          <button className="guide-button" onClick={() => setShowRules(true)}><span>?</span> Посмотреть инструкцию</button>
        </div>
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
          <div className="stat-label"><span>ГОТОВНОСТЬ ПРОЕКТА</span><i className="mini-ring">{completedCount}</i></div>
          <strong>{Math.round(overallProgress)}%</strong>
          <div className="meter violet"><i style={{ width: `${overallProgress}%` }} /></div>
          <small>{completedCount} из {tasks.length} задач полностью готовы</small>
        </article>
        <article className={`stat-card health-card ${healthTone}`}>
          <div className="stat-label"><span>СТАТУС</span><i className="pulse-dot" /></div>
          <strong>{health}</strong>
          <small>Прогноз расходов: {money(forecast)}</small>
        </article>
      </section>

      <section className="workspace">
        <aside className="team-panel">
          <div className="panel-heading">
            <div><p className="section-kicker">КОМАНДА</p><h2>Твои люди</h2></div>
            <span>{game.team.length} специалиста</span>
          </div>
          <div className="people-list">
            {game.team.map((person, index) => {
              const load = assignmentCounts.get(index) || 0;
              const unavailable = game.absentPerson === index && game.absentUntil > game.week;
              return (
                <article className={`person-card ${load > 1 ? "overloaded" : ""} ${unavailable ? "unavailable" : ""}`} key={person.name}>
                  <div className="avatar" style={{ background: person.color }}>{person.initials}</div>
                  <div className="person-copy"><b>{person.name}</b><span>{person.role}</span></div>
                  <div className="person-meta"><b>{person.speed.toFixed(2)}×</b><span>{money(person.cost)}/нед.</span></div>
                  <div className="load-line"><i style={{ width: `${Math.min(100, load * 52)}%` }} /></div>
                  {load > 1 && <span className="burnout-badge">перегрузка ×{load}</span>}
                  {unavailable && <span className="absence-badge">нет до {Math.ceil(game.absentUntil)} нед.</span>}
                </article>
              );
            })}
          </div>
          <div className="legend-note"><span>!</span><p><b>Скорость ≠ стоимость</b>Быстрый сотрудник дороже. Один человек на двух активных задачах работает медленнее.</p></div>
        </aside>

        <section className="gantt-panel">
          <div className="panel-heading gantt-heading">
            <div><p className="section-kicker">ПЛАН ПРОЕКТА</p><h2>Диаграмма Ганта</h2></div>
            <div className="view-switch" aria-label="Масштаб диаграммы"><button className="active">Недели</button><button disabled>Месяцы</button></div>
          </div>
          <div className="gantt-legend" aria-label="Условные обозначения диаграммы">
            <span><i className="legend-planned" />План задачи</span>
            <span><i className="legend-progress" />Выполнено</span>
            <span><i className="legend-now" />Сегодня</span>
            <span><i className="legend-deadline" />Дедлайн</span>
          </div>

          <div className="gantt-scroll">
            <div className="gantt-board">
              <div className="gantt-top-row">
                <div className="task-col-title">ЗАДАЧА / ИСПОЛНИТЕЛЬ</div>
                <div className="week-grid week-labels">{Array.from({ length: DEADLINE }, (_, i) => <span className={i === DEADLINE - 1 ? "deadline-week" : ""} key={i}>{i + 1}</span>)}</div>
                <div className="cost-col-title">РАСХОДЫ</div>
              </div>

              {tasks.map((task, index) => {
                const state = game.taskState[index];
                const late = game.week > task.end && state.progress < 100;
                const variance = state.spent - game.taskBudgets[index];
                const assigned = game.assignments[index];
                const unavailable = assigned !== null && assigned === game.absentPerson && game.absentUntil > game.week;
                const waiting = game.week >= task.start && !dependenciesComplete(game.taskState, index);
                const dependencyNames = task.dependsOn.map((dependency) => tasks[dependency].short).join(" + ");
                return (
                  <div className={`gantt-row ${late ? "late-row" : ""} ${waiting ? "waiting-row" : ""}`} key={task.name}>
                    <div className="task-info">
                      <b>{task.name}</b>
                      {task.dependsOn.length > 0 && <small className="dependency-note">↳ после: {dependencyNames}</small>}
                      <label>
                        <span className="sr-only">Исполнитель задачи «{task.name}»</span>
                        <select value={game.assignments[index] ?? ""} onChange={(event) => assign(index, event.target.value)} disabled={isFinished}>
                          <option value="">Назначить…</option>
                          {game.team.map((person, personIndex) => <option key={person.name} value={personIndex}>{person.name} · {person.role}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="timeline-cell">
                      <div className="week-grid grid-lines">{Array.from({ length: DEADLINE }, (_, i) => <span key={i} />)}</div>
                      <div className="project-deadline-line"><b>ДЕДЛАЙН</b></div>
                      <div className={`task-bar ${state.progress >= 99.9 ? "complete" : ""} ${unavailable ? "blocked" : ""} ${waiting ? "waiting" : ""}`} style={{ left: `${(task.start / DEADLINE) * 100}%`, width: `${((task.end - task.start) / DEADLINE) * 100}%`, "--task-color": task.color } as CSSProperties} role="progressbar" aria-label={`Прогресс задачи «${task.name}»`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress)}>
                        <i style={{ width: `${state.progress}%` }} />
                        <span>{Math.round(state.progress)}%{unavailable ? " · пауза" : waiting ? " · ждёт" : ""}</span>
                      </div>
                      <span className="task-deadline" style={{ left: `${(task.end / DEADLINE) * 100}%` }} title={`Срок задачи: неделя ${task.end}`} />
                      {late && <span className="late-flag" style={{ left: `${(task.end / DEADLINE) * 100}%` }}>!</span>}
                      <div className="now-line" style={{ left: `${(game.week / DEADLINE) * 100}%` }}><i />{index === 0 && <b>СЕЙЧАС</b>}</div>
                    </div>
                    <div className="task-cost"><b>{money(state.spent)}</b><span className={variance > 0 ? "negative" : "positive"}>{variance > 0 ? "+" : ""}{money(variance)}</span></div>
                  </div>
                );
              })}

              <div className="deadline-row">
                <div><b>ФИНАЛЬНЫЙ ДЕДЛАЙН</b><span>Все задачи должны быть готовы</span></div>
                <div className="deadline-track"><i style={{ left: `${(game.week / DEADLINE) * 100}%` }} /><span>◆ НЕДЕЛЯ {DEADLINE}</span></div>
                <div />
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="how-to-section" id="how-to-play" aria-labelledby="how-to-heading">
        <div className="how-to-copy">
          <p className="section-kicker">КАК ИГРАТЬ · 30 СЕКУНД</p>
          <h2 id="how-to-heading">Назначай. Следи. Перестраивай.</h2>
          <p>Цветная полоса — план задачи, заливка внутри — фактический прогресс. Голубая линия показывает текущую неделю, красная справа — финальный дедлайн.</p>
          <div className="how-to-points"><span><b>1</b>Назначь людей</span><span><b>2</b>Запусти время</span><span><b>3</b>Уложись в бюджет</span></div>
          <button className="guide-button" onClick={() => setShowRules(true)}><span>?</span> Открыть инструкцию с пояснениями</button>
        </div>
        <button className="how-to-preview" onClick={() => setShowRules(true)} aria-label="Открыть подробную визуальную инструкцию">
          <Image src="/how-to-play.png" width={1672} height={941} sizes="(max-width: 1000px) 100vw, 52vw" unoptimized alt="Визуальная схема игрового поля с командой, прогрессом задач, линией текущего времени, дедлайном и случайными событиями" />
          <span>Нажми, чтобы рассмотреть схему</span>
        </button>
      </section>

      <section className="event-log" aria-label="Журнал случайных событий">
        <div><p className="section-kicker">РИСКИ ПРОЕКТА</p><h2>Случайные события</h2><span>Во время симуляции произойдёт до {MAX_EVENTS} событий. Игра сама остановится, чтобы ты успел понять последствия и изменить план.</span></div>
        <div className="event-log-list">
          {game.eventHistory.length === 0 && <p className="empty-log">Первое событие ожидается около 3-й недели.</p>}
          {game.eventHistory.slice().reverse().map((event, index) => <article className={event.tone} key={`${event.title}-${index}`}><b>{event.icon}</b><div><span>Неделя {Math.ceil(event.week)}</span><strong>{event.title}</strong><small>{event.effect}</small></div></article>)}
        </div>
      </section>

      <section className="control-deck">
        <div className="control-status">
          <span className={`status-orb ${healthTone}`}>{game.status === "running" ? "▶" : game.status === "paused" ? "Ⅱ" : "●"}</span>
          <div><p>{game.status === "ready" ? "План готов к запуску" : game.status === "paused" ? "Симуляция на паузе" : game.status === "running" ? "Проект в работе" : game.status === "won" ? "Проект успешно запущен" : "Дедлайн наступил"}</p><span>{absentName ? `${absentName} временно не работает` : overloadedPeople.length ? `Перегружены: ${overloadedPeople.map((p) => p.name).join(", ")}` : unassignedRemaining ? `Без исполнителя: ${unassignedRemaining}${unassignedActive ? `, уже активны: ${unassignedActive}` : ""}` : "Ресурсы распределены корректно"}</span></div>
        </div>
        <div className="next-event"><span>✦</span><div><b>СЛЕДУЮЩИЙ РИСК</b><small>{game.eventCount >= MAX_EVENTS ? "события завершены" : `примерно через ${Math.max(0, Math.ceil(game.nextEventWeek - game.week))} нед.`}</small></div></div>
        <div className="main-controls">
          <button className="reset-button" onClick={startFreshProject} aria-label="Начать новый случайный проект">↻</button>
          {!isFinished && <button className="start-button" onClick={toggleRun}>{game.status === "running" ? <><span>Ⅱ</span> ПАУЗА</> : <><span>▶</span> {game.status === "ready" ? "ЗАПУСТИТЬ ПРОЕКТ" : "ПРОДОЛЖИТЬ"}</>}</button>}
          {isFinished && <button className="start-button" onClick={startFreshProject}><span>↻</span> НОВЫЙ ПРОЕКТ</button>}
        </div>
      </section>

      <footer><p>СПРИНТ: ДЕДЛАЙН</p><span>Игра-тренажёр проектного мышления</span><button onClick={() => setShowRules(true)}>Подробная инструкция</button></footer>

      {game.pendingEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className={`event-modal ${game.pendingEvent.tone}`}><span className="event-spark">{game.pendingEvent.icon}</span><p>СЛУЧАЙНОЕ СОБЫТИЕ · НЕДЕЛЯ {Math.ceil(game.week)}</p><h2 id="event-title">{game.pendingEvent.title}</h2><span className="event-explanation">{game.pendingEvent.text}</span><strong>{game.pendingEvent.effect}</strong><button onClick={acknowledgeEvent}>Закрыть и изменить план →</button><small>Игра останется на паузе. При необходимости поменяй исполнителей, затем нажми «Продолжить».</small></div>
        </div>
      )}

      {showStartWarning && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="warning-title">
          <div className="result-modal start-warning">
            <span className="result-icon">!</span>
            <p>ПЕРЕД СТАРТОМ</p>
            <h2 id="warning-title">Ни одна задача не назначена</h2>
            <span className="warning-copy">Время начнёт идти, но работа не сдвинется. Назначь людей сейчас или осознанно запусти проект без команды.</span>
            <div className="warning-actions"><button className="secondary-action" onClick={() => setShowStartWarning(false)}>Вернуться к плану</button><button onClick={forceStart}>Всё равно запустить</button></div>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className={`result-modal ${game.status}`}>
            <span className="result-icon">{game.status === "won" ? "✓" : "!"}</span>
            <p>{game.status === "won" ? "МИССИЯ ВЫПОЛНЕНА" : "ПРОЕКТ НЕ СДАН"}</p>
            <h2 id="result-title">{game.status === "won" ? "Релиз состоялся!" : game.failureReason === "budget" ? "Проект вышел за бюджет" : game.failureReason === "both" ? "Срок и бюджет нарушены" : "Дедлайн оказался быстрее"}</h2>
            <div className="result-stats"><span><b>{completedCount}/{tasks.length}</b>задач</span><span><b>{money(game.budget - game.spent)}</b>остаток</span><span><b>{game.eventCount}</b>событий</span></div>
            <button onClick={startFreshProject}>Сыграть ещё раз →</button>
          </div>
        </div>
      )}

      {showRules && (
        <div className="modal-backdrop rules-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-title" onMouseDown={(event) => event.currentTarget === event.target && setShowRules(false)}>
          <div className="rules-modal">
            <button className="close-button" onClick={() => setShowRules(false)} aria-label="Закрыть инструкцию">×</button>
            <p className="section-kicker">ПОДРОБНАЯ ИНСТРУКЦИЯ</p>
            <h2 id="rules-title">Как довести проект<br />до успешного релиза</h2>
            <div className="guide-visual">
              <Image src="/how-to-play.png" width={1672} height={941} sizes="(max-width: 680px) 100vw, 900px" unoptimized alt="Схема игры: команда назначается на задачи, полосы заполняются по мере выполнения, голубая линия показывает текущее время, красная — финальный дедлайн, а карточки снизу обозначают случайные события" />
              <span className="callout callout-team"><b>1</b>Команда</span>
              <span className="callout callout-progress"><b>2</b>Прогресс задач</span>
              <span className="callout callout-deadline"><b>3</b>Дедлайн</span>
              <span className="callout callout-events"><b>4</b>События</span>
            </div>
            <div className="plain-goal"><b>Цель простыми словами</b><p>Назначь людей → запусти время → следи, чтобы прогресс задач рос быстрее голубой линии «Сейчас» → переназначай и ставь паузу → закончи всё до красного дедлайна и не выйди за бюджет.</p></div>
            <div className="pda-explainer"><span>ДА</span><div><b>Это инициалы: Дарья</b><p>Сокращения «ПДА» в оригинальных правилах нет. На карточке сотрудника написано «ДА» — первые буквы имени Дарья. Рядом всегда показаны полные имя и роль; аналогично «ЛВ» означает Лев, «СА» — Саша.</p></div></div>
            <div className="dependency-demo"><span><b>А</b> Требования <i>100%</i></span><strong>→ сначала завершить →</strong><span><b>Б</b> Прототип <i>ждёт</i></span><p>Некоторые этапы зависят от предыдущих. Задача Б не начнётся, пока задача А не готова на 100%, даже если исполнитель уже выбран.</p></div>
            <ol>
              <li><span>01</span><div><b>Сначала назначь людей</b><p>В каждой строке задачи открой список и выбери сотрудника. Смотри на скорость и цену: быстрый специалист справится раньше, но стоит дороже.</p></div></li>
              <li><span>02</span><div><b>Запусти и следи за линиями</b><p>Голубая линия «Сейчас» показывает ход времени. Красная линия справа — неизменный финальный дедлайн. Цвет внутри полосы показывает реально выполненную часть.</p></div></li>
              <li><span>03</span><div><b>Учитывай зависимости и перегрузку</b><p>Подпись «после» показывает, какие этапы нужно закончить раньше. Если один человек ведёт две уже активные задачи, обе движутся намного медленнее.</p></div></li>
              <li><span>04</span><div><b>Реагируй на случайности</b><p>Несколько раз игра остановится из-за события: согласование, переделка, дополнительные расходы или отсутствие сотрудника. Прочитай эффект и при необходимости перераспредели людей.</p></div></li>
              <li><span>05</span><div><b>Победи по двум условиям</b><p>Заверши все задачи до 18-й недели и не превысь бюджет. Каждый новый проект заново выбирает команду, трудоёмкость задач и их плановую стоимость, поэтому готовой схемы на все раунды нет.</p></div></li>
            </ol>
            <div className="guide-legend"><span><i className="legend-progress" />цветная заливка — сделано</span><span><i className="legend-now" />голубая линия — сейчас</span><span><i className="legend-deadline" />красная линия — дедлайн</span></div>
            <button className="start-button rules-start" onClick={() => setShowRules(false)}>Понятно, начинаем →</button>
          </div>
        </div>
      )}
    </main>
  );
}

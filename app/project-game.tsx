"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { DEADLINE, dependenciesComplete, generateScenario, isTaskActive, isTaskComplete } from "./game-scenario";
import type { Person, ProjectTask } from "./game-scenario";

type GameStatus = "ready" | "running" | "paused" | "won" | "lost";
type EventTone = "good" | "bad" | "mixed";
type FailureReason = "deadline" | "budget" | "both" | null;

type TaskState = {
  progress: number;
  spent: number;
  startedAt: number | null;
  completedAt: number | null;
  blockedWeeks: number;
  overloadWeeks: number;
  unassignedWeeks: number;
  eventProgress: number;
  eventCost: number;
};

type EventEffect =
  | { kind: "spent"; amount: number; taskIndex: number }
  | { kind: "budget"; amount: number }
  | { kind: "progress"; amount: number; taskIndex: number }
  | { kind: "time"; weeks: number }
  | { kind: "speed"; amount: number; personIndex: number }
  | { kind: "absence"; personIndex: number; weeks: number };

type EventChoice = {
  id: string;
  title: string;
  description: string;
  outcome: string;
  tag: string;
  tone: EventTone;
  effects: EventEffect[];
};

type EventDefinition = {
  id: string;
  title: string;
  text: string;
  icon: string;
  tone: EventTone;
  choices: EventChoice[];
};

type EventHistoryItem = {
  week: number;
  eventId: string;
  title: string;
  icon: string;
  choiceId: string;
  choiceTitle: string;
  outcome: string;
  tone: EventTone;
  effects: EventEffect[];
};

type GameState = {
  status: GameStatus;
  seed: number;
  week: number;
  budget: number;
  spent: number;
  team: Person[];
  tasks: ProjectTask[];
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
  overloadByPerson: number[];
  assignmentChanges: number;
};

const TICK = 0.25;
const MAX_EVENTS = 4;
function freshGame(seed = 0, previous?: GameState): GameState {
  const scenario = generateScenario(seed || 4, previous);
  return {
    status: "ready",
    seed,
    week: 0,
    budget: scenario.budget,
    spent: 0,
    team: scenario.team,
    tasks: scenario.tasks,
    assignments: scenario.tasks.map(() => null),
    taskState: scenario.tasks.map(() => ({
      progress: 0,
      spent: 0,
      startedAt: null,
      completedAt: null,
      blockedWeeks: 0,
      overloadWeeks: 0,
      unassignedWeeks: 0,
      eventProgress: 0,
      eventCost: 0,
    })),
    nextEventWeek: 3,
    eventCount: 0,
    boostUntil: 0,
    absentPerson: null,
    absentUntil: 0,
    timeScale: 1,
    failureReason: null,
    pendingEvent: null,
    eventHistory: [],
    overloadByPerson: scenario.team.map(() => 0),
    assignmentChanges: 0,
  };
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} тыс. ₽`;
}

function scoreFor(game: GameState) {
  const completed = game.taskState.filter((task) => isTaskComplete(task.progress)).length;
  return Math.max(0, Math.round(completed * 1_000 + Math.max(0, game.budget - game.spent)));
}

function deterministicRandom(seed: number, salt: number) {
  let value = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_296;
}

function chooseEvent(current: GameState): EventDefinition {
  const incomplete = current.tasks.map((_, index) => index).filter((index) => !isTaskComplete(current.taskState[index].progress));
  const active = incomplete.filter((index) => isTaskActive(current.tasks, current.taskState, index, current.week));
  const taskPool = active.length ? active : incomplete;
  const targetTask = taskPool[Math.floor(deterministicRandom(current.seed, 100 + current.eventCount) * taskPool.length)];
  const task = current.tasks[targetTask];
  const assignedPerson = current.assignments[targetTask];
  const targetPerson = assignedPerson ?? Math.floor(deterministicRandom(current.seed, 200 + current.eventCount) * current.team.length);
  const person = current.team[targetPerson];
  const family = ((current.seed % 6) + current.eventCount * 5) % 6;
  const eventId = `event-${family}-${current.eventCount}`;

  const events: EventDefinition[] = [
    {
      id: eventId,
      title: `Заказчик уточнил требования к «${task.short}»`,
      text: "Объём работ изменился уже после старта. Выбери, чем пожертвовать: готовностью, деньгами или запасом бюджета.",
      icon: "↺",
      tone: "mixed",
      choices: [
        { id: "rework", title: "Переделать своими силами", description: "Команда разбирает изменения без внешних расходов.", outcome: `«${task.short}»: −14% прогресса`, tag: "БЕЗ РАСХОДОВ", tone: "bad", effects: [{ kind: "progress", amount: -14, taskIndex: targetTask }] },
        { id: "expert", title: "Позвать эксперта", description: "Эксперт сохранит почти весь результат, но увеличит расходы.", outcome: `+${money(300)} расходов · «${task.short}»: −3%`, tag: "+300 ТЫС. ₽", tone: "mixed", effects: [{ kind: "spent", amount: 300, taskIndex: targetTask }, { kind: "progress", amount: -3, taskIndex: targetTask }] },
        { id: "scope", title: "Сократить объём релиза", description: "Задача станет ближе к завершению, но спонсор урежет лимит.", outcome: `«${task.short}»: +12% · бюджет −${money(480)}`, tag: "МЕНЬШЕ ОБЪЁМ", tone: "mixed", effects: [{ kind: "progress", amount: 12, taskIndex: targetTask }, { kind: "budget", amount: -480 }] },
      ],
    },
    {
      id: eventId,
      title: `${person.name} временно недоступен`,
      text: `Исполнитель задачи «${task.short}» выпадает из работы. Можно ждать, платить за помощь или принять переделку при передаче.`,
      icon: "!",
      tone: "mixed",
      choices: [
        { id: "wait", title: "Дождаться возвращения", description: "Сотрудник вернётся сам, но пока его задачи не движутся.", outcome: `${person.name} не работает 1,25 недели`, tag: "ПОТЕРЯ ВРЕМЕНИ", tone: "bad", effects: [{ kind: "absence", personIndex: targetPerson, weeks: 1.25 }] },
        { id: "contractor", title: "Подключить подрядчика", description: "Работа продолжится сразу и получит небольшой рывок.", outcome: `+${money(400)} расходов · «${task.short}»: +8%`, tag: "+400 ТЫС. ₽", tone: "mixed", effects: [{ kind: "spent", amount: 400, taskIndex: targetTask }, { kind: "progress", amount: 8, taskIndex: targetTask }] },
        { id: "handoff", title: "Передать задачу команде", description: "Новый исполнитель сможет работать, но погружение съест часть результата.", outcome: `«${task.short}»: −8% прогресса`, tag: "НУЖНА ЗАМЕНА", tone: "mixed", effects: [{ kind: "progress", amount: -8, taskIndex: targetTask }] },
      ],
    },
    {
      id: eventId,
      title: `Обнаружен дефект в задаче «${task.short}»`,
      text: "Проблему можно исправить глубоко, вынести наружу или временно обойти. Каждое решение оставит свой след.",
      icon: "◇",
      tone: "mixed",
      choices: [
        { id: "proper-fix", title: "Исправить основательно", description: "Часть работы придётся повторить, зато специалист усилит экспертизу.", outcome: `«${task.short}»: −12% · ${person.name}: +0,08×`, tag: "КАЧЕСТВО", tone: "mixed", effects: [{ kind: "progress", amount: -12, taskIndex: targetTask }, { kind: "speed", amount: 0.08, personIndex: targetPerson }] },
        { id: "audit", title: "Заказать технический аудит", description: "Внешняя проверка локализует проблему с небольшой переделкой.", outcome: `+${money(300)} расходов · «${task.short}»: −3%`, tag: "+300 ТЫС. ₽", tone: "mixed", effects: [{ kind: "spent", amount: 300, taskIndex: targetTask }, { kind: "progress", amount: -3, taskIndex: targetTask }] },
        { id: "workaround", title: "Сделать временный обход", description: "Прогресс появится сейчас, но дальнейшая работа замедлится.", outcome: `«${task.short}»: +8% · ${person.name}: −0,15×`, tag: "БЫСТРО СЕЙЧАС", tone: "mixed", effects: [{ kind: "progress", amount: 8, taskIndex: targetTask }, { kind: "speed", amount: -0.15, personIndex: targetPerson }] },
      ],
    },
    {
      id: eventId,
      title: "Заказчик потребовал срочную демонстрацию",
      text: `Нужно показать результат по этапу «${task.short}». Выбери между календарём, деньгами и сокращённым показом.`,
      icon: "▶",
      tone: "mixed",
      choices: [
        { id: "manual-demo", title: "Подготовить вручную", description: "Команда отвлечётся на демонстрацию без дополнительных расходов.", outcome: "календарь проекта +0,75 недели", tag: "+0,75 НЕД.", tone: "bad", effects: [{ kind: "time", weeks: 0.75 }] },
        { id: "night-sprint", title: "Оплатить ночной спринт", description: "Демо будет готово, но специалист немного потеряет темп.", outcome: `+${money(260)} · «${task.short}»: +8% · ${person.name}: −0,07×`, tag: "+260 ТЫС. ₽", tone: "mixed", effects: [{ kind: "spent", amount: 260, taskIndex: targetTask }, { kind: "progress", amount: 8, taskIndex: targetTask }, { kind: "speed", amount: -0.07, personIndex: targetPerson }] },
        { id: "small-demo", title: "Показать сокращённую версию", description: "Готовность вырастет, но заказчик уменьшит доступный бюджет.", outcome: `«${task.short}»: +14% · бюджет −${money(380)}`, tag: "МЕНЬШЕ БЮДЖЕТ", tone: "mixed", effects: [{ kind: "progress", amount: 14, taskIndex: targetTask }, { kind: "budget", amount: -380 }] },
      ],
    },
    {
      id: eventId,
      title: `Внешний сервис для «${task.short}» недоступен`,
      text: "Можно дождаться восстановления, перейти на платный резерв или построить временный обход внутри команды.",
      icon: "×",
      tone: "mixed",
      choices: [
        { id: "service-wait", title: "Ждать восстановления", description: "Денег не потребуется, но календарь продолжит идти.", outcome: "календарь проекта +0,9 недели", tag: "+0,9 НЕД.", tone: "bad", effects: [{ kind: "time", weeks: 0.9 }] },
        { id: "reserve-service", title: "Перейти на резервный сервис", description: "Платная замена позволит сразу продолжить работу.", outcome: `+${money(320)} расходов · «${task.short}»: +4%`, tag: "+320 ТЫС. ₽", tone: "mixed", effects: [{ kind: "spent", amount: 320, taskIndex: targetTask }, { kind: "progress", amount: 4, taskIndex: targetTask }] },
        { id: "internal-workaround", title: "Собрать обход внутри команды", description: "Без денег и паузы, но часть работы придётся повторить.", outcome: `«${task.short}»: −9% · ${person.name}: −0,05×`, tag: "БЕЗ РАСХОДОВ", tone: "mixed", effects: [{ kind: "progress", amount: -9, taskIndex: targetTask }, { kind: "speed", amount: -0.05, personIndex: targetPerson }] },
      ],
    },
    {
      id: eventId,
      title: `Появился инструмент автоматизации для «${task.short}»`,
      text: "Инструмент обещает ускорение, но его можно купить, сначала изучить или испытать прямо на текущей задаче.",
      icon: "✦",
      tone: "mixed",
      choices: [
        { id: "license", title: "Купить лицензию", description: "Предсказуемый прирост без изменения навыков команды.", outcome: `+${money(300)} расходов · «${task.short}»: +15%`, tag: "+300 ТЫС. ₽", tone: "mixed", effects: [{ kind: "spent", amount: 300, taskIndex: targetTask }, { kind: "progress", amount: 15, taskIndex: targetTask }] },
        { id: "learn", title: "Сначала обучить специалиста", description: "Освоение отнимет время, но скорость сохранится до конца проекта.", outcome: `календарь +0,75 недели · ${person.name}: +0,18×`, tag: "ИНВЕСТИЦИЯ", tone: "mixed", effects: [{ kind: "time", weeks: 0.75 }, { kind: "speed", amount: 0.18, personIndex: targetPerson }] },
        { id: "experiment", title: "Испытать прямо в проекте", description: "Получим быстрый результат, но процесс станет чуть менее стабильным.", outcome: `«${task.short}»: +7% · ${person.name}: −0,05×`, tag: "ЭКСПЕРИМЕНТ", tone: "mixed", effects: [{ kind: "progress", amount: 7, taskIndex: targetTask }, { kind: "speed", amount: -0.05, personIndex: targetPerson }] },
      ],
    },
  ];

  return events[family];
}

function resolveEventChoice(current: GameState, choice: EventChoice): GameState {
  let budget = current.budget;
  let spent = current.spent;
  let absentPerson = current.absentPerson;
  let absentUntil = current.absentUntil;
  let week = current.week;
  let taskState = current.taskState;
  let team = current.team;

  choice.effects.forEach((effect) => {
    if (effect.kind === "budget") budget = Math.max(0, budget + effect.amount);
    if (effect.kind === "time") week = Math.min(DEADLINE, week + effect.weeks);
    if (effect.kind === "absence") {
      absentPerson = effect.personIndex;
      absentUntil = Math.max(absentUntil, week + effect.weeks);
    }
    if (effect.kind === "speed") {
      team = team.map((person, index) => index === effect.personIndex ? { ...person, speed: Math.min(1.75, Math.max(0.55, person.speed + effect.amount)) } : person);
    }
    if (effect.kind === "spent") {
      spent += effect.amount;
      taskState = taskState.map((state, index) => index === effect.taskIndex ? { ...state, spent: state.spent + effect.amount, eventCost: state.eventCost + effect.amount } : state);
    }
    if (effect.kind === "progress") {
      taskState = taskState.map((state, index) => {
        if (index !== effect.taskIndex) return state;
        const progress = Math.min(100, Math.max(0, state.progress + effect.amount));
        return {
          ...state,
          progress,
          startedAt: state.startedAt ?? (progress > 0 ? week : null),
          completedAt: state.completedAt ?? (isTaskComplete(progress) ? week : null),
          eventProgress: state.eventProgress + effect.amount,
        };
      });
    }
  });

  const pendingEvent = current.pendingEvent;
  if (!pendingEvent) return current;
  const eventHistory = [...current.eventHistory, {
    week: current.week,
    eventId: pendingEvent.id,
    title: pendingEvent.title,
    icon: pendingEvent.icon,
    choiceId: choice.id,
    choiceTitle: choice.title,
    outcome: choice.outcome,
    tone: choice.tone,
    effects: choice.effects,
  }];
  const complete = taskState.every((task) => isTaskComplete(task.progress));
  const status: GameStatus = complete ? (spent <= budget ? "won" : "lost") : week >= DEADLINE ? "lost" : "paused";
  const failureReason: FailureReason = status !== "lost" ? null : complete ? "budget" : spent > budget ? "both" : "deadline";

  return {
    ...current,
    status,
    failureReason,
    week,
    budget,
    spent,
    absentPerson,
    absentUntil,
    team,
    taskState,
    pendingEvent: null,
    eventHistory,
  };
}

export default function ProjectGame() {
  const [game, setGame] = useState<GameState>(freshGame);
  const [showRules, setShowRules] = useState(false);
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [record, setRecord] = useState(0);
  const seedSequence = useRef(1);

  function nextSeed() {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    seedSequence.current = ((values[0] || 1) ^ (seedSequence.current * 2_654_435_761)) >>> 0;
    return seedSequence.current || 1;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setRecord(Number(window.localStorage.getItem("sprint-deadline-record") || 0));
      } catch {
        setRecord(0);
      }
      setGame((current) => current.seed === 0 ? freshGame(nextSeed(), current) : current);
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
        const elapsedWeeks = nextWeek - current.week;
        let nextSpent = current.spent;
        const activeAssignments = new Map<number, number>();

        current.tasks.forEach((_, index) => {
          if (isTaskActive(current.tasks, current.taskState, index, current.week)) {
            const person = current.assignments[index];
            if (person !== null) activeAssignments.set(person, (activeAssignments.get(person) || 0) + 1);
          }
        });

        const nextOverloadByPerson = current.overloadByPerson.map((weeks, index) => (
          weeks + ((activeAssignments.get(index) || 0) > 1 ? elapsedWeeks : 0)
        ));

        const nextTasks = current.taskState.map((state, index) => {
          const task = current.tasks[index];
          const personIndex = current.assignments[index];
          const active = isTaskActive(current.tasks, current.taskState, index, current.week);
          const blocked = current.week >= task.start
            && !dependenciesComplete(current.tasks, current.taskState, index)
            && !isTaskComplete(state.progress);
          const telemetry = {
            blockedWeeks: state.blockedWeeks + (blocked ? elapsedWeeks : 0),
            unassignedWeeks: state.unassignedWeeks + (active && personIndex === null ? elapsedWeeks : 0),
            overloadWeeks: state.overloadWeeks + (active && personIndex !== null && (activeAssignments.get(personIndex) || 0) > 1 ? elapsedWeeks : 0),
          };
          if (!active || personIndex === null) return { ...state, ...telemetry };
          const person = current.team[personIndex];
          const overloaded = (activeAssignments.get(personIndex) || 0) > 1;
          const absent = current.absentPerson === personIndex && current.absentUntil > current.week;
          const boost = current.boostUntil > current.week ? 1.28 : 1;
          const tickIndex = Math.round(current.week / TICK);
          const stochasticStep = deterministicRandom(current.seed, 10_000 + tickIndex * 31 + index) < 0.34 ? 0.72 : 1.14;
          const progressGain = absent ? 0 : (100 / task.effort) * person.speed * (overloaded ? 0.32 : 1) * boost * stochasticStep * TICK;
          const costGain = absent ? 0 : person.cost * (progressGain / 100) * task.effort / person.speed;
          const progress = Math.min(100, state.progress + progressGain);
          nextSpent += costGain;
          return {
            ...state,
            ...telemetry,
            progress,
            spent: state.spent + costGain,
            startedAt: state.startedAt ?? (progressGain > 0 ? current.week : null),
            completedAt: state.completedAt ?? (isTaskComplete(progress) ? nextWeek : null),
          };
        });

        const complete = nextTasks.every((task) => isTaskComplete(task.progress));
        if (complete) {
          const won = nextSpent <= current.budget;
          return { ...current, status: won ? "won" : "lost", failureReason: won ? null : "budget", week: nextWeek, spent: nextSpent, taskState: nextTasks, overloadByPerson: nextOverloadByPerson };
        }

        const eventDue = current.eventCount < MAX_EVENTS && nextWeek >= current.nextEventWeek;
        if (eventDue) {
          const event = chooseEvent({ ...current, week: nextWeek, spent: nextSpent, taskState: nextTasks });
          return {
            ...current,
            status: "paused",
            week: nextWeek,
            spent: nextSpent,
            taskState: nextTasks,
            eventCount: current.eventCount + 1,
            nextEventWeek: nextWeek + 3.5 + deterministicRandom(current.seed, 20_000 + current.eventCount) * 1.5,
            pendingEvent: event,
            overloadByPerson: nextOverloadByPerson,
          };
        }

        if (nextWeek >= DEADLINE) {
          const overBudget = nextSpent > current.budget;
          return { ...current, status: "lost", failureReason: overBudget ? "both" : "deadline", week: DEADLINE, spent: nextSpent, taskState: nextTasks, overloadByPerson: nextOverloadByPerson };
        }

        return { ...current, week: nextWeek, spent: nextSpent, taskState: nextTasks, overloadByPerson: nextOverloadByPerson };
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [game.status]);

  const activeTasks = useMemo(
    () => game.tasks.map((task, index) => ({ task, index })).filter(({ index }) => isTaskActive(game.tasks, game.taskState, index, game.week)),
    [game.week, game.tasks, game.taskState],
  );

  const activeAssignmentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    activeTasks.forEach(({ index }) => {
      const person = game.assignments[index];
      if (person !== null) counts.set(person, (counts.get(person) || 0) + 1);
    });
    return counts;
  }, [activeTasks, game.assignments]);

  const plannedAssignmentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    game.assignments.forEach((person, index) => {
      if (person !== null && !isTaskComplete(game.taskState[index].progress)) {
        counts.set(person, (counts.get(person) || 0) + 1);
      }
    });
    return counts;
  }, [game.assignments, game.taskState]);

  const remainingCost = game.tasks.reduce((sum, task, index) => {
    const remaining = Math.max(0, 1 - game.taskState[index].progress / 100);
    const assigned = game.assignments[index];
    const person = assigned === null
      ? [...game.team].sort((a, b) => (a.cost / a.speed) - (b.cost / b.speed))[0]
      : game.team[assigned];
    return sum + remaining * task.effort * (person.cost / person.speed);
  }, 0);
  const forecast = game.spent + remainingCost;
  const completedCount = game.taskState.filter((task) => isTaskComplete(task.progress)).length;
  const unassignedActive = activeTasks.filter(({ index }) => game.assignments[index] === null).length;
  const unassignedTasks = game.assignments.filter((person) => person === null).length;
  const overloadedPeople = [...activeAssignmentCounts.entries()].filter(([, count]) => count > 1).map(([index]) => game.team[index]);
  const absentName = game.absentPerson !== null && game.absentUntil > game.week ? game.team[game.absentPerson].name : null;
  const health = absentName ? `${absentName} недоступен` : overloadedPeople.length ? "Перегрузка" : unassignedTasks ? `Не назначено: ${unassignedTasks}` : forecast > game.budget ? "Риск бюджета" : "Всё по плану";
  const healthTone = absentName || overloadedPeople.length || forecast > game.budget ? "danger" : unassignedTasks ? "warning" : "good";
  const overallProgress = game.taskState.reduce((sum, task) => sum + task.progress, 0) / game.tasks.length;
  const isFinished = game.status === "won" || game.status === "lost";
  const allTasksAssigned = unassignedTasks === 0;
  const debrief = useMemo(() => {
    const unfinished = game.taskState
      .map((state, index) => ({ state, index }))
      .filter(({ state }) => !isTaskComplete(state.progress));
    const bottleneck = unfinished.length > 0
      ? unfinished.sort((a, b) => (100 - b.state.progress) - (100 - a.state.progress) || b.state.blockedWeeks - a.state.blockedWeeks)[0]
      : game.taskState
          .map((state, index) => ({ state, index, delay: Math.max(0, (state.completedAt ?? game.week) - game.tasks[index].end) }))
          .sort((a, b) => b.delay - a.delay || b.state.overloadWeeks - a.state.overloadWeeks)[0];
    const bottleneckTask = game.tasks[bottleneck.index];
    const bottleneckState = game.taskState[bottleneck.index];
    const budgetRows = game.tasks.map((task, index) => ({ task, state: game.taskState[index], variance: game.taskState[index].spent - task.budget }));
    const worstBudget = [...budgetRows].sort((a, b) => b.variance - a.variance)[0];
    const overloadedPersonIndex = game.overloadByPerson.reduce((best, weeks, index, all) => weeks > all[best] ? index : best, 0);
    const overloadWeeks = game.overloadByPerson[overloadedPersonIndex] || 0;
    const totalBlockedWeeks = game.taskState.reduce((sum, state) => sum + state.blockedWeeks, 0);
    const totalUnassignedWeeks = game.taskState.reduce((sum, state) => sum + state.unassignedWeeks, 0);
    const delay = Math.max(0, (bottleneckState.completedAt ?? game.week) - bottleneckTask.end);
    const bottleneckReason = !isTaskComplete(bottleneckState.progress)
      ? bottleneckState.blockedWeeks > 0.25
        ? `Задача ждала зависимость ${bottleneckState.blockedWeeks.toFixed(1)} нед.`
        : bottleneckState.overloadWeeks > 0.25
          ? `Исполнитель был перегружен ${bottleneckState.overloadWeeks.toFixed(1)} нед.`
          : `К финалу осталось ${Math.round(100 - bottleneckState.progress)}% работы.`
      : delay > 0.1
        ? `Завершена на ${delay.toFixed(1)} нед. позже собственного плана.`
        : "Самый маленький резерв среди завершённых задач.";
    let recommendation = "Переиграй тот же сценарий и попробуй закончить с большим запасом по сроку и бюджету.";
    if (overloadWeeks > 0.25) {
      recommendation = `Разнеси параллельные задачи: ${game.team[overloadedPersonIndex].name} работал одновременно на нескольких этапах ${overloadWeeks.toFixed(1)} нед.`;
    } else if (totalUnassignedWeeks > 0.25) {
      recommendation = `Не оставляй начавшиеся задачи без исполнителя: так потеряно ${totalUnassignedWeeks.toFixed(1)} нед. работы.`;
    } else if (totalBlockedWeeks > 0.25 && bottleneckTask.dependsOn.length > 0) {
      const parent = game.tasks[bottleneckTask.dependsOn[0]];
      recommendation = `Ускорь этап «${parent.short}»: от него зависит «${bottleneckTask.short}», а ожидание съело резерв графика.`;
    } else if (game.spent > game.budget) {
      recommendation = `На некритических задачах выбирай более выгодное соотношение цены и скорости. Главный перерасход — «${worstBudget.task.short}».`;
    } else if (game.eventHistory.some((event) => event.effects.some((effect) => effect.kind === "spent"))) {
      recommendation = "Сравни варианты событий: дорогая реакция ускоряет работу, но может лишить проект последнего бюджетного резерва.";
    }

    return {
      bottleneckTask,
      bottleneckReason,
      worstBudget,
      overloadWeeks,
      overloadedPerson: game.team[overloadedPersonIndex],
      totalBlockedWeeks,
      totalUnassignedWeeks,
      lateTasks: game.tasks.filter((task, index) => !isTaskComplete(game.taskState[index].progress) || (game.taskState[index].completedAt ?? DEADLINE) > task.end + 0.01).length,
      recommendation,
    };
  }, [game]);

  function assign(taskIndex: number, value: string) {
    setGame((current) => {
      const assignments = [...current.assignments];
      const nextAssignment = value === "" ? null : Number(value);
      const changedDuringRun = current.status !== "ready" && assignments[taskIndex] !== nextAssignment;
      assignments[taskIndex] = nextAssignment;
      return { ...current, assignments, assignmentChanges: current.assignmentChanges + (changedDuringRun ? 1 : 0) };
    });
  }

  function toggleRun() {
    const starting = game.status === "ready" || game.status === "paused";
    if (starting && !allTasksAssigned) {
      setShowStartWarning(true);
      return;
    }
    setGame((current) => {
      if (current.pendingEvent) return current;
      if (current.status === "ready" || current.status === "paused") return { ...current, status: "running" };
      if (current.status === "running") return { ...current, status: "paused" };
      return current;
    });
  }

  function startFreshProject() {
    setShowStartWarning(false);
    setGame((current) => freshGame(nextSeed(), current));
  }

  function replayScenario() {
    setShowStartWarning(false);
    setGame((current) => freshGame(current.seed));
  }

  function chooseEventOption(choiceId: string) {
    setGame((current) => {
      const choice = current.pendingEvent?.choices.find((option) => option.id === choiceId);
      return choice ? resolveEventChoice(current, choice) : current;
    });
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
          <small>{completedCount} из {game.tasks.length} задач полностью готовы</small>
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
              const plannedLoad = plannedAssignmentCounts.get(index) || 0;
              const activeLoad = activeAssignmentCounts.get(index) || 0;
              const unavailable = game.absentPerson === index && game.absentUntil > game.week;
              return (
                <article className={`person-card ${activeLoad > 1 ? "overloaded" : ""} ${unavailable ? "unavailable" : ""}`} key={person.name}>
                  <div className="avatar" style={{ background: person.color }}>{person.initials}</div>
                  <div className="person-copy"><b>{person.name}</b></div>
                  <div className="person-meta"><b>{person.speed.toFixed(2)}×</b><span>{money(person.cost)}/нед.</span></div>
                  <div className="load-line" role="meter" aria-label={`${person.name}: назначено задач — ${plannedLoad}`} aria-valuemin={0} aria-valuemax={game.tasks.length} aria-valuenow={plannedLoad}><i style={{ width: `${Math.min(100, plannedLoad * 34)}%` }} /></div>
                  {activeLoad > 1 && <span className="burnout-badge">перегрузка ×{activeLoad}</span>}
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

              {game.tasks.map((task, index) => {
                const state = game.taskState[index];
                const late = game.week > task.end && !isTaskComplete(state.progress);
                const variance = state.spent - task.budget;
                const assigned = game.assignments[index];
                const unavailable = assigned !== null && assigned === game.absentPerson && game.absentUntil > game.week;
                const waiting = game.week >= task.start && !dependenciesComplete(game.tasks, game.taskState, index);
                const dependencyNames = task.dependsOn.map((dependency) => game.tasks[dependency].short).join(" + ");
                const parentIndex = task.dependsOn[0];
                return (
                  <div className={`gantt-row ${late ? "late-row" : ""} ${waiting ? "waiting-row" : ""}`} key={task.id}>
                    <div className="task-info">
                      <b>{task.name}</b>
                      {task.dependsOn.length > 0 && <small className="dependency-note">↳ после: {dependencyNames}</small>}
                      <label>
                        <span className="sr-only">Исполнитель задачи «{task.name}»</span>
                        <select value={game.assignments[index] ?? ""} onChange={(event) => assign(index, event.target.value)} disabled={isFinished}>
                          <option value="">Назначить…</option>
                          {game.team.map((person, personIndex) => <option key={person.name} value={personIndex}>{person.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="timeline-cell">
                      <div className="week-grid grid-lines">{Array.from({ length: DEADLINE }, (_, i) => <span key={i} />)}</div>
                      <div className="project-deadline-line"><b>ДЕДЛАЙН</b></div>
                      {parentIndex !== undefined && <span className="dependency-link" aria-hidden="true" style={{ left: `${(task.start / DEADLINE) * 100}%`, top: `${-((index - parentIndex) * 90) + 65}px`, height: `${(index - parentIndex) * 90 - 40}px` }} />}
                      <div className={`task-bar ${isTaskComplete(state.progress) ? "complete" : ""} ${unavailable ? "blocked" : ""} ${waiting ? "waiting" : ""}`} style={{ left: `${(task.start / DEADLINE) * 100}%`, width: `${((task.end - task.start) / DEADLINE) * 100}%`, "--task-color": task.color } as CSSProperties} role="progressbar" aria-label={`Прогресс задачи «${task.name}»`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.progress)}>
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

      <section className="control-deck">
        <div className="control-status">
          <span className={`status-orb ${healthTone}`}>{game.status === "running" ? "▶" : game.status === "paused" ? "Ⅱ" : "●"}</span>
          <div><p>{game.status === "ready" ? (allTasksAssigned ? "План готов к запуску" : "Назначьте всех исполнителей") : game.status === "paused" ? "Симуляция на паузе" : game.status === "running" ? "Проект в работе" : game.status === "won" ? "Проект успешно запущен" : "Дедлайн наступил"}</p><span>{absentName ? `${absentName} временно не работает` : overloadedPeople.length ? `Перегружены: ${overloadedPeople.map((p) => p.name).join(", ")}` : unassignedTasks ? `Без исполнителя: ${unassignedTasks}${unassignedActive ? `, уже активны: ${unassignedActive}` : ""}` : "Ресурсы распределены корректно"}</span></div>
        </div>
        <div className="next-event"><span>✦</span><div><b>СЛЕДУЮЩИЙ РИСК</b><small>{game.eventCount >= MAX_EVENTS ? "события завершены" : `примерно через ${Math.max(0, Math.ceil(game.nextEventWeek - game.week))} нед.`}</small></div></div>
        <div className="main-controls">
          <button className="reset-button" onClick={startFreshProject} aria-label="Начать новый случайный проект">↻</button>
          {!isFinished && <button className="start-button" onClick={toggleRun}>{game.status === "running" ? <><span>Ⅱ</span> ПАУЗА</> : <><span>▶</span> {game.status === "ready" ? "ЗАПУСТИТЬ ПРОЕКТ" : "ПРОДОЛЖИТЬ"}</>}</button>}
          {isFinished && <button className="start-button" onClick={startFreshProject}><span>↻</span> НОВЫЙ ПРОЕКТ</button>}
        </div>
      </section>

      <section className="event-log" aria-label="Журнал случайных событий">
        <div><p className="section-kicker">РИСКИ ПРОЕКТА</p><h2>Случайные события</h2><span>Во время симуляции произойдёт до {MAX_EVENTS} событий. Игра остановится и предложит несколько решений — выбери подходящий компромисс.</span></div>
        <div className="event-log-list">
          {game.eventHistory.length === 0 && <p className="empty-log">Первое событие ожидается около 3-й недели.</p>}
          {game.eventHistory.slice().reverse().map((event, index) => <article className={event.tone} key={`${event.eventId}-${index}`}><b>{event.icon}</b><div><span>Неделя {Math.ceil(event.week)} · {event.choiceTitle}</span><strong>{event.title}</strong><small>{event.outcome}</small></div></article>)}
        </div>
      </section>

      <footer><p>СПРИНТ: ДЕДЛАЙН</p><span>Игра-тренажёр проектного мышления</span><button onClick={() => setShowRules(true)}>Подробная инструкция</button></footer>

      {game.pendingEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="event-title">
          <div className={`event-modal ${game.pendingEvent.tone}`}>
            <span className="event-spark">{game.pendingEvent.icon}</span>
            <p>СЛУЧАЙНОЕ СОБЫТИЕ · НЕДЕЛЯ {Math.ceil(game.week)}</p>
            <h2 id="event-title">{game.pendingEvent.title}</h2>
            <span className="event-explanation">{game.pendingEvent.text}</span>
            <div className="event-choice-list">
              {game.pendingEvent.choices.map((choice) => (
                <button className="event-choice" onClick={() => chooseEventOption(choice.id)} key={choice.id}>
                  <span className="event-choice-copy"><b>{choice.title}</b><small>{choice.description}</small><span>{choice.outcome}</span></span>
                  <span className="event-choice-tag">{choice.tag}</span>
                </button>
              ))}
            </div>
            <small>Выбор применится сразу, а игра останется на паузе. После этого можно изменить назначения и продолжить.</small>
          </div>
        </div>
      )}

      {showStartWarning && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="warning-title">
          <div className="result-modal start-warning">
            <span className="result-icon">!</span>
            <p>ПЕРЕД СТАРТОМ</p>
            <h2 id="warning-title">Назначьте исполнителя каждой задаче</h2>
            <span className="warning-copy">До запуска осталось распределить {unassignedTasks} {unassignedTasks === 1 ? "задачу" : unassignedTasks < 5 ? "задачи" : "задач"}. Один специалист может быть назначен на несколько задач.</span>
            <button onClick={() => setShowStartWarning(false)}>Вернуться к плану</button>
          </div>
        </div>
      )}

      {isFinished && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
          <div className={`result-modal debrief-modal ${game.status}`}>
            <span className="result-icon">{game.status === "won" ? "✓" : "!"}</span>
            <p>ПОСЛЕМАТЧЕВЫЙ РАЗБОР · {game.status === "won" ? "МИССИЯ ВЫПОЛНЕНА" : "ПРОЕКТ НЕ СДАН"}</p>
            <h2 id="result-title">{game.status === "won" ? "Релиз состоялся!" : game.failureReason === "budget" ? "Проект вышел за бюджет" : game.failureReason === "both" ? "Срок и бюджет нарушены" : "Дедлайн оказался быстрее"}</h2>
            <div className="debrief-grid">
              <article className="debrief-card">
                <span className="debrief-label">УЗКОЕ МЕСТО</span>
                <strong className="debrief-value">{debrief.bottleneckTask.short}</strong>
                <p className="debrief-copy">{debrief.bottleneckReason}</p>
              </article>
              <article className="debrief-card">
                <span className="debrief-label">ГРАФИК</span>
                <strong className="debrief-value">{completedCount}/{game.tasks.length} задач · неделя {game.week.toFixed(1)}</strong>
                <p className="debrief-copy">{debrief.lateTasks > 0 ? `С планом не совпали ${debrief.lateTasks} задач.` : "Все задачи завершались в пределах своего плана."} Ожидание зависимостей: {debrief.totalBlockedWeeks.toFixed(1)} нед.</p>
              </article>
              <article className="debrief-card">
                <span className="debrief-label">БЮДЖЕТ</span>
                <strong className="debrief-value">{game.spent <= game.budget ? `Резерв ${money(game.budget - game.spent)}` : `Перерасход ${money(game.spent - game.budget)}`}</strong>
                <p className="debrief-copy">Наибольшее отклонение: «{debrief.worstBudget.task.short}» — {debrief.worstBudget.variance > 0 ? "+" : ""}{money(debrief.worstBudget.variance)}.</p>
              </article>
              <article className="debrief-card">
                <span className="debrief-label">КОМАНДА</span>
                <strong className="debrief-value">{debrief.overloadWeeks > 0 ? `${debrief.overloadedPerson.name}: ${debrief.overloadWeeks.toFixed(1)} нед.` : "Без перегрузки"}</strong>
                <p className="debrief-copy">Переназначений после старта: {game.assignmentChanges}. Активные задачи без исполнителя: {debrief.totalUnassignedWeeks.toFixed(1)} нед.</p>
              </article>
              <article className="debrief-card full">
                <span className="debrief-label">РЕШЕНИЯ В СОБЫТИЯХ</span>
                <strong className="debrief-value">{game.eventHistory.length} из {game.eventCount} решений принято</strong>
                <p className="debrief-copy">{game.eventHistory.length > 0 ? game.eventHistory.map((event) => `${event.choiceTitle}: ${event.outcome}`).join(" · ") : "Сценарий завершился до первого события."}</p>
                <div className="debrief-tip">Следующий ход: {debrief.recommendation}</div>
              </article>
            </div>
            <div className="result-actions">
              <button className="replay-button" onClick={replayScenario}>↺ ПЕРЕИГРАТЬ СЦЕНАРИЙ</button>
              <button onClick={startFreshProject}>НОВЫЙ ПРОЕКТ →</button>
            </div>
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
            <div className="pda-explainer"><span>АИ</span><div><b>Буквы на аватаре — это инициалы</b><p>Они образованы из имени человека и не обозначают должность или ограничение. Любого специалиста можно назначить на любую задачу, в том числе сразу на несколько.</p></div></div>
            <div className="dependency-demo"><span><b>А</b> Требования <i>100%</i></span><strong>→ сначала завершить →</strong><span><b>Б</b> Прототип <i>ждёт</i></span><p>Некоторые этапы зависят от предыдущих. Задача Б не начнётся, пока задача А не готова на 100%, даже если исполнитель уже выбран.</p></div>
            <ol>
              <li><span>01</span><div><b>Сначала назначь людей</b><p>В каждой строке задачи открой список и выбери сотрудника. Смотри на скорость и цену: быстрый специалист справится раньше, но стоит дороже.</p></div></li>
              <li><span>02</span><div><b>Запусти и следи за линиями</b><p>Голубая линия «Сейчас» показывает ход времени. Красная линия справа — неизменный финальный дедлайн. Цвет внутри полосы показывает реально выполненную часть.</p></div></li>
              <li><span>03</span><div><b>Учитывай зависимости и перегрузку</b><p>Подпись «после» показывает, какие этапы нужно закончить раньше. Если один человек ведёт две уже активные задачи, обе движутся намного медленнее.</p></div></li>
              <li><span>04</span><div><b>Принимай решения в событиях</b><p>Несколько раз игра остановится из-за риска и предложит 2–3 варианта. Сравни влияние на срок, бюджет, прогресс и команду, выбери один, затем при необходимости перераспредели людей.</p></div></li>
              <li><span>05</span><div><b>Победи по двум условиям</b><p>Заверши все задачи до 18-й недели и не превысь бюджет. В каждом новом проекте меняются люди, их параметры, количество задач, расписание и зависимости.</p></div></li>
            </ol>
            <div className="guide-legend"><span><i className="legend-progress" />цветная заливка — сделано</span><span><i className="legend-now" />голубая линия — сейчас</span><span><i className="legend-deadline" />красная линия — дедлайн</span></div>
            <button className="start-button rules-start" onClick={() => setShowRules(false)}>Понятно, начинаем →</button>
          </div>
        </div>
      )}
    </main>
  );
}

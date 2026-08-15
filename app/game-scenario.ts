export const DEADLINE = 18;
export const TASK_COMPLETE = 99.9;

export type Person = {
  name: string;
  speed: number;
  cost: number;
  color: string;
  initials: string;
};

export type ProjectTask = {
  id: string;
  name: string;
  short: string;
  start: number;
  end: number;
  effort: number;
  budget: number;
  color: string;
  dependsOn: number[];
};

export type Scenario = {
  seed: number;
  team: Person[];
  tasks: ProjectTask[];
  budget: number;
};

const personNames = [
  "Алина", "Андрей", "Антон", "Валерия", "Виктор", "Глеб", "Дарья", "Денис",
  "Евгения", "Егор", "Жанна", "Илья", "Инна", "Кирилл", "Лев", "Лидия",
  "Максим", "Марина", "Марк", "Надежда", "Никита", "Оксана", "Павел", "Полина",
  "Роман", "Светлана", "София", "Тимур", "Фёдор", "Элина", "Юлия", "Ярослав",
];

const taskPool = [
  { name: "Провести интервью с клиентами", short: "Интервью" },
  { name: "Проверить продуктовые гипотезы", short: "Гипотезы" },
  { name: "Описать пользовательские сценарии", short: "Сценарии" },
  { name: "Собрать карту пути клиента", short: "Карта пути" },
  { name: "Подготовить интерактивный прототип", short: "Прототип" },
  { name: "Провести юзабилити-тест", short: "Юзабилити-тест" },
  { name: "Спроектировать архитектуру", short: "Архитектура" },
  { name: "Собрать дизайн-систему", short: "Дизайн-система" },
  { name: "Разработать серверное API", short: "API" },
  { name: "Собрать интерфейс приложения", short: "Интерфейс" },
  { name: "Настроить авторизацию", short: "Авторизация" },
  { name: "Подключить систему платежей", short: "Платежи" },
  { name: "Подготовить контент", short: "Контент" },
  { name: "Интегрировать уведомления", short: "Уведомления" },
  { name: "Настроить продуктовую аналитику", short: "Аналитика" },
  { name: "Провести нагрузочное тестирование", short: "Нагрузочный тест" },
  { name: "Исправить критические ошибки", short: "Исправления" },
  { name: "Настроить мониторинг", short: "Мониторинг" },
  { name: "Подготовить релизную сборку", short: "Релизная сборка" },
  { name: "Обучить службу поддержки", short: "Обучение" },
  { name: "Запустить закрытое бета-тестирование", short: "Бета-тест" },
  { name: "Проверить безопасность", short: "Безопасность" },
  { name: "Настроить процесс поставки", short: "Поставка" },
  { name: "Подключить поиск", short: "Поиск" },
  { name: "Разработать первый запуск", short: "Первый запуск" },
  { name: "Провести эксперимент с воронкой", short: "Эксперимент" },
  { name: "Подготовить документацию", short: "Документация" },
  { name: "Настроить резервное копирование", short: "Резервные копии" },
  { name: "Согласовать юридические тексты", short: "Юридические тексты" },
  { name: "Провести приёмочное тестирование", short: "Приёмка" },
  { name: "Настроить импорт данных", short: "Импорт данных" },
  { name: "Подготовить план запуска", short: "План запуска" },
];

const colors = ["#ff7352", "#ff9f43", "#8b5cf6", "#3b82f6", "#1fc9a5", "#ef4f91", "#f6b73c", "#69d2e7"];
const branchSizePlans: Record<number, number[][]> = {
  5: [[3, 2], [3, 1, 1]],
  6: [[3, 3], [4, 2], [3, 2, 1], [4, 1, 1]],
  7: [[4, 3], [5, 2], [3, 2, 2], [4, 2, 1], [5, 1, 1]],
};

function createRandom(seed: number) {
  let value = (seed || 4) >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function roundTo(value: number, step: number) {
  return Math.round(value / step) * step;
}

function getInitials(name: string) {
  return name.replace(/[^А-Яа-яЁё]/g, "").slice(0, 2).toUpperCase();
}

function splitDuration(total: number, count: number, random: () => number) {
  const minimumSteps = 5;
  const steps = Array.from({ length: count }, () => minimumSteps);
  let remainingSteps = Math.round(total * 2) - minimumSteps * count;

  while (remainingSteps > 0) {
    steps[Math.floor(random() * count)] += 1;
    remainingSteps -= 1;
  }

  return steps.map((value) => value / 2);
}

export function generateScenario(seed: number, previous?: Pick<Scenario, "team" | "tasks">): Scenario {
  const random = createRandom(seed);
  const previousNames = new Set(previous?.team.map((person) => person.name) ?? []);
  const availableNames = personNames.filter((name) => !previousNames.has(name));
  const selectedNames = shuffle(availableNames, random).slice(0, 4);
  const colorOrder = shuffle(colors, random);
  const usedCosts = new Set<number>();
  const speedBands = shuffle<"slow" | "fast" | "mixed">(["slow", "fast", "mixed", "mixed"], random);

  const team = selectedNames.map((name, index) => {
    const band = speedBands[index];
    const rawSpeed = band === "slow"
      ? 0.76 + random() * 0.22
      : band === "fast"
        ? 1.08 + random() * 0.45
        : 0.82 + random() * 0.68;
    const speed = Math.round(rawSpeed * 100) / 100;
    let cost = roundTo(105 + speed * 115 + random() * 72, 5);
    while (usedCosts.has(cost)) cost += 5;
    usedCosts.add(cost);
    return { name, speed, cost, color: colorOrder[index], initials: getInitials(name) };
  });

  const previousTaskNames = new Set(previous?.tasks.map((task) => task.name) ?? []);
  const countOptions = [5, 6, 7].filter((count) => count !== previous?.tasks.length);
  const taskCount = countOptions[Math.floor(random() * countOptions.length)];
  const selectedTasks = shuffle(taskPool.filter((task) => !previousTaskNames.has(task.name)), random).slice(0, taskCount);
  const taskColors = shuffle(colors, random);
  const medianRate = [...team].map((person) => person.cost / person.speed).sort((a, b) => a - b)[Math.floor(team.length / 2)];
  const tasks: ProjectTask[] = [];
  const sizePlans = branchSizePlans[taskCount];
  const branchSizes = [...sizePlans[Math.floor(random() * sizePlans.length)]];
  const anchorCandidates = branchSizes
    .map((size, branchIndex) => ({ size, branchIndex }))
    .filter(({ size }) => size > 1)
    .map(({ branchIndex }) => branchIndex);
  const anchorBranch = anchorCandidates[Math.floor(random() * anchorCandidates.length)];
  const branchOffsets = branchSizes.map((_, branchIndex) => (
    branchIndex === anchorBranch ? 0 : Math.floor(random() * 9) / 2
  ));
  const branchDurations = branchSizes.map((size, branchIndex) => {
    if (branchIndex === anchorBranch) return splitDuration(DEADLINE, size, random);
    const minimumHorizon = Math.max(size * 2.5, 7);
    const maximumHorizon = Math.min(
      DEADLINE - branchOffsets[branchIndex],
      size === 1 ? DEADLINE - 0.5 : DEADLINE,
    );
    const availableHalfSteps = Math.round((maximumHorizon - minimumHorizon) * 2);
    const horizon = minimumHorizon + Math.floor(random() * (availableHalfSteps + 1)) / 2;
    return splitDuration(horizon, size, random);
  });
  const branchStarts = branchDurations.map((durations, branchIndex) => {
    let cursor = branchOffsets[branchIndex];
    return durations.map((duration) => {
      const start = cursor;
      cursor += duration;
      return start;
    });
  });
  const rowIndexes = branchSizes.map(() => [] as number[]);
  const primaryBranch = branchSizes.findIndex((size) => size > 1);
  const rootOrder = [
    primaryBranch,
    ...shuffle(
      branchSizes.map((_, branchIndex) => branchIndex).filter((branchIndex) => branchIndex !== primaryBranch),
      random,
    ),
  ];
  const maximumDepth = Math.max(...branchSizes);

  for (let depth = 0; depth < maximumDepth; depth += 1) {
    const branchesAtDepth = depth === 0
      ? rootOrder
      : shuffle(
        branchSizes.map((_, branchIndex) => branchIndex).filter((branchIndex) => branchSizes[branchIndex] > depth),
        random,
      );

    branchesAtDepth.forEach((branchIndex) => {
      if (branchSizes[branchIndex] <= depth) return;
      const index = tasks.length;
      const template = selectedTasks[index];
      const start = branchStarts[branchIndex][depth];
      const duration = branchDurations[branchIndex][depth];
      const dependsOn = depth === 0 ? [] : [rowIndexes[branchIndex][depth - 1]];
      const effort = Math.round(duration * (0.75 + random() * 0.25) * 10) / 10;
      const budget = roundTo(effort * medianRate * (0.94 + random() * 0.14), 10);

      tasks.push({
        id: `task-${seed >>> 0}-${index}`,
        ...template,
        start,
        end: start + duration,
        effort,
        budget,
        color: taskColors[index % taskColors.length],
        dependsOn,
      });
      rowIndexes[branchIndex][depth] = index;
    });
  }

  const budget = roundTo(tasks.reduce((sum, task) => sum + task.budget, 0) * (1.08 + random() * 0.08), 50);
  return { seed: seed >>> 0, team, tasks, budget };
}

export function dependenciesComplete(tasks: ProjectTask[], taskState: Array<{ progress: number }>, taskIndex: number) {
  return tasks[taskIndex].dependsOn.every((dependency) => isTaskComplete(taskState[dependency].progress));
}

export function isTaskComplete(progress: number) {
  return progress >= TASK_COMPLETE;
}

export function isTaskActive(tasks: ProjectTask[], taskState: Array<{ progress: number }>, taskIndex: number, week: number) {
  return week >= tasks[taskIndex].start
    && dependenciesComplete(tasks, taskState, taskIndex)
    && !isTaskComplete(taskState[taskIndex].progress);
}

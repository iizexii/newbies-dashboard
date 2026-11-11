// Метрики новичка и объяснимый риск раннего ухода.
// Никакого "ИИ-прогноза": только проверяемые правила, у каждого правила — текст и вес.
import { diffDays, workdaysBetween } from './dates.js';

export const ADAPTATION_DAYS = 90;

export const CHECKINS = [
  { key: 'd7', day: 7, label: 'Встреча 7-го дня', points: 2 },
  { key: 'd30', day: 30, label: 'Встреча 30-го дня', points: 2 },
  { key: 'd60', day: 60, label: 'Встреча 60-го дня', points: 1 },
];
const CHECKIN_GRACE = 3; // сколько календарных дней ждём после контрольной точки

export const LEVELS = {
  high: { label: 'Высокий риск', short: 'Высокий', order: 3 },
  medium: { label: 'Требует внимания', short: 'Внимание', order: 2 },
  low: { label: 'Всё в порядке', short: 'Норма', order: 1 },
  done: { label: 'Адаптация пройдена', short: '> 90 дней', order: 0 },
  left: { label: 'Уволился', short: 'Уволился', order: -1 },
};

/** Последний день, по которому считаем метрики. */
export function endDate(emp, today) {
  return emp.status === 'left' && emp.leftDate ? emp.leftDate : today;
}

export function computeMetrics(emp, today) {
  const end = endDate(emp, today);
  const tenureDays = Math.max(1, diffDays(emp.hireDate, end) + 1);
  const workdays = workdaysBetween(emp.hireDate, end);
  // Завершённые рабочие дни: для работающего сотрудника сегодняшний день ещё идёт.
  const closedWorkdays = emp.status === 'left' ? workdays : workdays.filter((d) => d < end);

  const tasks = (emp.tasks || []).filter((t) => t.created <= end);
  const received = tasks.length;
  const started = tasks.filter((t) => t.started && t.started <= end).length;
  const closed = tasks.filter((t) => t.closed && t.closed <= end).length;
  // Просрочка: срок прошёл (срок «сегодня» ещё не просрочка), а задача не закрыта.
  // Делим на «не взялся» и «взялся, но застрял» — руководителю нужно делать разное.
  const isOpen = (t) => !(t.closed && t.closed <= end);
  const isStarted = (t) => !!(t.started && t.started <= end);
  const overdueList = tasks.filter((t) => isOpen(t) && t.deadline < end);
  const overdueNotStarted = overdueList.filter((t) => !isStarted(t)).length;
  const overdueStuck = overdueList.filter(isStarted).length;
  const overdue = overdueList.length;
  // Завершённые позже срока: работа сделана, но человек не успевает.
  const closedLate = tasks.filter((t) => !isOpen(t) && t.closed > t.deadline).length;

  // Активность сотрудника в Б24 = он сам начал или завершил задачу в этот день.
  // Получение задачи — действие руководителя, активностью новичка не считается.
  const activeSet = new Set();
  for (const t of tasks) {
    if (t.started && t.started <= end) activeSet.add(t.started);
    if (t.closed && t.closed <= end) activeSet.add(t.closed);
  }
  const activity = workdays.map((d) => ({ date: d, active: activeSet.has(d), current: !closedWorkdays.includes(d) }));

  // Серия «без действий» считается по завершённым дням, но действие сегодня её обнуляет.
  let idleStreak = 0;
  for (let i = closedWorkdays.length - 1; i >= 0 && !activeSet.has(end); i--) {
    if (activeSet.has(closedWorkdays[i])) break;
    idleStreak++;
  }
  const idleTotal = closedWorkdays.filter((d) => !activeSet.has(d)).length;

  const firstTask = tasks.map((t) => t.created).sort()[0] || null;
  const workdaysWithoutFirstTask = firstTask
    ? workdaysBetween(emp.hireDate, firstTask).length - 1
    : closedWorkdays.length;

  const checkins = CHECKINS.map((c) => {
    const done = emp.checkins?.[c.key] || null;
    const due = tenureDays > c.day; // точка наступила
    const overdueBy = !done ? tenureDays - (c.day + CHECKIN_GRACE) : 0;
    return { ...c, done, due, overdue: !done && overdueBy > 0, overdueBy };
  });

  // Отметки «я на работе». undefined = данных об отметках нет (правило не применяем).
  const att = emp.attendance;
  let absentStreak = 0;
  let presentDays = 0;
  if (att) {
    for (let i = closedWorkdays.length - 1; i >= 0 && !att[end]; i--) {
      if (att[closedWorkdays[i]]) break;
      absentStreak++;
    }
    presentDays = closedWorkdays.filter((d) => att[d]).length;
  }
  const checkedInToday = att ? att[today] || null : null;

  return {
    end, tenureDays, workdaysCount: closedWorkdays.length, received, started, closed,
    overdue, overdueNotStarted, overdueStuck, closedLate,
    completion: received ? closed / received : null,
    idleStreak, idleTotal, activity, firstTask, workdaysWithoutFirstTask, checkins,
    hasAttendance: !!att, absentStreak, presentDays, checkedInToday,
  };
}

/**
 * Риск = сумма весов сработавших правил.
 * high >= 5, medium >= 2, иначе low. Возвращаем и причины, и то, что в порядке.
 */
export function assessRisk(emp, today, m = computeMetrics(emp, today)) {
  if (emp.status === 'left') return { level: 'left', score: 0, reasons: [], ok: [], metrics: m };
  if (m.tenureDays > ADAPTATION_DAYS) return { level: 'done', score: 0, reasons: [], ok: [], metrics: m };

  const reasons = [];
  const ok = [];
  // hint — что посоветовать руководителю; попадает в текст поручения.
  const add = (points, text, hint) => reasons.push({ points, text, hint });

  if (m.hasAttendance && m.workdaysCount > 0) {
    if (m.absentStreak >= 2) add(2, `Не отмечался на работе ${m.absentStreak} раб. дн. подряд`);
    else if (m.absentStreak === 1) add(1, 'Вчера не отметился на работе');
  }

  if (!emp.mentor) add(2, 'Наставник не назначен');
  else ok.push(`Наставник: ${emp.mentor}`);

  for (const c of m.checkins) {
    if (c.done) ok.push(`${c.label} проведена`);
    else if (c.overdue) add(c.points, `${c.label} не проведена (просрочено на ${c.overdueBy} дн.)`);
  }

  if (m.received === 0 && m.workdaysCount >= 3) {
    add(3, `За ${m.workdaysCount} раб. дн. новичку не поставлено ни одной задачи в Б24`);
  } else if (m.workdaysWithoutFirstTask > 3) {
    add(1, `Первая задача появилась только через ${m.workdaysWithoutFirstTask} раб. дн.`);
  }

  if (m.received > 0) {
    if (m.idleStreak >= 5) add(3, `${m.idleStreak} раб. дн. подряд нет активности в задачах Б24`);
    else if (m.idleStreak >= 3) add(1, `${m.idleStreak} раб. дн. подряд нет активности в задачах Б24`);
    else ok.push('Есть свежая активность в задачах');
  }

  const tasksWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'задачу' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'задачи' : 'задач');
  if (m.overdueNotStarted >= 1) {
    add(m.overdueNotStarted >= 3 ? 2 : 1, `Не взялся за ${m.overdueNotStarted} ${tasksWord(m.overdueNotStarted)} со сроком`,
      'Проверить, понимает ли новичок, что эти задачи его, и хватает ли ему времени.');
  }
  if (m.overdueStuck >= 1) {
    add(m.overdueStuck >= 3 ? 2 : 1, `${m.overdueStuck} ${m.overdueStuck === 1 ? 'задача начата и застряла' : `${tasksWord(m.overdueStuck)} начаты и застряли`} после срока — нужна помощь`,
      'Разобрать застрявшие задачи вместе: что непонятно, нужен ли наставник или обучение.');
  }

  // Опоздания учитываем, только если это система: больше половины из 5+ завершённых.
  if (m.closed >= 5 && m.closedLate / m.closed > 0.5) {
    add(1, `Завершает с опозданием: ${m.closedLate} из ${m.closed} задач`,
      'Обсудить сроки: возможно, их ставят без учёта того, что человек ещё учится.');
  }

  if (m.received >= 5 && m.completion < 0.4) {
    add(2, `Завершено ${m.closed} из ${m.received} задач (${Math.round(m.completion * 100)}%)`);
  }

  const score = reasons.reduce((s, r) => s + r.points, 0);
  const level = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
  reasons.sort((a, b) => b.points - a.points);
  return { level, score, reasons, ok, metrics: m };
}

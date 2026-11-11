// Аналитика ранних уходов (до 90 дней) за последние 12 месяцев.
import { addDays, diffDays, workdaysBetween } from './dates.js';
import { ADAPTATION_DAYS } from './risk.js';

export function tenureAtLeave(e) {
  return diffDays(e.hireDate, e.leftDate) + 1;
}

export function isEarlyLeaver(e) {
  return e.status === 'left' && !!e.leftDate && tenureAtLeave(e) <= ADAPTATION_DAYS;
}

/**
 * "Созревшая" когорта: те, по кому уже известно, ушёл ли человек до 90 дней.
 * Принятые меньше 90 дней назад и ещё работающие в знаменатель не идут,
 * иначе доля ранних уходов была бы занижена.
 */
export function isMatured(e, today) {
  return isEarlyLeaver(e) || diffDays(e.hireDate, today) + 1 > ADAPTATION_DAYS;
}

const WEEK_BUCKETS = [
  { label: '1-я неделя', from: 1, to: 7 },
  { label: '2-я неделя', from: 8, to: 14 },
  { label: '3-4 недели', from: 15, to: 30 },
  { label: '2-й месяц', from: 31, to: 60 },
  { label: '3-й месяц', from: 61, to: 90 },
];

function rate(part, total) {
  return total ? part / total : null;
}

/** Первые 10 рабочих дней человека: доля дней с активностью и задержка первой задачи. */
function firstWeeksProfile(e) {
  const wds = workdaysBetween(e.hireDate, addDays(e.hireDate, 20)).slice(0, 10);
  const active = new Set();
  for (const t of e.tasks || []) {
    if (t.started) active.add(t.started);
    if (t.closed) active.add(t.closed);
  }
  const first = (e.tasks || []).map((t) => t.created).sort()[0];
  const firstDelay = first ? workdaysBetween(e.hireDate, first).length - 1 : 10;
  return {
    activeShare: wds.filter((d) => active.has(d)).length / wds.length,
    firstDelay: Math.min(firstDelay, 10),
    mentor: e.mentor ? 1 : 0,
    checkin7: e.checkins?.d7 ? 1 : 0,
  };
}

function avg(rows, key) {
  return rows.length ? rows.reduce((s, r) => s + r[key], 0) / rows.length : null;
}

export function buildAnalytics(state, today, deptId = 'all') {
  const from = addDays(today, -365);
  const hires = state.employees.filter((e) => e.hireDate >= from && (deptId === 'all' || e.dept === deptId));
  const matured = hires.filter((e) => isMatured(e, today));
  const early = hires.filter(isEarlyLeaver);
  const leftAll = hires.filter((e) => e.status === 'left');
  // Метрика заказчика: "каждый третий из ушедших не доработал до 3 месяцев" -
  // все уволившиеся за 12 мес. (любой стаж) и доля ранних среди них.
  const leavers = state.employees.filter((e) => e.status === 'left' && e.leftDate && e.leftDate >= from && (deptId === 'all' || e.dept === deptId));
  const earlyLeavers = leavers.filter(isEarlyLeaver);

  const tenures = early.map(tenureAtLeave).sort((a, b) => a - b);
  const median = tenures.length ? tenures[Math.floor(tenures.length / 2)] : null;

  const byDept = state.departments.map((d) => {
    const m = matured.filter((e) => e.dept === d.id);
    const l = early.filter((e) => e.dept === d.id);
    return { id: d.id, label: d.name, total: m.length, early: l.length, rate: rate(l.length, m.length) };
  });

  const byWeek = WEEK_BUCKETS.map((b) => ({
    label: b.label,
    count: early.filter((e) => { const t = tenureAtLeave(e); return t >= b.from && t <= b.to; }).length,
  }));

  const byManager = state.managers
    .map((mg) => {
      const m = matured.filter((e) => e.managerId === mg.id);
      const l = early.filter((e) => e.managerId === mg.id);
      const dept = state.departments.find((d) => d.id === mg.dept);
      return { id: mg.id, label: mg.name, dept: dept ? dept.name : '-', total: m.length, early: l.length, rate: rate(l.length, m.length) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

  const reasonsMap = new Map();
  for (const e of early) reasonsMap.set(e.leftReason || 'Не указана', (reasonsMap.get(e.leftReason || 'Не указана') || 0) + 1);
  const byReason = [...reasonsMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  // Сравнение первых 2 недель: ушедшие рано (проработавшие хотя бы 2 недели) vs прошедшие 90 дней.
  const earlyGroup = early.filter((e) => tenureAtLeave(e) >= 14).map(firstWeeksProfile);
  const stayGroup = hires.filter((e) => !isEarlyLeaver(e) && diffDays(e.hireDate, today) + 1 > ADAPTATION_DAYS).map(firstWeeksProfile);
  const compare = [
    { label: 'Доля дней с активностью в задачах (первые 10 раб. дн.)', fmt: 'pct', early: avg(earlyGroup, 'activeShare'), stay: avg(stayGroup, 'activeShare') },
    { label: 'Раб. дней до первой задачи', fmt: 'num', early: avg(earlyGroup, 'firstDelay'), stay: avg(stayGroup, 'firstDelay') },
    { label: 'Был назначен наставник', fmt: 'pct', early: avg(earlyGroup, 'mentor'), stay: avg(stayGroup, 'mentor') },
    { label: 'Проведена встреча 7-го дня', fmt: 'pct', early: avg(earlyGroup, 'checkin7'), stay: avg(stayGroup, 'checkin7') },
  ];

  // По месяцам: сколько вышло на работу и сколько ушло в первые 90 дней (по месяцу ухода).
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const [ty, tm] = today.split('-').map(Number);
  const byMonth = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(ty, tm - 1 - k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    byMonth.push({
      key,
      label: MONTHS[d.getMonth()],
      hired: hires.filter((e) => e.hireDate.startsWith(key)).length,
      early: early.filter((e) => e.leftDate.startsWith(key)).length,
    });
  }

  return {
    byMonth,
    hires: hires.length,
    matured: matured.length,
    early: early.length,
    leftAll: leftAll.length,
    earlyRate: rate(early.length, matured.length),
    leavers: leavers.length,
    earlyLeavers: earlyLeavers.length,
    earlyShareOfLeavers: rate(earlyLeavers.length, leavers.length),
    median,
    byDept, byWeek, byManager, byReason,
    compare, earlyN: earlyGroup.length, stayN: stayGroup.length,
  };
}

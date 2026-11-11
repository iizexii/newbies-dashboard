// Общее состояние приложения и мелкие помощники для всех экранов.
import { assessRisk, riskTrend } from './risk.js';
export { fmt } from './dates.js';

export const ctx = {
  state: null,
  today: null,
  ui: {
    role: 'hr', // hr | manager | employee — демо-вход без пароля
    asManager: 'm1',
    asEmployee: null,
    page: { hr: 'overview', manager: 'team', employee: 'today' },
    // HR → Новички
    dept: 'all', q: '', risk: 'all', tenure: 'adapt', manager: 'all',
    sort: { key: 'risk', dir: -1 },
    openId: null, showAllTasks: false,
    // HR → Аналитика
    anDept: 'all',
    // HR → Админка
    adminTab: 'employees',
    adm: { q: '', dept: 'all', status: 'active', sort: { key: 'name', dir: 1 } },
  },
};

export const HR_NAME = 'Кравец Анна, HR-директор';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

export const manager = (id) => ctx.state.managers.find((m) => m.id === id);
export const managerName = (id) => manager(id)?.name || '—';
/** Автор действия: руководитель по id или HR. */
export const personName = (id) => (id === 'hr' ? `${HR_NAME.split(',')[0]} (HR)` : managerName(id));
export const deptName = (id) => ctx.state.departments.find((d) => d.id === id)?.name || '—';
export const emp = (id) => ctx.state.employees.find((e) => e.id === id);

export const checklistOf = (deptId) => ctx.state.departments.find((d) => d.id === deptId)?.checklist || [];

let cache = new Map();
let trendCache = new Map();
export function resetCache() { cache = new Map(); trendCache = new Map(); }
export function assess(e) {
  if (!cache.has(e.id)) cache.set(e.id, assessRisk(e, ctx.today, { checklist: checklistOf(e.dept) }));
  return cache.get(e.id);
}
/** Изменение баллов за неделю: { delta, prevScore } или null. */
export function trend(e) {
  if (!trendCache.has(e.id)) trendCache.set(e.id, riskTrend(e, ctx.today, { checklist: checklistOf(e.dept) }, assess(e)));
  return trendCache.get(e.id);
}
/** Стрелка динамики рядом с баллом риска. */
export function trendMark(e) {
  const t = trend(e);
  if (!t || !t.delta) return '';
  const up = t.delta > 0;
  return `<span class="trend ${up ? 'up' : 'down'}" data-tip="Неделю назад: ${t.prevScore} ${plural(t.prevScore, 'балл', 'балла', 'баллов')}" tabindex="0">${up ? '▲' : '▼'}${Math.abs(t.delta)}</span>`;
}

/** Найти задачу сотрудника по id (в любом сотруднике). */
export function findTask(id) {
  for (const e of ctx.state.employees) {
    const t = (e.tasks || []).find((x) => String(x.id) === String(id));
    if (t) return { e, t };
  }
  return null;
}

/** Кнопка «?» с пояснением: текст виден по наведению и по фокусу с клавиатуры. */
export const help = (text) => `<button type="button" class="q" data-tip="${esc(text)}" aria-label="Пояснение: ${esc(text)}">?</button>`;
export const inAdaptation = (e) => e.status === 'active' && assess(e).metrics.tenureDays <= 90;
export const newcomers = () => ctx.state.employees.filter(inAdaptation);

// Цвета: статусы риска (всегда вместе с текстом) и две серии графиков.
export const RISK_COLORS = [
  { key: 'high', label: 'Высокий риск', color: 'var(--crit)' },
  { key: 'medium', label: 'Требует внимания', color: 'var(--warn)' },
  { key: 'low', label: 'Всё в порядке', color: 'var(--good)' },
];

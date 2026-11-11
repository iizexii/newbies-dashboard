// Общее состояние приложения и мелкие помощники для всех экранов.
import { assessRisk } from './risk.js';
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
export const deptName = (id) => ctx.state.departments.find((d) => d.id === id)?.name || '—';
export const emp = (id) => ctx.state.employees.find((e) => e.id === id);

let cache = new Map();
export function resetCache() { cache = new Map(); }
export function assess(e) {
  if (!cache.has(e.id)) cache.set(e.id, assessRisk(e, ctx.today));
  return cache.get(e.id);
}
export const inAdaptation = (e) => e.status === 'active' && assess(e).metrics.tenureDays <= 90;
export const newcomers = () => ctx.state.employees.filter(inAdaptation);

// Цвета: статусы риска (всегда вместе с текстом) и две серии графиков.
export const RISK_COLORS = [
  { key: 'high', label: 'Высокий риск', color: 'var(--crit)' },
  { key: 'medium', label: 'Требует внимания', color: 'var(--warn)' },
  { key: 'low', label: 'Всё в порядке', color: 'var(--good)' },
];

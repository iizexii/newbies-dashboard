// Хранение состояния в localStorage браузера. Без бэкенда: демо работает с любого статического хостинга.
import { generateDemo } from './data.js';
import { addDays, diffDays } from './dates.js';

const KEY = 'novichok.state.v6';

export function loadState(today) {
  let state = null;
  try {
    // старые версии демо больше не нужны
    for (const v of [1, 2, 3, 4, 5]) localStorage.removeItem(`novichok.state.v${v}`);
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch { /* приватный режим или битые данные - начнём с демо */ }
  if (!state || state.version !== 6) state = generateDemo(today);
  return keepDemoFresh(state, today);
}

export function saveState(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetState(today) {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return generateDemo(today);
}

/**
 * Демо-режим: если страницу открыли через неделю после генерации, сдвигаем все даты
 * на целое число недель, чтобы картина не "протухала" (выходные остаются выходными).
 */
export function keepDemoFresh(state, today) {
  const weeks = Math.floor(diffDays(state.generatedFor, today) / 7);
  if (weeks < 1) return state;
  const n = weeks * 7;
  const sh = (d) => (d ? addDays(d, n) : d);
  for (const e of state.employees) {
    e.hireDate = sh(e.hireDate);
    e.leftDate = sh(e.leftDate);
    for (const k of Object.keys(e.checkins || {})) e.checkins[k] = sh(e.checkins[k]);
    if (e.attendance) e.attendance = Object.fromEntries(Object.entries(e.attendance).map(([d, t]) => [sh(d), t]));
    e.mentorSince = sh(e.mentorSince);
    for (const t of e.tasks || []) {
      t.created = sh(t.created); t.deadline = sh(t.deadline); t.started = sh(t.started); t.closed = sh(t.closed);
      for (const h of t.history || []) {
        h.at = sh(h.at);
        h.closedWas = sh(h.closedWas);
        if (h.changes.deadline) { h.changes.deadline.from = sh(h.changes.deadline.from); h.changes.deadline.to = sh(h.changes.deadline.to); }
      }
    }
    for (const p of Object.values(e.pulse || {})) p.date = sh(p.date);
    for (const k of Object.keys(e.onboarding || {})) e.onboarding[k] = sh(e.onboarding[k]);
  }
  for (const a of state.actions || []) { a.created = sh(a.created); a.deadline = sh(a.deadline); a.doneAt = sh(a.doneAt); a.remindedAt = sh(a.remindedAt); }
  state.generatedFor = sh(state.generatedFor);
  return state;
}

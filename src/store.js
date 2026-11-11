// Хранение состояния в localStorage браузера. Без бэкенда: демо работает с любого статического хостинга.
import { generateDemo } from './data.js';
import { addDays, diffDays } from './dates.js';

const KEY = 'novichok.state.v2';

export function loadState(today) {
  let state = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = JSON.parse(raw);
  } catch { /* приватный режим или битые данные — начнём с демо */ }
  if (!state || state.version !== 2) state = generateDemo(today);
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
    for (const t of e.tasks || []) {
      t.created = sh(t.created); t.deadline = sh(t.deadline); t.started = sh(t.started); t.closed = sh(t.closed);
    }
  }
  for (const a of state.actions || []) { a.created = sh(a.created); a.deadline = sh(a.deadline); a.doneAt = sh(a.doneAt); }
  state.generatedFor = sh(state.generatedFor);
  return state;
}

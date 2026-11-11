// Работа с датами. Все даты храним строкой 'YYYY-MM-DD' (локальное время),
// чтобы не ловить сдвиги часовых поясов.

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(fromIso, toIso) {
  return Math.round((fromISO(toIso) - fromISO(fromIso)) / 86400000);
}

// В демо рабочие дни — Пн–Пт. Праздники и сменные графики не учитываются.
export function isWorkday(iso) {
  const wd = fromISO(iso).getDay();
  return wd !== 0 && wd !== 6;
}

/** Рабочие дни в диапазоне [from, to] включительно. */
export function workdaysBetween(fromIso, toIso) {
  const out = [];
  if (fromIso > toIso) return out;
  let cur = fromIso;
  while (cur <= toIso) {
    if (isWorkday(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function nextWorkday(iso) {
  let cur = addDays(iso, 1);
  while (!isWorkday(cur)) cur = addDays(cur, 1);
  return cur;
}

export function todayISO() {
  return toISO(new Date());
}

export function fmt(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

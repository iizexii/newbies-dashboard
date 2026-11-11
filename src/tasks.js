// Задачи сотрудника: правка постановщиком с историей версий и отметкой «сотрудник видел».
// Чистые функции без DOM — их проверяют тесты.
//
// Поля задачи: { id, title, description, created, deadline, started, closed, by,
//   version,      — номер текущей версии (1 — как поставили)
//   history,      — [{ v, at, by, note, changes: { поле: { from, to } } }]
//   seenVersion } — какую версию сотрудник уже открывал (0 — ещё не открывал новую задачу)

export const TASK_FIELDS = { title: 'Название', description: 'Описание', deadline: 'Срок' };

/** Применить правку. Возвращает изменения или null, если ничего не поменялось. */
export function editTask(t, patch, by, at, note = '') {
  if (t.closed) return null;
  const changes = {};
  for (const k of Object.keys(TASK_FIELDS)) {
    if (!(k in patch)) continue;
    const to = String(patch[k] ?? '').trim();
    const from = String(t[k] ?? '');
    if (to !== from) changes[k] = { from, to };
  }
  if (!Object.keys(changes).length) return null;
  const v = (t.version || 1) + 1;
  t.history = [...(t.history || []), { v, at, by, note: note.trim(), changes }];
  for (const [k, c] of Object.entries(changes)) t[k] = c.to;
  t.version = v;
  return changes;
}

/**
 * Вернуть завершённую задачу на доработку: задача снова «в работе», комментарий постановщика
 * сохраняется в истории как отдельная версия, срок можно продлить. Сотрудник получит уведомление.
 */
export function returnForRework(t, by, at, comment, deadline = t.deadline) {
  if (!t.closed || !comment.trim()) return false;
  const v = (t.version || 1) + 1;
  const changes = deadline && deadline !== t.deadline ? { deadline: { from: t.deadline, to: deadline } } : {};
  t.history = [...(t.history || []), { v, at, by, kind: 'rework', note: comment.trim(), closedWas: t.closed, changes }];
  if (changes.deadline) t.deadline = deadline;
  t.closed = null;
  t.started = t.started || at;
  t.version = v;
  return true;
}

/** Задача сейчас на доработке: последняя версия — возврат постановщиком. */
export const isRework = (t) => !t.closed && lastChange(t)?.kind === 'rework';

/** Новая задача, которую сотрудник ещё не открывал. */
export const isNewTask = (t) => !t.closed && t.seenVersion === 0;

/** Задачу меняли после того, как сотрудник её смотрел. */
export const hasUnseenChanges = (t) => !t.closed && (t.seenVersion ?? 1) >= 1 && (t.seenVersion ?? 1) < (t.version || 1);

export function markSeen(t) { t.seenVersion = t.version || 1; }

/** Сводные изменения после версии v: по каждому полю — значение в версии v и текущее. */
export function changesSince(t, v) {
  const out = {};
  for (const h of t.history || []) {
    if (h.v <= v) continue;
    for (const [k, c] of Object.entries(h.changes)) {
      out[k] = { from: out[k]?.from ?? c.from, to: c.to };
    }
  }
  // если поле вернули к исходному значению — изменения нет
  for (const k of Object.keys(out)) if (out[k].from === out[k].to) delete out[k];
  return out;
}

/** Как выглядела задача в версии v: откатываем правки новее v. */
export function versionSnapshot(t, v) {
  const snap = { title: t.title, description: t.description ?? '', deadline: t.deadline };
  for (const h of [...(t.history || [])].reverse()) {
    if (h.v <= v) break;
    for (const [k, c] of Object.entries(h.changes)) snap[k] = c.from;
  }
  return snap;
}

export const lastChange = (t) => (t.history?.length ? t.history[t.history.length - 1] : null);

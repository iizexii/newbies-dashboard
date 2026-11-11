// Уведомления внутри приложения. Список не хранится отдельно: он собирается из состояния
// (новые и изменённые задачи, поручения, опросы, просрочки). В рабочей версии те же события
// дублируются в Битрикс24 через im.notify.
import { ctx, emp, manager, managerName, personName, newcomers, assess } from './ctx.js';
import { isNewTask, hasUnseenChanges, isRework, lastChange, TASK_FIELDS } from './tasks.js';
import { PULSE_QUESTIONS } from './risk.js';
import { addDays, workdaysBetween } from './dates.js';

/** Сколько рабочих дней поручение просрочено (сегодня не считаем). */
export function overdueWorkdays(x, today) {
  if (x.status !== 'open' || x.deadline >= today) return 0;
  return workdaysBetween(addDays(x.deadline, 1), addDays(today, -1)).length;
}
export const ESCALATE_AFTER = 2; // рабочих дней просрочки — и поручение уходит HR как эскалация
export const isEscalated = (x, today) => overdueWorkdays(x, today) >= ESCALATE_AFTER;

const lowPulse = (e) => {
  const p = assess(e).metrics.lastPulse;
  if (!p) return null;
  const low = PULSE_QUESTIONS.filter((q) => p.answer[q.key] <= 2);
  return low.length ? { p, low } : null;
};

/** Уведомления текущей роли. unread — показывать счётчик; sticky — уходит только когда проблема решена. */
export function notifications() {
  const { ui, state, today } = ctx;
  const out = [];
  if (ui.role === 'employee') {
    const e = emp(ui.asEmployee);
    if (!e) return out;
    for (const t of e.tasks || []) {
      if (isNewTask(t)) {
        out.push({ kind: 'task', title: 'Новая задача', text: t.title, date: t.created, act: 'task-view', id: t.id });
      } else if (hasUnseenChanges(t) && isRework(t)) {
        const h = lastChange(t);
        out.push({ kind: 'alert', title: 'Задачу вернули на доработку', text: `${t.title}: «${h.note}»`, date: h.at, who: personName(h.by), act: 'task-view', id: t.id });
      } else if (hasUnseenChanges(t)) {
        const h = lastChange(t);
        const fields = [...new Set(t.history.filter((x) => x.v > t.seenVersion).flatMap((x) => (x.kind === 'rework' ? ['rework'] : Object.keys(x.changes))))].map((k) => (k === 'rework' ? 'возвращалась на доработку' : TASK_FIELDS[k].toLowerCase()));
        out.push({ kind: 'edit', title: 'Задача изменена', text: `${t.title} — изменено: ${fields.join(', ')}`, date: h.at, who: personName(h.by), act: 'task-view', id: t.id });
      }
    }
    const due = assess(e).metrics.pulseDue;
    if (due) out.push({ kind: 'pulse', title: `Опрос ${due.day}-го дня`, text: 'Три вопроса о первых днях — меньше минуты', date: today, act: 'goto-pulse', sticky: true });
  } else if (ui.role === 'manager') {
    const mg = manager(ui.asManager);
    if (!mg) return out;
    for (const x of state.actions.filter((a) => a.responsibleId === mg.id && a.status === 'open')) {
      if (!x.seenByManager) out.push({ kind: 'action', title: 'Новое поручение от HR', text: x.title, date: x.created, act: 'notif-action', id: x.id });
      else if (x.remindedAt && !x.remindSeen) out.push({ kind: 'alert', title: 'HR напоминает о поручении', text: x.title, date: x.remindedAt, act: 'notif-action', id: x.id });
    }
    for (const e of newcomers().filter((n) => n.managerId === mg.id)) {
      const lp = lowPulse(e);
      if (lp && !lp.p.answer.mgrSeen) out.push({ kind: 'pulse', title: 'Низкая оценка в опросе', text: `${e.name}: «${lp.low[0].label}» — ${lp.p.answer[lp.low[0].key]} из 5`, date: lp.p.answer.date, act: 'notif-pulse', id: e.id, k: lp.p.key });
    }
  } else {
    for (const x of state.actions) {
      if (isEscalated(x, today)) {
        const n = overdueWorkdays(x, today);
        out.push({ kind: 'alert', title: 'Поручение просрочено', text: `${managerName(x.responsibleId)}: ${x.title} — ${n} раб. дн.`, date: x.deadline, act: 'notif-escalation', id: x.id, sticky: true });
      }
      if (x.status === 'done' && !x.hrSeen) out.push({ kind: 'done', title: 'Руководитель выполнил поручение', text: `${x.title}${x.comment ? ` — «${x.comment}»` : ''}`, date: x.doneAt, act: 'notif-done', id: x.id });
    }
    for (const e of newcomers()) {
      const lp = lowPulse(e);
      if (lp && !lp.p.answer.hrSeen) out.push({ kind: 'pulse', title: 'Низкая оценка в опросе', text: `${e.name}: «${lp.low[0].label}» — ${lp.p.answer[lp.low[0].key]} из 5`, date: lp.p.answer.date, act: 'notif-pulse', id: e.id, k: lp.p.key });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** «Прочитать все»: снимаем отметки, кроме тех, что уходят только вместе с проблемой. */
export function markAllRead() {
  const { ui, state } = ctx;
  if (ui.role === 'employee') {
    for (const t of emp(ui.asEmployee)?.tasks || []) if (isNewTask(t) || hasUnseenChanges(t)) t.seenVersion = t.version || 1;
  } else if (ui.role === 'manager') {
    for (const x of state.actions.filter((a) => a.responsibleId === ui.asManager)) { x.seenByManager = true; if (x.remindedAt) x.remindSeen = true; }
    for (const e of newcomers().filter((n) => n.managerId === ui.asManager)) for (const p of Object.values(e.pulse || {})) p.mgrSeen = true;
  } else {
    for (const x of state.actions) if (x.status === 'done') x.hrSeen = true;
    for (const e of newcomers()) for (const p of Object.values(e.pulse || {})) p.hrSeen = true;
  }
}

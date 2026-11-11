// Задача сотрудника: просмотр (текущая версия первой, что изменилось, история), правка, постановка.
import { ctx, esc, fmt, plural, personName as managerName } from '../ctx.js';
import { TASK_FIELDS, isNewTask, hasUnseenChanges, isRework, changesSince, versionSnapshot, lastChange } from '../tasks.js';
import { diffDays, nextWorkday } from '../dates.js';
import { icon } from '../icons.js';

/** Статус задачи коротко - для списков. */
export function statusChip(t, today = ctx.today) {
  if (t.closed) return t.closed > t.deadline ? '<span class="chip amber">завершена с опозданием</span>' : '<span class="chip green">завершена</span>';
  if (isRework(t)) return `<span class="chip orange strong">на доработке${t.deadline < today ? ', срок прошёл' : ''}</span>`;
  if (t.deadline < today) return `<span class="chip red">${t.started ? 'застряла' : 'не начата'}, срок прошёл</span>`;
  return t.started ? '<span class="chip blue">в работе</span>' : '<span class="chip">новая</span>';
}

/** Пометка об изменениях: для сотрудника - "новая" / "изменена", для постановщика - видел ли сотрудник. */
export function changeMark(t, forEmployee) {
  if (forEmployee) {
    if (isNewTask(t)) return '<span class="chip blue strong">Новая</span>';
    if (hasUnseenChanges(t) && isRework(t)) return `<span class="chip orange strong">${icon('history')} Вернули на доработку</span>`;
    if (hasUnseenChanges(t)) return `<span class="chip orange strong">${icon('edit')} Изменена ${fmt(lastChange(t).at).slice(0, 5)}</span>`;
    if (t.history?.length) return `<span class="chip">изменена ${fmt(lastChange(t).at).slice(0, 5)}</span>`;
    return '';
  }
  if (isNewTask(t)) return '<span class="chip" data-tip="Сотрудник ещё не открывал задачу" tabindex="0">не открыта</span>';
  if (hasUnseenChanges(t)) return `<span class="chip orange" data-tip="Сотрудник ещё не открывал задачу после последнего ${isRework(t) ? 'возврата' : 'изменения'}" tabindex="0">${isRework(t) ? 'возврат не видел' : 'изменения не видел'}</span>`;
  if (t.history?.length) return `<span class="chip" data-tip="Изменений: ${t.history.length}. Сотрудник видел текущую версию" tabindex="0">изм. ${t.history.length}</span>`;
  return '';
}

const fieldValue = (k, v) => (k === 'deadline' ? fmt(v) : esc(v || '-'));

function diffBlock(changes) {
  return Object.entries(changes).map(([k, c]) => k === 'description' && c.from && c.to.startsWith(c.from)
    ? `<div class="diff"><span class="diff-k">${TASK_FIELDS[k]}</span><div><span class="muted small">дописано:</span><div class="diff-new"><ins>${esc(c.to.slice(c.from.length).trim())}</ins></div><details><summary>как было полностью</summary><div class="diff-old">${esc(c.from)}</div></details></div></div>`
    : k === 'description'
    ? `<div class="diff"><span class="diff-k">${TASK_FIELDS[k]}</span><div><div class="diff-new">${esc(c.to)}</div><details><summary>как было</summary><div class="diff-old">${esc(c.from || '-')}</div></details></div></div>`
    : `<div class="diff"><span class="diff-k">${TASK_FIELDS[k]}</span><div><s class="diff-old">${fieldValue(k, c.from)}</s> → <b class="diff-new">${fieldValue(k, c.to)}</b></div></div>`).join('');
}

/** Версия задачи целиком: название, срок, полное описание. */
function snapBox(s) {
  return `<div class="snap-box"><div><b>${esc(s.title)}</b> <span class="muted">· срок ${fmt(s.deadline)}</span></div><div class="tdesc">${s.description ? esc(s.description) : '<span class="muted">Описания нет.</span>'}</div></div>`;
}
const snapDetails = (t, v, label) => `<details class="snap"><summary>${label}</summary>${snapBox(versionSnapshot(t, v))}</details>`;

/**
 * Карточка задачи. seenFrom - версия, которую сотрудник видел до открытия
 * (чтобы показать "что изменилось с прошлого раза"), считается до отметки "просмотрено".
 */
export function taskView(e, t, { forEmployee, seenFrom }) {
  const today = ctx.today;
  const late = !t.closed && t.deadline < today;
  const since = forEmployee && seenFrom >= 1 && seenFrom < (t.version || 1) ? changesSince(t, seenFrom) : null;
  const h = lastChange(t);
  const history = [...(t.history || [])].reverse();
  const actions = forEmployee
    ? (t.closed ? `<button data-act="t-undo" data-id="${t.id}">Вернуть в работу</button>`
      : t.started ? `<button data-act="t-pause" data-id="${t.id}">Приостановить</button><button class="primary" data-act="t-done" data-id="${t.id}">Завершить</button>`
        : `<button class="primary" data-act="t-start" data-id="${t.id}">Начать выполнение</button>`)
    : (!t.closed ? `<button class="primary" data-act="task-edit" data-id="${t.id}">${icon('edit')} Изменить задачу</button>`
      : `<button class="primary" data-act="task-rework" data-id="${t.id}">${icon('history')} Вернуть на доработку</button>`);

  return `
    ${isRework(t) ? `<section class="callout red">
      <div class="callout-h">${icon('history')} Возвращена на доработку</div>
      <p class="muted small">${esc(managerName(h.by))} · ${fmt(h.at)} · была завершена ${fmt(h.closedWas)}</p>
      <div class="rework-note">"${esc(h.note)}"</div>
      ${(() => { const c = { ...(since && Object.keys(since).length ? since : h.changes) }; if (c.description && c.description.to.endsWith(h.note)) delete c.description; return diffBlock(c); })()}
      ${snapDetails(t, h.v - 1, `${icon('tasks')} Что было в задаче на момент сдачи ${fmt(h.closedWas)}`)}
    </section>` : ''}
    ${!isRework(t) && since && Object.keys(since).length ? `<section class="callout orange">
      <div class="callout-h">${icon('bell')} Задача изменилась с прошлого просмотра</div>
      <p class="muted small">${esc(managerName(h.by))} · ${fmt(h.at)}${h.note ? ` · "${esc(h.note)}"` : ''}</p>
      ${diffBlock(since)}
    </section>` : ''}
    ${forEmployee && seenFrom === 0 ? `<section class="callout blue"><div class="callout-h">${icon('tasks')} Новая задача от ${esc(managerName(t.by))}</div></section>` : ''}
    <dl class="tfacts">
      <div><dt>Статус</dt><dd>${statusChip(t)}</dd></div>
      <div><dt>Крайний срок</dt><dd class="${late ? 'red' : ''}">${fmt(t.deadline)}${late ? ` · прошёл ${diffDays(t.deadline, today)} дн. назад` : ''}</dd></div>
      <div><dt>Постановщик</dt><dd>${esc(managerName(t.by))}</dd></div>
      <div><dt>${forEmployee ? 'Поставлена' : 'Исполнитель'}</dt><dd>${forEmployee ? fmt(t.created) : `${esc(e.name)} · с ${fmt(t.created)}`}</dd></div>
    </dl>
    <h3 class="sec-h">Что нужно сделать</h3>
    <div class="tdesc">${t.description ? esc(t.description) : '<span class="muted">Описания нет.</span>'}</div>
    ${!forEmployee && t.history?.length ? `<p class="note">${hasUnseenChanges(t) ? `${icon('alert')} Сотрудник ещё не открывал задачу после изменения ${fmt(h.at)}.` : isNewTask(t) ? 'Сотрудник ещё не открывал задачу.' : `${icon('check')} Сотрудник видел актуальную версию.`}</p>` : ''}
    <details class="hist">
      <summary>${icon('history')} История изменений · ${(t.history?.length || 0) + 1} ${plural((t.history?.length || 0) + 1, 'версия', 'версии', 'версий')}</summary>
      <ol class="hist-list">
        ${history.map((x) => `<li class="${x.kind === 'rework' ? 'rw' : ''}"><div class="hist-h"><b>Версия ${x.v}</b> · ${fmt(x.at)} · ${esc(managerName(x.by))}${x.kind === 'rework' ? ` - возвращена на доработку (была завершена ${fmt(x.closedWas)})` : ''}${x.v === (t.version || 1) ? ' <span class="chip blue">текущая</span>' : ''}</div>
          ${x.note ? `<div class="muted small">${x.kind === 'rework' ? 'Комментарий' : 'Причина'}: "${esc(x.note)}"</div>` : ''}${diffBlock(x.changes)}
          ${x.kind === 'rework' ? snapDetails(t, x.v - 1, `Что было сдано ${fmt(x.closedWas)} (версия ${x.v - 1})`) : ''}
          ${x.v !== (t.version || 1) ? snapDetails(t, x.v, `Показать версию ${x.v} целиком`) : ''}</li>`).join('')}
        <li><div class="hist-h"><b>Версия 1</b> · ${fmt(t.created)} · ${esc(managerName(t.by))} - задача поставлена${t.history?.length ? '' : ' <span class="chip blue">текущая</span>'}</div>
          ${t.history?.length ? snapDetails(t, 1, 'Показать версию 1 целиком') : ''}</li>
      </ol>
    </details>
    <div class="m-foot">${forEmployee ? '' : `<span class="note grow">В рабочей версии изменения сохраняются в Битрикс24, сотрудник получает уведомление.</span>`}<button type="button" data-act="modal-close">Закрыть</button>${actions}</div>`;
}

export function editTaskForm(e, t) {
  return `<form data-form="task-edit" data-id="${t.id}">
    <label>Название<input name="title" required maxlength="120" value="${esc(t.title)}"></label>
    <label>Что нужно сделать<textarea name="description" rows="6" required>${esc(t.description || '')}</textarea></label>
    <div class="row2">
      <label>Крайний срок<input type="date" name="deadline" required value="${t.deadline}"></label>
      <label>Причина изменения (увидит сотрудник)<input name="note" maxlength="120" placeholder="Например: поставка пришла позже"></label>
    </div>
    <p class="note">${esc(e.name)} увидит актуальную версию, отметку "Изменена" и что именно поменялось. Прошлые версии сохранятся в истории.</p>
    <p class="form-err red" hidden></p><div class="m-foot"><button type="button" data-act="modal-close">Отмена</button><button class="primary">Сохранить изменения</button></div>
  </form>`;
}

export function giveTaskForm(e, team) {
  return `<form data-form="give-task" data-id="${e?.id || ''}">
    ${e ? '' : `<label>Кому<select name="emp" required>${team.map((x) => `<option value="${x.id}">${esc(x.name)} · ${esc(x.position)}</option>`).join('')}</select></label>`}
    <label>Название<input name="title" required maxlength="120" placeholder="Например: инструктаж по складской программе"></label>
    <label>Что нужно сделать<textarea name="description" rows="5" required placeholder="Шаги и ожидаемый результат. Новичку должно быть понятно без вопросов: что сделать, где, у кого спросить и как понять, что готово."></textarea></label>
    <label>Крайний срок<input type="date" name="deadline" required min="${ctx.today}" value="${nextWorkday(nextWorkday(ctx.today))}"></label>
    <p class="note">Задача появится у сотрудника с отметкой "Новая", в рабочей версии - и в Битрикс24.</p>
    <p class="form-err red" hidden></p><div class="m-foot"><button type="button" data-act="modal-close">Отмена</button><button class="primary">Поставить задачу</button></div>
  </form>`;
}

export function reworkForm(e, t) {
  const today = ctx.today;
  const suggested = t.deadline > today ? t.deadline : nextWorkday(nextWorkday(today));
  return `<form data-form="task-rework" data-id="${t.id}">
    <p><b>${esc(t.title)}</b><br><span class="muted small">${esc(e.name)} · завершена ${fmt(t.closed)}</span></p>
    <label>Что нужно доработать (увидит сотрудник)<textarea name="comment" rows="4" required maxlength="500" placeholder="Например: ценники стоят не на всех позициях в отделе Б3 - проверьте и сфотографируйте результат"></textarea></label>
    <label>Новый срок<input type="date" name="deadline" required min="${today}" value="${suggested}"></label>
    <label class="check inline"><input type="checkbox" name="addDesc" checked> Дописать комментарий в описание задачи (сданный текст останется в истории)</label>
    <p class="note">Задача вернётся к сотруднику в "В работе" с пометкой "Вернули на доработку" и вашим комментарием. В рабочей версии задача вернётся и в Битрикс24.</p>
    <p class="form-err red" hidden></p><div class="m-foot"><button type="button" data-act="modal-close">Отмена</button><button class="primary">Вернуть на доработку</button></div>
  </form>`;
}

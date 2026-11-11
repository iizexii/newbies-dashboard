import { todayISO, nextWorkday, diffDays } from './dates.js';
import { LEAVE_REASONS, DEFAULT_CHECKLIST } from './data.js';
import { loadState, saveState, resetState } from './store.js';
import { ctx, HR_NAME, esc, fmt, uid, plural, assess, tenureOf, resetCache, manager, managerName, deptName, emp, newcomers, findTask } from './ctx.js';
import { editTask, returnForRework, markSeen, isNewTask, hasUnseenChanges } from './tasks.js';
import { notifications, markAllRead } from './notify.js';
import { icon } from './icons.js';
import * as hr from './views/hr.js';
import { drawer } from './views/card.js';
import * as people from './views/people.js';
import { taskView, editTaskForm, giveTaskForm, reworkForm } from './views/task.js';
import { admin } from './views/admin.js';

ctx.today = todayISO();
ctx.state = loadState(ctx.today);
saveState(ctx.state);
const { ui } = ctx;
const UI_KEY = 'novichok.ui';
try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch { /* ignore */ }
ui.bellOpen = false;

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal');
const toastRoot = document.getElementById('toast');
const tip = document.getElementById('tip');

// ---------- навигация по ролям ----------
const PAGES = {
  hr: [
    { id: 'overview', icon: 'home', label: 'Обзор', title: 'Обзор', sub: 'Главное по новичкам за минуту: кто в зоне риска и где теряем людей.', render: hr.overview },
    { id: 'newbies', icon: 'users', label: 'Новички', title: 'Новички', sub: 'Все, кто работает меньше 90 дней, по отделам. Самые тревожные - сверху.', render: hr.newbies },
    { id: 'analytics', icon: 'chart', label: 'Аналитика уходов', title: 'Аналитика ранних уходов', sub: 'Где, когда и почему люди увольняются в первые 90 дней.', render: hr.analytics },
    { id: 'actions', icon: 'flag', label: 'Поручения', title: 'Поручения руководителям', sub: 'Задачи, которые HR поставил руководителям по новичкам. Просрочка 2+ рабочих дня - эскалация.', render: hr.actionsPage, badge: () => ctx.state.actions.filter((a) => a.status === 'open').length },
    { id: 'admin', icon: 'sliders', label: 'Админка', title: 'Админка', sub: 'Справочники: сотрудники, руководители, отделы и чек-листы первых дней.', render: admin },
  ],
  manager: [
    { id: 'team', icon: 'users', label: 'Мои новички', title: 'Мои новички', sub: 'Кто на месте, что тревожит и какие встречи пора провести.', render: people.managerTeam },
    { id: 'teamtasks', icon: 'tasks', label: 'Задачи новичков', title: 'Задачи новичков', sub: 'Задачи, которые вы поставили новичкам. Здесь же их можно изменить - сотрудник увидит, что поменялось.', render: people.managerTeamTasks },
    { id: 'mytasks', icon: 'flag', label: 'Поручения от HR', title: 'Поручения от HR', sub: 'Что HR попросил сделать по вашим новичкам.', render: people.managerTasks, badge: () => ctx.state.actions.filter((a) => a.status === 'open' && a.responsibleId === ui.asManager).length },
  ],
  employee: [
    { id: 'today', icon: 'sun', label: 'Мой день', title: 'Мой день', sub: 'Отметка на работе, задачи и ваш путь в первые 90 дней.', render: people.employeeToday },
    { id: 'tasks', icon: 'tasks', label: 'Мои задачи', title: 'Мои задачи', sub: '', render: people.employeeTasks, badge: () => (emp(ui.asEmployee)?.tasks || []).filter((t) => isNewTask(t) || hasUnseenChanges(t)).length },
  ],
};

function fixIdentity() {
  if (!manager(ui.asManager)) ui.asManager = ctx.state.managers[0]?.id || null;
  const list = newcomers();
  if (!list.some((e) => e.id === ui.asEmployee)) {
    // в демо сразу открываем новичка, у которого есть изменённая задача - так видно уведомления
    const byName = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    const pickOne = byName.find((e) => (e.tasks || []).some(hasUnseenChanges)) || byName.find((e) => (e.tasks || []).some((t) => !t.closed)) || byName[0];
    ui.asEmployee = pickOne?.id || null;
  }
  if (!PAGES[ui.role]) ui.role = 'hr';
  if (!PAGES[ui.role].some((p) => p.id === ui.page[ui.role])) ui.page[ui.role] = PAGES[ui.role][0].id;
}

function persist() {
  if (!saveState(ctx.state)) toast('Браузер не дал сохранить данные - изменения пропадут после перезагрузки', 'warn');
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ role: ui.role, asManager: ui.asManager, asEmployee: ui.asEmployee, page: ui.page })); } catch { /* ignore */ }
}
function commit(msg) { persist(); render(); if (msg) toast(msg); }

let toastTimer;
function toast(text, kind = 'ok') {
  toastRoot.innerHTML = `<div class="toast ${kind}">${esc(text)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastRoot.innerHTML = ''), 3500);
}

// ---------- отрисовка ----------
function sidebar() {
  const role = ui.role;
  const roleBtn = (r, l) => `<button class="${role === r ? 'on' : ''}" data-act="role" data-v="${r}" aria-pressed="${role === r}">${l}</button>`;
  let who = `<div class="who">${HR_NAME}<small>видит все отделы и управляет справочниками</small></div>`;
  if (role === 'manager') {
    who = `<select data-ident="asManager" aria-label="Руководитель">${ctx.state.departments.map((d) => `<optgroup label="${esc(d.name)}">${ctx.state.managers.filter((m) => m.dept === d.id).map((m) => `<option value="${m.id}" ${m.id === ui.asManager ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}</select>`;
  } else if (role === 'employee') {
    const list = newcomers().sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    who = `<select data-ident="asEmployee" aria-label="Сотрудник">${ctx.state.departments.map((d) => `<optgroup label="${esc(d.name)}">${list.filter((e) => e.dept === d.id).map((e) => `<option value="${e.id}" ${e.id === ui.asEmployee ? 'selected' : ''}>${esc(e.name)} · день ${assess(e).metrics.tenureDays}</option>`).join('')}</optgroup>`).join('')}</select>`;
  }
  return `<aside class="side">
    <div class="brand"><div class="logo">Н</div><div><b>Новичок</b><span>приложение для Битрикс24</span></div></div>
    <nav class="snav" aria-label="Разделы">${PAGES[role].map((p) => {
      const n = p.badge ? p.badge() : 0;
      return `<button class="${ui.page[role] === p.id ? 'on' : ''}" data-act="page" data-p="${p.id}" ${ui.page[role] === p.id ? 'aria-current="page"' : ''}>${icon(p.icon)}<span>${p.label}</span>${n ? `<i class="pill">${n}</i>` : ''}</button>`;
    }).join('')}</nav>
    <div class="role">
      <div class="cap">Демо-вход как</div>
      <div class="seg">${roleBtn('hr', 'HR')}${roleBtn('manager', 'Руководитель')}${roleBtn('employee', 'Сотрудник')}</div>
      ${who}
    </div>
    <div class="side-foot">
      <span class="src" data-tip="Сотрудники и задачи - синтетические. Интеграции с Битрикс24 в демо нет." tabindex="0">Источник: демо-данные</span>
      <span>Сегодня ${fmt(ctx.today)}</span>
      <button class="link" data-act="reset">Сбросить демо</button>
    </div>
  </aside>`;
}

const NOTIF_ICON = { task: 'tasks', edit: 'edit', pulse: 'chat', action: 'flag', alert: 'alert', done: 'check' };
function bell() {
  const list = notifications();
  return `<div class="bell-wrap">
    <button class="bell ${list.length ? 'has' : ''}" data-act="bell" aria-expanded="${ui.bellOpen}" aria-label="Уведомления: ${list.length}">${icon('bell')}${list.length ? `<i class="cnt-dot">${list.length}</i>` : ''}</button>
    ${ui.bellOpen ? `<div class="notif-pop" role="dialog" aria-label="Уведомления">
      <div class="np-head"><b>Уведомления</b>${list.some((n) => !n.sticky) ? '<button class="link" data-act="mark-all">прочитать все</button>' : ''}</div>
      ${list.length ? `<ul>${list.map((n) => `<li><button class="np-item ${n.kind}" data-act="${n.act}" ${n.id != null ? `data-id="${n.id}"` : ''} ${n.k ? `data-k="${n.k}"` : ''} data-from="bell">
        <span class="np-ico">${icon(NOTIF_ICON[n.kind] || 'bell')}</span>
        <span class="np-body"><b>${esc(n.title)}</b><span>${esc(n.text)}</span><small>${fmt(n.date)}${n.who ? ` · ${esc(n.who)}` : ''}</small></span>
      </button></li>`).join('')}</ul>` : '<p class="muted np-empty">Новых уведомлений нет.</p>'}
      <p class="note np-foot">В рабочей версии те же уведомления приходят в Битрикс24.</p>
    </div>` : ''}
  </div>`;
}

let focusKey = null;
function render() {
  // запоминаем элемент в фокусе, чтобы после перерисовки вернуть фокус на тот же элемент
  const a = document.activeElement;
  focusKey = a?.dataset?.act ? `[data-act="${a.dataset.act}"]${a.dataset.id ? `[data-id="${a.dataset.id}"]` : ''}${a.dataset.k ? `[data-k="${a.dataset.k}"]` : ''}${a.dataset.p ? `[data-p="${a.dataset.p}"]` : ''}` : null;
  resetCache();
  fixIdentity();
  saveUi();
  const page = PAGES[ui.role].find((p) => p.id === ui.page[ui.role]);
  const openE = ui.openId && ui.role !== 'employee' ? emp(ui.openId) : null;
  app.innerHTML = `${sidebar()}
    <main class="content">
      <header class="phead"><div><h1>${page.title}</h1>${page.sub ? `<p>${page.sub}</p>` : ''}</div>${bell()}</header>
      ${page.render()}
    </main>
    ${openE ? drawer(openE) : ''}`;
  if (!modalRoot.innerHTML) {
    const back = focusKey && document.querySelector(focusKey);
    if (back) back.focus({ preventScroll: true });
    else if (openE) document.querySelector('.drawer .d-head button')?.focus();
  }
}

// ---------- модальные окна ----------
let modalOpener = null;
function openModal(title, body, { wide = false } = {}) {
  if (!modalRoot.innerHTML) {
    const a = document.activeElement;
    modalOpener = a?.dataset?.act ? `[data-act="${a.dataset.act}"]${a.dataset.id ? `[data-id="${a.dataset.id}"]` : ''}` : null;
  }
  modalRoot.innerHTML = `<div class="m-scrim" data-act="modal-close"></div>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="m-head"><h2>${esc(title)}</h2><button class="icon" data-act="modal-close" aria-label="Закрыть">${icon('close')}</button></div>
      ${body}
    </div>`;
  (modalRoot.querySelector('input:not([type=hidden]):not([type=radio]), textarea, select') || modalRoot.querySelector('.m-foot button:last-child') || modalRoot.querySelector('.m-head button'))?.focus();
}
function closeModal() {
  modalRoot.innerHTML = '';
  const back = modalOpener && document.querySelector(modalOpener);
  if (back) back.focus(); else document.querySelector('.drawer .d-head button')?.focus();
  modalOpener = null;
}
const foot = (ok, cls = 'primary') => `<p class="form-err red" hidden></p><div class="m-foot"><button type="button" data-act="modal-close">Отмена</button><button class="${cls}">${ok}</button></div>`;
const formError = (form, text) => { const el = form.querySelector('.form-err'); el.textContent = text; el.hidden = false; };

function taskModal(e) {
  const a = assess(e);
  const day = a.metrics.tenureDays;
  const desc = [
    `${e.name}, ${e.position.toLowerCase()}, день ${day} из 90. Сигналы риска раннего ухода:`,
    ...a.reasons.map((r) => `- ${r.text}`),
    '',
    'Что сделать: встреча 1:1 на 15-20 минут - спросить, что мешает и что непонятно.',
    ...a.reasons.filter((r) => r.hint).map((r) => `- ${r.hint}`),
    'Итог отметить в карточке новичка.',
  ].join('\n');
  const mgs = ctx.state.managers.filter((m) => m.dept === e.dept);
  openModal('Поручение руководителю', `
    <form data-form="task" data-id="${e.id}">
      <label>Что сделать<input name="title" required value="${esc(`Встреча с новичком: ${e.name} (день ${day})`)}"></label>
      <div class="row2">
        <label>Кому<select name="responsible">${(mgs.length ? mgs : ctx.state.managers).map((m) => `<option value="${m.id}" ${m.id === e.managerId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
        <label>Срок<input type="date" name="deadline" required value="${nextWorkday(ctx.today)}" min="${ctx.today}"></label>
      </div>
      <label>Описание<textarea name="description" rows="8">${esc(desc)}</textarea></label>
      <p class="note">Руководитель получит уведомление. Если просрочит на 2+ рабочих дня, поручение появится у вас как эскалация. В рабочей версии задача уйдёт в Битрикс24.</p>
      ${foot('Поручить')}
    </form>`, { wide: true });
}

function empModal(e) {
  const isNew = !e;
  const d = e || { name: '', dept: ui.dept !== 'all' ? ui.dept : ctx.state.departments[0]?.id, position: '', managerId: '', mentor: '', hireDate: ctx.today };
  const positions = [...new Set(ctx.state.employees.map((x) => x.position))].sort();
  openModal(isNew ? 'Новый сотрудник' : 'Изменить сотрудника', `
    <form data-form="emp" data-id="${e?.id || ''}">
      <label>ФИО<input name="name" required maxlength="80" value="${esc(d.name)}" placeholder="Фамилия Имя"></label>
      <div class="row2">
        <label>Отдел<select name="dept" required>${ctx.state.departments.map((x) => `<option value="${x.id}" ${x.id === d.dept ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        <label>Должность<input name="position" required list="positions" value="${esc(d.position)}"></label>
      </div>
      <datalist id="positions">${positions.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>
      <div class="row2">
        <label>Руководитель<select name="managerId" required>
          <option value="">- выбрать -</option>
          ${ctx.state.departments.map((dep) => `<optgroup label="${esc(dep.name)}">${ctx.state.managers.filter((m) => m.dept === dep.id).map((m) => `<option value="${m.id}" ${m.id === d.managerId ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</optgroup>`).join('')}
        </select></label>
        <label>Дата выхода<input type="date" name="hireDate" required max="${ctx.today}" value="${d.hireDate}"></label>
      </div>
      <label>Наставник<input name="mentor" value="${esc(d.mentor)}" placeholder="не назначен"></label>
      ${isNew ? '<p class="note">Нет нужного руководителя - добавьте его в "Админка → Руководители".</p>' : ''}
      ${foot(isNew ? 'Добавить' : 'Сохранить')}
    </form>`);
}

function mgrModal(m) {
  openModal(m ? 'Изменить руководителя' : 'Новый руководитель', `
    <form data-form="mgr" data-id="${m?.id || ''}">
      <label>ФИО<input name="name" required maxlength="80" value="${esc(m?.name || '')}"></label>
      <div class="row2">
        <label>Отдел<select name="dept">${ctx.state.departments.map((d) => `<option value="${d.id}" ${d.id === m?.dept ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></label>
        <label>ID в Битрикс24<input name="b24Id" type="number" min="1" value="${m?.b24Id ?? ''}" placeholder="например, 118"></label>
      </div>
      ${foot(m ? 'Сохранить' : 'Добавить')}
    </form>`);
}

function mgrDeleteModal(m) {
  const list = ctx.state.employees.filter((e) => e.managerId === m.id);
  const others = ctx.state.managers.filter((x) => x.id !== m.id);
  if (list.length && !others.length) { toast('Это единственный руководитель - сначала добавьте другого', 'warn'); return; }
  openModal(`Удалить руководителя "${m.name}"?`, `
    <form data-form="mgr-del" data-id="${m.id}">
      ${list.length ? `<label>У него ${list.length} ${plural(list.length, 'сотрудник', 'сотрудника', 'сотрудников')}. Передать их:
        <select name="target">${others.map((o) => `<option value="${o.id}">${esc(o.name)} · ${esc(deptName(o.dept))}</option>`).join('')}</select></label>` : '<p>Сотрудников за ним не закреплено.</p>'}
      ${foot('Удалить', 'danger')}
    </form>`);
}

function leaveModal(e) {
  openModal(`Увольнение: ${e.name}`, `
    <form data-form="leave" data-id="${e.id}">
      <div class="row2">
        <label>Последний день<input type="date" name="leftDate" required min="${e.hireDate}" max="${ctx.today}" value="${ctx.today}"></label>
        <label>Причина<select name="reason">${LEAVE_REASONS.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
      </div>
      <p class="note">Причина попадёт в аналитику ранних уходов.</p>
      ${foot('Сохранить')}
    </form>`);
}

function confirmModal(title, text, act, id) {
  openModal(title, `<p>${text}</p><div class="m-foot"><button data-act="modal-close">Отмена</button><button class="danger" data-act="${act}" data-id="${id}">Удалить</button></div>`);
}

function deptDeleteModal(id) {
  const d = ctx.state.departments.find((x) => x.id === id);
  const count = ctx.state.employees.filter((e) => e.dept === id).length;
  const others = ctx.state.departments.filter((x) => x.id !== id);
  if (!others.length) { toast('Нельзя удалить последний отдел', 'warn'); return; }
  openModal(`Удалить отдел "${d.name}"?`, `
    <form data-form="dept-del" data-id="${id}">
      ${count ? `<label>В отделе ${count} ${plural(count, 'сотрудник', 'сотрудника', 'сотрудников')}. Перевести их и руководителей в:
        <select name="target">${others.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></label>` : '<p>В отделе нет сотрудников.</p>'}
      ${foot('Удалить отдел', 'danger')}
    </form>`);
}

function checklistModal(id) {
  const d = ctx.state.departments.find((x) => x.id === id);
  openModal(`Чек-лист первых дней: ${d.name}`, `
    <form data-form="dept-checklist" data-id="${id}">
      <label>Пункты, по одному в строке<textarea name="items" rows="7" required>${esc((d.checklist || []).map((c) => c.text).join('\n'))}</textarea></label>
      <p class="note">Что должно случиться с новичком в первые 3 рабочих дня. Отмечают новичок, руководитель или HR. Невыполненные пункты после 3-го рабочего дня - сигнал риска.</p>
      ${foot('Сохранить')}
    </form>`, { wide: true });
}

function giveTaskModal(e) {
  const team = e ? [] : newcomers().filter((x) => x.managerId === ui.asManager).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  openModal(e ? `Задача для ${e.name}` : 'Новая задача новичку', giveTaskForm(e, team), { wide: true });
}

function taskViewModal(id) {
  const found = findTask(id);
  if (!found) return;
  const { e, t } = found;
  const forEmployee = ui.role === 'employee';
  const seenFrom = t.seenVersion ?? 1;
  openModal(t.title, taskView(e, t, { forEmployee, seenFrom }), { wide: true });
  if (forEmployee && (isNewTask(t) || hasUnseenChanges(t))) { markSeen(t); persist(); render(); }
}

function editTaskModal(id) {
  const { e, t } = findTask(id);
  openModal(`Изменить задачу: ${e.name}`, editTaskForm(e, t), { wide: true });
}

function mentorModal(e) {
  const colleagues = ctx.state.employees.filter((x) => x.dept === e.dept && x.status === 'active' && x.id !== e.id && tenureOf(x) > 180).map((x) => x.name).sort();
  openModal(`Наставник для ${e.name}`, `
    <form data-form="mentor" data-id="${e.id}">
      <label>ФИО наставника<input name="mentor" required list="mentors" value="${esc(e.mentor)}" placeholder="Опытный сотрудник отдела"></label>
      <datalist id="mentors">${colleagues.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
      ${foot('Назначить')}
    </form>`);
}

function actionDoneModal(x) {
  openModal('Поручение выполнено', `
    <form data-form="action-done" data-id="${x.id}">
      <p><b>${esc(x.title)}</b></p>
      <label>Коротко: что выяснили или сделали (необязательно)<textarea name="comment" rows="3" placeholder="Например: не хватало обучения по ТСД, назначил наставника"></textarea></label>
      ${foot('Готово')}
    </form>`);
}

function rulesModal() {
  openModal('Как считается риск', `
    <p>Каждый тревожный сигнал даёт баллы. Считаем только для тех, кто работает меньше 90 дней.<br><b>5 и больше</b> - высокий риск, <b>2-4</b> - требует внимания, <b>0-1</b> - всё в порядке. Стрелка рядом с баллом - изменение за неделю.</p>
    <table class="mini-table"><tbody>
      <tr><td>Нет ни одной задачи в Б24 за первые 3+ рабочих дня</td><td class="num">+3</td></tr>
      <tr><td>5+ рабочих дней подряд без действий в задачах (3-4 дня)</td><td class="num">+3 (+1)</td></tr>
      <tr><td>Не отмечался на работе 2+ рабочих дня подряд (1 день)</td><td class="num">+2 (+1)</td></tr>
      <tr><td>Не назначен наставник</td><td class="num">+2</td></tr>
      <tr><td>Не проведена встреча 7-го / 30-го дня (через 3 дня после срока)</td><td class="num">+2</td></tr>
      <tr><td>Не проведена встреча 60-го дня</td><td class="num">+1</td></tr>
      <tr><td>Опрос новичка: оценка 1-2 по любому вопросу</td><td class="num">+2</td></tr>
      <tr><td>Чек-лист первых дней не выполнен к 3-му рабочему дню: половина и больше пунктов (меньше половины)</td><td class="num">+2 (+1)</td></tr>
      <tr><td>Не взялся за 3+ задачи, срок которых прошёл (1-2 задачи)</td><td class="num">+2 (+1)</td></tr>
      <tr><td>Начал, но не закончил 3+ задачи после срока - "застрял" (1-2 задачи)</td><td class="num">+2 (+1)</td></tr>
      <tr><td>Больше половины из 5+ завершённых задач закрыто позже срока</td><td class="num">+1</td></tr>
      <tr><td>Завершено меньше 40% задач (если задач 5+)</td><td class="num">+2</td></tr>
      <tr><td>Первая задача появилась позже 3-го рабочего дня</td><td class="num">+1</td></tr>
    </tbody></table>
    <p class="note">Срок "сегодня" ещё не просрочка. Задача, завершённая позже срока, перестаёт быть просроченной; опоздания учитываются, только когда это система. "Действие в задаче" - сотрудник сам начал или завершил задачу. Рабочие дни - Пн-Пт. Веса подобраны экспертно; проверить их можно на реальной истории увольнений.</p>`, { wide: true });
}

// ---------- события ----------
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const myTask = (id) => { const f = findTask(id); return f && f.e.id === ui.asEmployee ? f.t : null; };

/** Открытие раздела считается прочтением его уведомлений. */
function markPageSeen(role, p) {
  if (role === 'manager' && p === 'mytasks') {
    for (const x of ctx.state.actions) if (x.responsibleId === ui.asManager) { x.seenByManager = true; if (x.remindedAt) x.remindSeen = true; }
  }
  if (role === 'hr' && p === 'actions') for (const x of ctx.state.actions) if (x.status === 'done') x.hrSeen = true;
  persist();
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (ui.bellOpen && !ev.target.closest('.notif-pop') && el?.dataset.act !== 'bell') {
    ui.bellOpen = false;
    if (!el) { render(); return; }
  }
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const S = ctx.state;
  if (el.dataset.from === 'bell') ui.bellOpen = false;
  switch (act) {
    case 'role': ui.role = el.dataset.v; ui.openId = null; render(); break;
    case 'page': ui.page[ui.role] = el.dataset.p; ui.openId = null; markPageSeen(ui.role, el.dataset.p); render(); window.scrollTo(0, 0); break;
    case 'bell': ui.bellOpen = !ui.bellOpen; render(); if (ui.bellOpen) document.querySelector('.notif-pop button')?.focus(); break;
    case 'mark-all': markAllRead(); commit('Уведомления прочитаны'); break;
    case 'goto-pulse': ui.page.employee = 'today'; render(); document.getElementById('pulse')?.scrollIntoView({ block: 'center' }); document.querySelector('#pulse input')?.focus(); break;
    case 'notif-action': { const x = S.actions.find((a) => a.id === id); x.seenByManager = true; if (x.remindedAt) x.remindSeen = true; ui.page.manager = 'mytasks'; commit(); break; }
    case 'notif-escalation': ui.page.hr = 'actions'; ui.openId = null; render(); break;
    case 'notif-done': { S.actions.find((a) => a.id === id).hrSeen = true; ui.page.hr = 'actions'; ui.openId = null; commit(); break; }
    case 'notif-pulse': { const p = emp(id).pulse[el.dataset.k]; p[ui.role === 'hr' ? 'hrSeen' : 'mgrSeen'] = true; ui.openId = id; commit(); break; }
    case 'remind': { const x = S.actions.find((a) => a.id === id); x.remindedAt = ctx.today; x.remindSeen = false; commit(`Напоминание отправлено: ${managerName(x.responsibleId)}`); break; }
    case 'goto-newbies': Object.assign(ui, { dept: 'all', tenure: 'adapt', risk: el.dataset.risk, manager: 'all', q: '' }); ui.page.hr = 'newbies'; render(); break;
    case 'goto-dept': Object.assign(ui, { dept: id, tenure: 'adapt', risk: 'all', manager: 'all', q: '' }); ui.page.hr = 'newbies'; render(); break;
    case 'dept': ui.dept = id; ui.manager = 'all'; render(); break;
    case 'an-dept': ui.anDept = id; render(); break;
    case 'admin-tab': ui.adminTab = id; render(); break;
    case 'tt-done': ui.ttDone = el.checked; render(); break;
    case 'sort': {
      const key = el.dataset.key;
      ui.sort = ui.sort.key === key ? { key, dir: -ui.sort.dir } : { key, dir: ['name', 'manager', 'dept'].includes(key) ? 1 : -1 };
      document.getElementById('tbl').innerHTML = hr.table();
      document.querySelector(`[data-act="sort"][data-key="${key}"]`)?.focus();
      break;
    }
    case 'adm-sort': {
      const key = el.dataset.key;
      ui.adm.sort = ui.adm.sort.key === key ? { key, dir: -ui.adm.sort.dir } : { key, dir: 1 };
      render(); break;
    }
    case 'open': ui.openId = id; ui.showAllTasks = false; render(); break;
    case 'close': ui.openId = null; render(); break;
    case 'all-tasks': ui.showAllTasks = !ui.showAllTasks; render(); break;
    case 'rules': rulesModal(); break;
    case 'add-emp': empModal(null); break;
    case 'edit-emp': empModal(emp(id)); break;
    case 'task': taskModal(emp(id)); break;
    case 'task-view': taskViewModal(id); break;
    case 'task-edit': editTaskModal(id); break;
    case 'task-rework': { const { e, t } = findTask(id); openModal(`На доработку: ${e.name}`, reworkForm(e, t), { wide: true }); break; }
    case 'leave': leaveModal(emp(id)); break;
    case 'unleave': { const e = emp(id); Object.assign(e, { status: 'active', leftDate: null, leftReason: null }); commit('Сотрудник снова в работающих'); break; }
    case 'del-emp': confirmModal('Удалить сотрудника?', `"${esc(emp(id).name)}" будет удалён вместе с историей. Если человек уволился, лучше "Отметить увольнение" в карточке: тогда он останется в аналитике.`, 'del-emp-yes', id); break;
    case 'del-emp-yes':
      S.employees = S.employees.filter((e) => e.id !== id);
      S.actions = S.actions.filter((x) => x.employeeId !== id);
      if (ui.openId === id) ui.openId = null;
      closeModal(); commit('Сотрудник удалён'); break;
    case 'checkin': { const e = emp(id); e.checkins = { ...(e.checkins || {}), [el.dataset.k]: ctx.today }; commit('Встреча отмечена - риск пересчитан'); break; }
    case 'checkin-undo': { const e = emp(id); delete e.checkins[el.dataset.k]; commit(); break; }
    case 'ob-toggle': {
      const e = emp(id);
      e.onboarding = { ...(e.onboarding || {}) };
      if (e.onboarding[el.dataset.k]) delete e.onboarding[el.dataset.k]; else e.onboarding[el.dataset.k] = ctx.today;
      commit(); break;
    }
    case 'action-done': actionDoneModal(S.actions.find((a) => a.id === id)); break;
    case 'give-task': giveTaskModal(id ? emp(id) : null); break;
    case 'mentor': mentorModal(emp(id)); break;
    case 'check-in': { const e = emp(ui.asEmployee); e.attendance = { ...(e.attendance || {}), [ctx.today]: nowHM() }; commit('Отметка сохранена. Хорошего дня!'); break; }
    case 'checkout-undo': { const e = emp(ui.asEmployee); delete e.attendance[ctx.today]; commit(); break; }
    case 't-start': { const t = myTask(id); t.started = ctx.today; markSeen(t); if (modalRoot.innerHTML) closeModal(); commit('Задача в работе'); break; }
    case 't-done': { const t = myTask(id); t.started = t.started || ctx.today; t.closed = ctx.today; markSeen(t); if (modalRoot.innerHTML) closeModal(); commit('Задача завершена'); break; }
    case 't-undo': { const t = myTask(id); t.closed = null; t.started = t.started || ctx.today; if (modalRoot.innerHTML) closeModal(); commit(t.deadline < ctx.today ? 'Задача снова в работе. Срок уже прошёл - её видно как просроченную' : 'Задача снова в работе'); break; }
    case 't-pause': { const t = myTask(id); t.started = null; if (modalRoot.innerHTML) closeModal(); commit('Задача приостановлена - снова в "Новых"'); break; }
    case 'add-mgr': mgrModal(null); break;
    case 'edit-mgr': mgrModal(manager(id)); break;
    case 'del-mgr': mgrDeleteModal(manager(id)); break;
    case 'dept-up': case 'dept-down': {
      const i = S.departments.findIndex((d) => d.id === id);
      const j = act === 'dept-up' ? i - 1 : i + 1;
      [S.departments[i], S.departments[j]] = [S.departments[j], S.departments[i]];
      commit(); break;
    }
    case 'dept-del': deptDeleteModal(id); break;
    case 'dept-checklist': checklistModal(id); break;
    case 'modal-close': closeModal(); break;
    case 'reset':
      openModal('Сбросить демо?', '<p>Все изменения (сотрудники, отделы, поручения, отметки, правки задач) удалятся, данные сгенерируются заново.</p><div class="m-foot"><button data-act="modal-close">Отмена</button><button class="danger" data-act="reset-yes">Сбросить</button></div>');
      break;
    case 'reset-yes':
      ctx.state = resetState(ctx.today);
      Object.assign(ui, { dept: 'all', openId: null, anDept: 'all', asEmployee: null, q: '', risk: 'all', tenure: 'adapt', manager: 'all' });
      closeModal(); commit('Демо-данные пересозданы'); break;
  }
});

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]';
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') {
    if (modalRoot.innerHTML) closeModal();
    else if (ui.bellOpen) { ui.bellOpen = false; render(); document.querySelector('[data-act=bell]')?.focus(); }
    else if (ui.openId) { const back = `[data-act="open"][data-id="${ui.openId}"]`; ui.openId = null; render(); document.querySelector(back)?.focus(); }
    tip.hidden = true;
  }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('[role=button][data-act], tr[data-act], li[data-act]')) { ev.preventDefault(); ev.target.click(); }
  // Фокус не уходит за пределы открытого окна (модальное окно, уведомления, карточка).
  if (ev.key === 'Tab') {
    const dlg = modalRoot.querySelector('.modal') || (ui.bellOpen && document.querySelector('.notif-pop')) || document.querySelector('.drawer');
    if (!dlg) return;
    const f = [...dlg.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!dlg.contains(document.activeElement)) { ev.preventDefault(); first.focus(); }
    else if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
});

document.addEventListener('input', (ev) => {
  const t = ev.target;
  if (t.dataset.filter) {
    ui[t.dataset.filter] = t.value;
    if (t.dataset.filter === 'q') document.getElementById('tbl').innerHTML = hr.table();
    else render();
  } else if (t.dataset.adm) {
    ui.adm[t.dataset.adm] = t.value;
    render();
    if (t.dataset.adm === 'q') { const s = document.querySelector('[data-adm=q]'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }
});

document.addEventListener('change', (ev) => {
  const t = ev.target;
  if (t.dataset.ident) { ui[t.dataset.ident] = t.value; ui.openId = null; render(); return; }
  const id = t.dataset.rename;
  if (!id) return;
  const name = t.value.trim();
  if (!name) { toast('Название отдела не может быть пустым', 'warn'); t.value = deptName(id); return; }
  ctx.state.departments.find((d) => d.id === id).name = name;
  commit('Отдел переименован');
});

document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  const id = form.dataset.id;
  const S = ctx.state;
  switch (form.dataset.form) {
    case 'task':
      S.actions.push({ id: uid('a'), employeeId: id, title: fd.title.trim(), description: fd.description, responsibleId: fd.responsible, deadline: fd.deadline, created: ctx.today, status: 'open', doneAt: null, seenByManager: false, hrSeen: true, remindedAt: null });
      closeModal(); commit(`Поручено: ${managerName(fd.responsible)}, срок ${fmt(fd.deadline)}`); break;
    case 'emp': {
      const name = fd.name.trim().replace(/\s+/g, ' ');
      const dup = S.employees.find((e) => e.name.toLowerCase() === name.toLowerCase() && e.id !== id);
      const problem = !name ? 'Укажите ФИО' : fd.hireDate > ctx.today ? 'Дата выхода не может быть в будущем' : !fd.managerId ? 'Выберите руководителя' : dup ? `"${dup.name}" уже есть (${deptName(dup.dept)})` : '';
      if (problem) { formError(form, problem); return; }
      const fields = { name, dept: fd.dept, position: fd.position.trim(), managerId: fd.managerId, mentor: fd.mentor.trim(), hireDate: fd.hireDate };
      if (id) {
        const e = emp(id);
        if (fields.mentor && fields.mentor !== e.mentor) fields.mentorSince = ctx.today;
        Object.assign(e, fields); closeModal(); commit('Данные сохранены');
      } else {
        const e = { id: uid('e'), ...fields, status: 'active', leftDate: null, leftReason: null, checkins: {}, tasks: [], attendance: {}, pulse: {}, onboarding: {} };
        S.employees.push(e);
        closeModal(); commit(`${name} - в "${deptName(e.dept)}"`);
      }
      break;
    }
    case 'mgr': {
      const name = fd.name.trim().replace(/\s+/g, ' ');
      if (S.managers.some((m) => m.name.toLowerCase() === name.toLowerCase() && m.id !== id)) { formError(form, 'Такой руководитель уже есть'); return; }
      const fields = { name, dept: fd.dept, b24Id: fd.b24Id ? Number(fd.b24Id) : null };
      if (id) Object.assign(manager(id), fields); else S.managers.push({ id: uid('m'), ...fields });
      closeModal(); commit(id ? 'Руководитель обновлён' : 'Руководитель добавлен'); break;
    }
    case 'mgr-del':
      for (const e of S.employees) if (e.managerId === id) e.managerId = fd.target;
      for (const x of S.actions) if (x.responsibleId === id && x.status === 'open') x.responsibleId = fd.target;
      S.managers = S.managers.filter((m) => m.id !== id);
      closeModal(); commit('Руководитель удалён'); break;
    case 'leave': {
      const e = emp(id);
      Object.assign(e, { status: 'left', leftDate: fd.leftDate, leftReason: fd.reason });
      closeModal(); commit(diffDays(e.hireDate, e.leftDate) + 1 <= 90 ? 'Отмечено. Ранний уход попал в аналитику' : 'Увольнение отмечено'); break;
    }
    case 'dept-add': {
      const name = fd.name.trim();
      if (S.departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) { toast('Такой отдел уже есть', 'warn'); return; }
      S.departments.push({ id: uid('d'), name, checklist: structuredClone(DEFAULT_CHECKLIST) });
      commit(`Отдел "${name}" добавлен, чек-лист первых дней - стандартный`); break;
    }
    case 'dept-del':
      for (const e of S.employees) if (e.dept === id) e.dept = fd.target;
      for (const m of S.managers) if (m.dept === id) m.dept = fd.target;
      S.departments = S.departments.filter((d) => d.id !== id);
      if (ui.dept === id) ui.dept = 'all';
      if (ui.anDept === id) ui.anDept = 'all';
      if (ui.adm.dept === id) ui.adm.dept = 'all';
      closeModal(); commit('Отдел удалён'); break;
    case 'dept-checklist': {
      const d = S.departments.find((x) => x.id === id);
      const lines = [...new Set(fd.items.split('\n').map((l) => l.trim()).filter(Boolean))];
      if (!lines.length) { formError(form, 'Нужен хотя бы один пункт'); return; }
      // у неизменённых пунктов сохраняем id, чтобы не потерять отметки новичков
      d.checklist = lines.map((text) => (d.checklist || []).find((c) => c.text === text) || { id: uid('c'), text });
      closeModal(); commit('Чек-лист сохранён'); break;
    }
    case 'give-task': {
      const e = emp(id || fd.emp);
      if (!fd.title.trim() || !fd.description.trim()) { formError(form, 'Нужны и название, и описание: что именно сделать'); return; }
      e.tasks.push({ id: uid('t'), title: fd.title.trim(), description: fd.description.trim(), created: ctx.today, deadline: fd.deadline, started: null, closed: null, by: ui.role === 'manager' ? ui.asManager : 'hr', version: 1, history: [], seenVersion: 0 });
      closeModal(); commit(`Задача поставлена: ${e.name}. Он увидит её с отметкой "Новая"`); break;
    }
    case 'task-edit': {
      const { e, t } = findTask(id);
      if (fd.deadline < t.created) { formError(form, `Срок не может быть раньше даты постановки (${fmt(t.created)})`); return; }
      if (!fd.title.trim() || !fd.description.trim()) { formError(form, 'Название и описание не могут быть пустыми'); return; }
      const changed = editTask(t, { title: fd.title, description: fd.description, deadline: fd.deadline }, ui.role === 'manager' ? ui.asManager : 'hr', ctx.today, fd.note || '');
      if (!changed) { formError(form, 'Ничего не изменилось'); return; }
      closeModal(); commit(`Задача изменена (версия ${t.version}). ${e.name.split(' ')[1] || e.name} получит уведомление`); break;
    }
    case 'task-rework': {
      const { e, t } = findTask(id);
      if (!fd.comment.trim()) { formError(form, 'Напишите, что нужно доработать'); return; }
      if (fd.deadline < ctx.today) { formError(form, 'Новый срок не может быть в прошлом'); return; }
      returnForRework(t, ui.role === 'manager' ? ui.asManager : 'hr', ctx.today, fd.comment, fd.deadline, { addToDescription: fd.addDesc === 'on' });
      closeModal(); commit(`Задача возвращена на доработку. ${e.name.split(' ')[1] || e.name} получит уведомление`); break;
    }
    case 'pulse': {
      const e = emp(id);
      e.pulse = { ...(e.pulse || {}), [form.dataset.k]: { date: ctx.today, clarity: +fd.clarity, support: +fd.support, comfort: +fd.comfort, comment: (fd.comment || '').trim(), hrSeen: false, mgrSeen: false } };
      commit('Спасибо! Ответы получат HR и руководитель'); break;
    }
    case 'mentor': { const e = emp(id); const m = fd.mentor.trim(); if (m !== e.mentor) e.mentorSince = ctx.today; e.mentor = m; closeModal(); commit('Наставник назначен'); break; }
    case 'action-done': {
      const x = S.actions.find((a) => a.id === id);
      Object.assign(x, { status: 'done', doneAt: ctx.today, comment: fd.comment.trim(), hrSeen: false });
      closeModal(); commit('Поручение закрыто - HR увидит результат'); break;
    }
  }
});

// Подсказки: по наведению мыши и по фокусу с клавиатуры.
function placeTip(x, y) {
  const left = Math.max(8, Math.min(x, window.innerWidth - tip.offsetWidth - 8));
  const top = y + tip.offsetHeight + 8 > window.innerHeight ? y - tip.offsetHeight - 28 : y;
  tip.style.transform = `translate(${left}px, ${top}px)`;
}
document.addEventListener('mouseover', (ev) => {
  const el = ev.target.closest('[data-tip]');
  if (!el) { if (!document.activeElement?.dataset?.tip) tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
});
document.addEventListener('mousemove', (ev) => {
  if (tip.hidden || !ev.target.closest('[data-tip]')) return;
  placeTip(ev.clientX + 14, ev.clientY + 18);
});
document.addEventListener('focusin', (ev) => {
  const el = ev.target.closest?.('[data-tip]');
  if (!el) { tip.hidden = true; return; }
  tip.textContent = el.dataset.tip;
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  placeTip(r.left, r.bottom + 8);
});
document.addEventListener('focusout', () => { tip.hidden = true; });
window.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

render();

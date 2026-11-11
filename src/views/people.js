// Кабинет руководителя и кабинет сотрудника (демо-вход через переключатель в сайдбаре).
import { ctx, esc, fmt, plural, assess, manager, managerName, deptName, emp, newcomers, checklistOf, trendMark, help } from '../ctx.js';
import { PULSE_QUESTIONS } from '../risk.js';
import { isNewTask, hasUnseenChanges } from '../tasks.js';
import { isEscalated, overdueWorkdays } from '../notify.js';
import { timeline, checkinList, checklistBlock } from './card.js';
import { statusChip, changeMark } from './task.js';
import { badge } from './hr.js';
import { workdaysBetween, addDays, diffDays } from '../dates.js';
import { icon } from '../icons.js';

const firstLine = (s) => String(s || '').split('\n')[0];

// ================= Руководитель =================
export function managerTeam() {
  const mg = manager(ctx.ui.asManager);
  if (!mg) return '<div class="empty">Выберите руководителя в боковой панели.</div>';
  const team = newcomers().filter((e) => e.managerId === mg.id)
    .sort((a, b) => assess(b).score - assess(a).score);
  const fromHr = ctx.state.actions.filter((x) => x.responsibleId === mg.id && x.status === 'open');
  const notHere = team.filter((e) => !assess(e).metrics.checkedInToday);
  return `
    <section class="kpis">
      <div class="kpi"><b>${team.length}</b><span>${plural(team.length, 'новичок', 'новичка', 'новичков')} в команде</span><small>работают меньше 90 дней</small></div>
      <div class="kpi red"><b>${team.filter((e) => assess(e).level === 'high').length}</b><span>с высоким риском</span><small>поговорите с ними на этой неделе</small></div>
      <div class="kpi"><b>${notHere.length}</b><span>${notHere.length === 1 ? 'не отметился' : 'не отметились'} сегодня</span><small>${notHere.length ? esc(notHere.slice(0, 2).map((e) => e.name.split(' ')[0]).join(', ')) + (notHere.length > 2 ? '…' : '') : 'все на месте'}</small></div>
      <div class="kpi amber click" data-act="page" data-p="mytasks" role="button" tabindex="0"><b>${fromHr.length}</b><span>${plural(fromHr.length, 'поручение', 'поручения', 'поручений')} от HR</span><small>${fromHr.some((x) => isEscalated(x, ctx.today)) ? '<span class="red">есть просроченные - HR видит</span>' : 'открыть список →'}</small></div>
    </section>
    ${team.length ? `<div class="cards">${team.map(teamCard).join('')}</div>` : '<div class="empty">Сейчас в команде нет новичков.</div>'}`;
}

function teamCard(e) {
  const a = assess(e);
  const m = a.metrics;
  const next = m.checkins.find((c) => !c.done && (c.due || c.overdue)) || null;
  const openTasks = (e.tasks || []).filter((t) => !t.closed).length;
  const lp = m.lastPulse;
  const lowQ = lp ? PULSE_QUESTIONS.filter((q) => lp.answer[q.key] <= 2) : [];
  return `<article class="pcard ${a.level}">
    <header>
      <div><b>${esc(e.name)}</b><small class="muted">${esc(e.position)}</small></div>
      <span class="nowrap">${badge(a)} ${trendMark(e)}</span>
    </header>
    ${timeline(m)}
    <ul class="pc-facts">
      <li>${m.checkedInToday ? `<span class="ok">✓</span> На работе с ${m.checkedInToday}` : '<span class="red">✕</span> Сегодня не отметился'}</li>
      <li>${e.mentor ? `<span class="ok">✓</span> Наставник: ${esc(e.mentor)}` : '<span class="red">✕</span> Нет наставника'}</li>
      ${m.checklistTotal ? `<li>${m.checklistDone === m.checklistTotal ? '<span class="ok">✓</span>' : '<span class="red">✕</span>'} Первые дни: ${m.checklistDone} из ${m.checklistTotal} пунктов</li>` : ''}
      ${lp ? `<li>${lowQ.length ? `<span class="red">✕</span> Опрос ${lp.day}-го дня: "${esc(lowQ[0].label)}" - ${lp.answer[lowQ[0].key]} из 5` : `<span class="ok">✓</span> Опрос ${lp.day}-го дня: всё хорошо`}</li>` : ''}
      <li>Задач открыто: <b>${openTasks}</b>${m.overdueNotStarted ? `, <span class="red">не взялся в срок: ${m.overdueNotStarted}</span>` : ''}${m.overdueStuck ? `, <span class="red">застряло: ${m.overdueStuck}</span>` : ''}</li>
    </ul>
    ${a.reasons.length ? `<div class="pc-why"><b>Что тревожит:</b><ul>${a.reasons.slice(0, 3).map((r) => `<li>${esc(r.text)}</li>`).join('')}</ul></div>` : '<div class="pc-why ok">Всё идёт нормально.</div>'}
    <footer>
      ${next ? `<button class="primary small" data-act="checkin" data-id="${e.id}" data-k="${next.key}">Провёл встречу ${next.day}-го дня</button>` : ''}
      <button class="small" data-act="give-task" data-id="${e.id}">Дать задачу</button>
      ${!e.mentor ? `<button class="small" data-act="mentor" data-id="${e.id}">Назначить наставника</button>` : ''}
      <button class="link" data-act="open" data-id="${e.id}">Подробнее</button>
    </footer>
  </article>`;
}

/** Задачи, которые руководитель поставил своим новичкам: правка, история, видел ли сотрудник. */
export function managerTeamTasks() {
  const mg = manager(ctx.ui.asManager);
  if (!mg) return '';
  const showDone = ctx.ui.ttDone;
  const team = newcomers().filter((e) => e.managerId === mg.id);
  const rows = team.flatMap((e) => (e.tasks || []).filter((t) => showDone || !t.closed).map((t) => ({ e, t })))
    .sort((x, y) => (!!x.t.closed - !!y.t.closed) || (x.t.deadline < y.t.deadline ? -1 : 1));
  const unseen = rows.filter(({ t }) => hasUnseenChanges(t) || isNewTask(t)).length;
  return `
    <section class="toolbar">
      <label class="check"><input type="checkbox" data-act="tt-done" ${showDone ? 'checked' : ''}> Показать завершённые</label>${help('Завершённую задачу можно вернуть на доработку с комментарием: она снова появится у сотрудника в "В работе".')}
      <span class="muted small">${rows.length} ${plural(rows.length, 'задача', 'задачи', 'задач')}${unseen ? ` · ${unseen} сотрудники ещё не открывали после постановки или изменения` : ''}</span>
      <span class="grow"></span>
      ${team.length ? `<button class="primary" data-act="give-task">${icon('plus')} Поставить задачу</button>` : ''}
    </section>
    ${rows.length ? `<div class="table-wrap"><table class="list">
      <thead><tr><th>Задача</th><th>Исполнитель</th><th>Срок</th><th>Статус</th><th>Изменения ${help('Если поменять название, описание или срок, сотрудник увидит актуальную версию с отметкой "Изменена" и что поменялось. Прошлые версии хранятся в истории.')}</th><th></th></tr></thead>
      <tbody>${rows.map(({ e, t }) => `<tr data-act="task-view" data-id="${t.id}">
        <td><b>${esc(t.title)}</b><div class="muted clamp">${esc(firstLine(t.description))}</div></td>
        <td>${esc(e.name)}</td>
        <td class="nowrap ${!t.closed && t.deadline < ctx.today ? 'red' : ''}">${fmt(t.deadline)}</td>
        <td>${statusChip(t)}</td>
        <td>${changeMark(t, false)}</td>
        <td class="row-actions">${!t.closed ? `<button class="small" data-act="task-edit" data-id="${t.id}">${icon('edit')} Изменить</button>` : `<button class="small" data-act="task-rework" data-id="${t.id}">${icon('history')} На доработку</button>`}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">Открытых задач у новичков нет.</div>'}`;
}

export function managerTasks() {
  const mg = manager(ctx.ui.asManager);
  if (!mg) return '';
  const list = ctx.state.actions.filter((x) => x.responsibleId === mg.id)
    .sort((a, b) => (a.status === b.status ? (a.deadline < b.deadline ? -1 : 1) : a.status === 'open' ? -1 : 1));
  if (!list.length) return '<div class="empty">Поручений от HR нет. Они появляются, когда HR видит новичка с высоким риском.</div>';
  return `<div class="task-list">${list.map((x) => {
    const e = emp(x.employeeId);
    const late = x.status === 'open' && x.deadline < ctx.today;
    const esc8 = isEscalated(x, ctx.today);
    return `<article class="titem ${x.status} ${late ? 'late' : ''}">
      <div class="ti-main">
        <b>${esc(x.title)} ${!x.seenByManager ? '<span class="chip blue strong">Новое</span>' : ''}${x.remindedAt && x.status === 'open' ? `<span class="chip orange strong">HR напомнил ${fmt(x.remindedAt).slice(0, 5)}</span>` : ''}</b>
        <small class="muted">от HR · поставлено ${fmt(x.created)} · <span class="${late ? 'red' : ''}">срок ${fmt(x.deadline)}${late ? ' (просрочено)' : ''}</span></small>
        ${esc8 ? `<small class="red">${icon('alert')} Просрочено на ${overdueWorkdays(x, ctx.today)} раб. дн. - HR видит это в уведомлениях</small>` : ''}
        <details ${!x.seenByManager ? 'open' : ''}><summary>описание</summary><div class="tdesc">${esc(x.description)}</div></details>
      </div>
      <div class="ti-act">
        ${x.status === 'open'
          ? `${e ? `<button class="small" data-act="open" data-id="${e.id}">Карточка</button>` : ''}<button class="primary small" data-act="action-done" data-id="${x.id}">Выполнено</button>`
          : `<span class="ok">✓ ${fmt(x.doneAt)}</span>`}
      </div>
    </article>`;
  }).join('')}</div>`;
}

// ================= Сотрудник =================
export function employeeToday() {
  const e = emp(ctx.ui.asEmployee);
  if (!e) return '<div class="empty">Выберите сотрудника в боковой панели.</div>';
  const a = assess(e);
  const m = a.metrics;
  const first = e.name.split(' ')[1] || e.name;
  const open = (e.tasks || []).filter((t) => !t.closed);
  const overdue = open.filter((t) => t.deadline < ctx.today);
  const fresh = open.filter(isNewTask);
  const changed = open.filter(hasUnseenChanges);
  const next = m.checkins.find((c) => !c.done);
  const wds = workdaysBetween(addDays(ctx.today, -27), ctx.today).filter((d) => d >= e.hireDate);
  const att = e.attendance || {};
  return `
    <section class="hello">
      <h2>Добрый день, ${esc(first)}!</h2>
      <p>Вы с нами <b>${m.tenureDays}-й день</b>${m.tenureDays <= 90 ? ' из 90 дней адаптации' : ''}. ${esc(deptName(e.dept))}, ${esc(e.position.toLowerCase())}.</p>
    </section>
    ${fresh.length || changed.length ? `<section class="callout ${changed.length ? 'orange' : 'blue'}">
      <div class="callout-h">${icon('bell')} ${[fresh.length ? `${fresh.length} ${plural(fresh.length, 'новая задача', 'новые задачи', 'новых задач')}` : '', changed.length ? `${changed.length} ${plural(changed.length, 'задача изменилась', 'задачи изменились', 'задач изменились')}` : ''].filter(Boolean).join(' и ')}</div>
      <ul class="plain-links">${[...fresh, ...changed].slice(0, 4).map((t) => `<li><button class="link" data-act="task-view" data-id="${t.id}">${esc(t.title)}</button> ${changeMark(t, true)}</li>`).join('')}</ul>
    </section>` : ''}
    ${m.pulseDue ? pulseCard(e, m.pulseDue) : ''}
    <div class="grid2">
      <section class="card checkin-card">
        <h3>Отметка на работе</h3>
        ${m.checkedInToday
          ? `<div class="here">✓ Вы отметились сегодня в <b>${m.checkedInToday}</b></div><button class="link" data-act="checkout-undo">отменить отметку</button>`
          : `<button class="big primary" data-act="check-in">Я на работе</button><p class="note">Нажмите, когда пришли. Руководитель видит, кто на месте.</p>`}
        <div class="att">${wds.map((d) => `<i class="${att[d] ? 'on' : d === ctx.today ? 'cur' : ''}" data-tip="${fmt(d)}: ${att[d] ? `отметка в ${att[d]}` : d === ctx.today ? 'сегодня' : 'нет отметки'}"></i>`).join('')}</div>
        <div class="legend"><span><i class="on"></i>отметился</span><span><i></i>нет отметки</span><span class="muted">последние 4 недели</span></div>
      </section>
      <section class="card">
        <h3>Мои задачи</h3>
        <div class="mini-kpis">
          <div><b>${open.filter((t) => !t.started).length}</b><span>новых</span></div>
          <div><b>${open.filter((t) => t.started).length}</b><span>в работе</span></div>
          <div><b class="${overdue.length ? 'red' : ''}">${overdue.length}</b><span>просрочено</span></div>
        </div>
        <button class="primary" data-act="page" data-p="tasks">Открыть задачи →</button>
      </section>
      ${checklistOf(e.dept).length ? `<section class="card">
        <h3>Первые дни: что должно случиться ${help('Чек-лист отдела. Если пункт не выполнен, скажите руководителю или наставнику: без этого работать сложнее.')}</h3>
        ${checklistBlock(e, true)}
      </section>` : ''}
      <section class="card">
        <h3>Мой путь: первые 90 дней</h3>
        ${timeline(m)}
        <ul class="pc-facts">
          <li>Руководитель: <b>${esc(managerName(e.managerId))}</b></li>
          <li>Наставник: ${e.mentor ? `<b>${esc(e.mentor)}</b> - к нему можно с любым вопросом` : '<span class="muted">пока не назначен - спросите руководителя</span>'}</li>
          <li>${!next ? 'Все встречи адаптации пройдены' : next.due
            ? `Пора встретиться с руководителем (<b>встреча ${next.day}-го дня</b>) - если он не позвал, напомните сами`
            : `Следующая встреча с руководителем - <b>${next.day}-й день</b>, около ${fmt(addDays(e.hireDate, next.day - 1))}`}</li>
        </ul>
      </section>
      <section class="card">
        <h3>Встречи с руководителем</h3>
        ${checkinList(e, m, false)}
        <p class="note">На встрече можно спокойно сказать, что непонятно или мешает. Для этого они и нужны.</p>
      </section>
    </div>`;
}

function pulseCard(e, p) {
  return `<section class="card pulse" id="pulse">
    <h3>Как вам первые ${p.day} ${plural(p.day, 'день', 'дня', 'дней')}? <span class="muted small">3 вопроса, меньше минуты</span></h3>
    <form data-form="pulse" data-id="${e.id}" data-k="${p.key}">
      ${PULSE_QUESTIONS.map((q) => `<fieldset class="scale"><legend>${esc(q.label)}</legend>
        <div class="scale-row">${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="${q.key}" value="${v}" required><span>${v}</span></label>`).join('')}<small class="muted">1 - совсем нет, 5 - полностью</small></div>
      </fieldset>`).join('')}
      <label class="full">Что мешает или чего не хватает? (необязательно)<textarea name="comment" rows="2" maxlength="300"></textarea></label>
      <p class="note">Ответы увидят HR и ваш руководитель - чтобы помочь, а не оценить вас.</p>
      <button class="primary">Отправить</button>
    </form>
  </section>`;
}

export function employeeTasks() {
  const e = emp(ctx.ui.asEmployee);
  if (!e) return '';
  const tasks = [...(e.tasks || [])];
  const byDeadline = (a, b) => (isNewTask(b) || hasUnseenChanges(b)) - (isNewTask(a) || hasUnseenChanges(a)) || (a.deadline < b.deadline ? -1 : 1);
  const fresh = tasks.filter((t) => !t.started && !t.closed).sort(byDeadline);
  const inWork = tasks.filter((t) => t.started && !t.closed).sort(byDeadline);
  const done = tasks.filter((t) => t.closed).sort((a, b) => (a.closed < b.closed ? 1 : -1)).slice(0, 8);
  const item = (t, btn) => {
    const late = !t.closed && t.deadline < ctx.today;
    const lateBy = late ? diffDays(t.deadline, ctx.today) : 0;
    const closedLate = t.closed && t.closed > t.deadline ? diffDays(t.deadline, t.closed) : 0;
    const hot = isNewTask(t) || hasUnseenChanges(t);
    return `<div class="titem ${t.closed ? 'done' : ''} ${late ? 'late' : ''} ${hot ? 'hot' : ''}">
      <div class="ti-main">
        <div class="ti-top"><button class="ti-title" data-act="task-view" data-id="${t.id}">${esc(t.title)}</button>${changeMark(t, true)}</div>
        ${t.description ? `<div class="ti-desc clamp">${esc(t.description)}</div>` : ''}
        <small class="muted"><span class="${late ? 'red' : ''}">срок ${fmt(t.deadline)}${late ? `, прошёл ${lateBy} дн. назад` : ''}</span>${t.closed ? ` · завершена ${fmt(t.closed)}${closedLate ? ` <span class="amber">с опозданием на ${closedLate} дн.</span>` : ''}` : ` · от ${esc(managerName(t.by))}`}</small></div>
      <div class="ti-act">${btn}</div>
    </div>`;
  };
  const col = (title, list, btn, empty, note = '') => `<section class="card"><h3>${title} <span class="cnt">${list.length}</span></h3>${note}${list.length ? list.map((t) => item(t, btn(t))).join('') : `<p class="muted">${empty}</p>`}</section>`;
  const lateCount = (list) => list.filter((t) => t.deadline < ctx.today).length;
  const nFresh = lateCount(fresh);
  const nStuck = lateCount(inWork);
  return `
    <p class="sub">Задачи из Битрикс24. Нажмите на название, чтобы прочитать, что нужно сделать. Если постановщик изменил задачу, вы увидите отметку "Изменена" и что именно поменялось.</p>
    <div class="kanban">
      ${col('Новые', fresh, (t) => `<button class="small" data-act="t-start" data-id="${t.id}">Начать</button>`, 'Новых задач нет.',
        nFresh ? `<p class="ti-hint">У ${nFresh} ${plural(nFresh, 'задачи', 'задач', 'задач')} срок уже прошёл. Непонятно, с чего начать или что от вас ждут? Скажите руководителю - это нормально.</p>` : '')}
      ${col('В работе', inWork, (t) => `<button class="primary small" data-act="t-done" data-id="${t.id}">Завершить</button><button class="small" data-act="t-pause" data-id="${t.id}" data-tip="Приостановить: задача вернётся в &quot;Новые&quot;" aria-label="Приостановить">⏸</button>`, 'Ничего не в работе.',
        nStuck ? `<p class="ti-hint">${nStuck} ${plural(nStuck, 'задача застряла', 'задачи застряли', 'задач застряли')} после срока. Если не получается - спросите наставника, вместе быстрее.</p>` : '')}
      ${col('Завершено', done, (t) => `<button class="small" data-act="t-undo" data-id="${t.id}" data-tip="Возобновить: задача вернётся в &quot;В работе&quot;">Вернуть</button>`, 'Пока ничего.')}
    </div>`;
}

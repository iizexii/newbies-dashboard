// Кабинет руководителя и кабинет сотрудника (демо-вход через переключатель в сайдбаре).
import { ctx, esc, fmt, plural, assess, manager, managerName, deptName, emp, newcomers } from '../ctx.js';
import { timeline, checkinList } from './card.js';
import { badge } from './hr.js';
import { workdaysBetween, addDays, diffDays } from '../dates.js';

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
      <div class="kpi"><b>${notHere.length}</b><span>не отметились сегодня</span><small>${notHere.length ? esc(notHere.slice(0, 2).map((e) => e.name.split(' ')[0]).join(', ')) + (notHere.length > 2 ? '…' : '') : 'все на месте'}</small></div>
      <div class="kpi amber click" data-act="page" data-p="mytasks"><b>${fromHr.length}</b><span>поручений от HR</span><small>открыть список →</small></div>
    </section>
    ${team.length ? `<div class="cards">${team.map(teamCard).join('')}</div>` : '<div class="empty">Сейчас в команде нет новичков.</div>'}`;
}

function teamCard(e) {
  const a = assess(e);
  const m = a.metrics;
  const next = m.checkins.find((c) => !c.done && (c.due || c.overdue)) || null;
  const openTasks = (e.tasks || []).filter((t) => !t.closed).length;
  return `<article class="pcard ${a.level}">
    <header>
      <div><b>${esc(e.name)}</b><small class="muted">${esc(e.position)}</small></div>
      ${badge(a)}
    </header>
    ${timeline(m)}
    <ul class="pc-facts">
      <li>${m.checkedInToday ? `<span class="ok">✓</span> На работе с ${m.checkedInToday}` : '<span class="red">✕</span> Сегодня не отметился'}</li>
      <li>${e.mentor ? `<span class="ok">✓</span> Наставник: ${esc(e.mentor)}` : '<span class="red">✕</span> Нет наставника'}</li>
      <li>Задач открыто: <b>${openTasks}</b>${m.overdueNotStarted ? `, <span class="red">не взялся в срок: ${m.overdueNotStarted}</span>` : ''}${m.overdueStuck ? `, <span class="red">застряло: ${m.overdueStuck}</span>` : ''}</li>
      ${m.closedLate ? `<li class="muted">Завершено с опозданием: ${m.closedLate} из ${m.closed}</li>` : ''}
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

export function managerTasks() {
  const mg = manager(ctx.ui.asManager);
  if (!mg) return '';
  const list = ctx.state.actions.filter((x) => x.responsibleId === mg.id)
    .sort((a, b) => (a.status === b.status ? (a.deadline < b.deadline ? -1 : 1) : a.status === 'open' ? -1 : 1));
  if (!list.length) return '<div class="empty">Поручений от HR нет. Они появляются, когда HR видит новичка с высоким риском.</div>';
  return `<div class="task-list">${list.map((x) => {
    const e = emp(x.employeeId);
    const late = x.status === 'open' && x.deadline < ctx.today;
    return `<article class="titem ${x.status}">
      <div class="ti-main">
        <b>${esc(x.title)}</b>
        <small class="muted">от HR · поставлена ${fmt(x.created)} · <span class="${late ? 'red' : ''}">срок ${fmt(x.deadline)}${late ? ' (просрочена)' : ''}</span></small>
        <details><summary>описание</summary><pre class="desc">${esc(x.description)}</pre></details>
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
  const next = m.checkins.find((c) => !c.done);
  const wds = workdaysBetween(addDays(ctx.today, -27), ctx.today).filter((d) => d >= e.hireDate);
  const att = e.attendance || {};
  return `
    <section class="hello">
      <h2>Добрый день, ${esc(first)}!</h2>
      <p>Вы с нами <b>${m.tenureDays}-й день</b>${m.tenureDays <= 90 ? ' из 90 дней адаптации' : ''}. ${esc(deptName(e.dept))}, ${esc(e.position.toLowerCase())}.</p>
    </section>
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
      <section class="card">
        <h3>Мой путь: первые 90 дней</h3>
        ${timeline(m)}
        <ul class="pc-facts">
          <li>Руководитель: <b>${esc(managerName(e.managerId))}</b></li>
          <li>Наставник: ${e.mentor ? `<b>${esc(e.mentor)}</b> — к нему можно с любым вопросом` : '<span class="muted">пока не назначен — спросите руководителя</span>'}</li>
          <li>${!next ? 'Все встречи адаптации пройдены' : next.due
            ? `Пора встретиться с руководителем (<b>встреча ${next.day}-го дня</b>) — если он не позвал, напомните сами`
            : `Следующая встреча с руководителем — <b>${next.day}-й день</b>, около ${fmt(addDays(e.hireDate, next.day - 1))}`}</li>
        </ul>
      </section>
      <section class="card">
        <h3>Встречи с руководителем</h3>
        ${checkinList(e, m, false)}
        <p class="note">На встрече можно спокойно сказать, что непонятно или мешает. Для этого они и нужны.</p>
      </section>
    </div>`;
}

export function employeeTasks() {
  const e = emp(ctx.ui.asEmployee);
  if (!e) return '';
  const tasks = [...(e.tasks || [])];
  const fresh = tasks.filter((t) => !t.started && !t.closed).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  const inWork = tasks.filter((t) => t.started && !t.closed).sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
  const done = tasks.filter((t) => t.closed).sort((a, b) => (a.closed < b.closed ? 1 : -1)).slice(0, 8);
  const item = (t, btn) => {
    const late = !t.closed && t.deadline < ctx.today;
    const lateBy = late ? diffDays(t.deadline, ctx.today) : 0;
    const closedLate = t.closed && t.closed > t.deadline ? diffDays(t.deadline, t.closed) : 0;
    return `<div class="titem ${t.closed ? 'done' : ''} ${late ? 'late' : ''}">
      <div class="ti-main"><b>${esc(t.title)}</b>
        <small class="muted">поставлена ${fmt(t.created)} · <span class="${late ? 'red' : ''}">срок ${fmt(t.deadline)}${late ? `, прошёл ${lateBy} дн. назад` : ''}</span>${t.closed ? ` · завершена ${fmt(t.closed)}${closedLate ? ` <span class="amber">с опозданием на ${closedLate} дн.</span>` : ''}` : ''}</small></div>
      <div class="ti-act">${btn}</div>
    </div>`;
  };
  const col = (title, list, btn, empty, note = '') => `<section class="card"><h3>${title} <span class="cnt">${list.length}</span></h3>${note}${list.length ? list.map((t) => item(t, btn(t))).join('') : `<p class="muted">${empty}</p>`}</section>`;
  const lateCount = (list) => list.filter((t) => t.deadline < ctx.today).length;
  const nFresh = lateCount(fresh);
  const nStuck = lateCount(inWork);
  return `
    <p class="sub">Задачи из Битрикс24. Нажимайте «Начать», когда взялись, и «Завершить», когда сделали. В рабочей версии статус сразу уходит в Б24.</p>
    <div class="kanban">
      ${col('Новые', fresh, (t) => `<button class="small" data-act="t-start" data-id="${t.id}">Начать</button>`, 'Новых задач нет.',
        nFresh ? `<p class="ti-hint">У ${nFresh} ${plural(nFresh, 'задачи', 'задач', 'задач')} срок уже прошёл. Непонятно, с чего начать или что от вас ждут? Скажите руководителю — это нормально.</p>` : '')}
      ${col('В работе', inWork, (t) => `<button class="primary small" data-act="t-done" data-id="${t.id}">Завершить</button>`, 'Ничего не в работе.',
        nStuck ? `<p class="ti-hint">${nStuck} ${plural(nStuck, 'задача застряла', 'задачи застряли', 'задач застряли')} после срока. Если не получается — спросите наставника, вместе быстрее.</p>` : '')}
      ${col('Завершено', done, (t) => (t.closed === ctx.today ? `<button class="link" data-act="t-undo" data-id="${t.id}">вернуть</button>` : ''), 'Пока ничего.')}
    </div>`;
}

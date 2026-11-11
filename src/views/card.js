// Карточка новичка (выезжающая панель). HR видит всё, руководитель — свои действия.
import { ctx, esc, fmt, assess, managerName, deptName } from '../ctx.js';
import { LEVELS, ADAPTATION_DAYS, CHECKINS } from '../risk.js';
import { addDays, diffDays } from '../dates.js';
import { badge } from './hr.js';

export function timeline(m) {
  const day = Math.min(m.tenureDays, ADAPTATION_DAYS);
  const marks = CHECKINS.map((c) => {
    const ci = m.checkins.find((x) => x.key === c.key);
    const cls = ci.done ? 'ok' : ci.overdue ? 'bad' : 'wait';
    const tip = ci.done ? `${c.label}: проведена ${fmt(ci.done)}` : ci.overdue ? `${c.label}: просрочена` : `${c.label}: впереди`;
    return `<i class="mark ${cls}" style="left:${(c.day / ADAPTATION_DAYS) * 100}%" data-tip="${tip}"><span>${c.day}</span></i>`;
  }).join('');
  return `<div class="timeline">
    <div class="tl-bar"><div class="tl-fill" style="width:${(day / ADAPTATION_DAYS) * 100}%"></div>${marks}<i class="mark end" style="left:100%"><span>90</span></i></div>
    <div class="tl-cap">День ${m.tenureDays}${m.tenureDays <= 90 ? ' из 90' : ' — адаптация пройдена'} · точки — встречи с руководителем</div>
  </div>`;
}

export function checkinList(e, m, canMark) {
  return m.checkins.map((c) => `
    <div class="checkin">
      <span class="dots"><i class="${c.done ? 'ok' : c.overdue ? 'bad' : 'wait'}">${c.day}</i></span>
      <span class="grow">${c.label}${c.done ? ` — проведена ${fmt(c.done)}` : c.overdue ? ` — <span class="red">просрочена на ${c.overdueBy} дн.</span>` : c.due ? ' — пора провести' : ` — ${fmt(addDays(e.hireDate, c.day - 1))}`}</span>
      ${canMark && e.status === 'active' ? (c.done
        ? `<button class="link" data-act="checkin-undo" data-id="${e.id}" data-k="${c.key}">отменить</button>`
        : `<button class="small" data-act="checkin" data-id="${e.id}" data-k="${c.key}">Провёл встречу</button>`) : ''}
    </div>`).join('');
}

export function activityStrip(e, m) {
  const days = m.activity.slice(-44);
  if (!days.length) return '';
  const att = e.attendance;
  return `<div class="strip">${days.map((d) => {
    const here = att ? !!att[d.date] : null;
    const tip = `${fmt(d.date)}: ${d.current ? 'сегодня' : d.active ? 'работал с задачами' : 'нет действий в задачах'}${here === null ? '' : here ? `, отметился ${att[d.date]}` : ', не отметился на работе'}`;
    return `<i class="${d.current ? 'cur' : d.active ? 'on' : ''} ${here === false && !d.current ? 'absent' : ''}" data-tip="${tip}"></i>`;
  }).join('')}</div>
  <div class="legend"><span><i class="on"></i>работал с задачами</span><span><i></i>нет действий в задачах</span><span><i class="absent"></i>не отметился на работе</span><span><i class="cur"></i>сегодня</span></div>`;
}

export function drawer(e) {
  const role = ctx.ui.role;
  const a = assess(e);
  const m = a.metrics;
  const myActions = ctx.state.actions.filter((x) => x.employeeId === e.id);
  const tasks = [...(e.tasks || [])].filter((t) => t.created <= m.end).sort((x, y) => (x.created < y.created ? 1 : -1));
  const shown = ctx.ui.showAllTasks ? tasks : tasks.slice(0, 6);
  const inAdapt = e.status === 'active' && m.tenureDays <= 90;

  const actions = role === 'hr'
    ? `${inAdapt ? `<button class="primary" data-act="task" data-id="${e.id}">Поручить руководителю</button>` : ''}
       <button data-act="edit-emp" data-id="${e.id}">Изменить</button>
       ${e.status === 'active' ? `<button data-act="leave" data-id="${e.id}">Отметить увольнение</button>` : `<button data-act="unleave" data-id="${e.id}">Вернуть в работающие</button>`}`
    : `<button class="primary" data-act="give-task" data-id="${e.id}">Поставить задачу новичку</button>
       <button data-act="mentor" data-id="${e.id}">${e.mentor ? 'Сменить наставника' : 'Назначить наставника'}</button>`;

  return `<div class="scrim" data-act="close"></div>
  <aside class="drawer" role="dialog" aria-label="Карточка новичка">
    <div class="d-head">
      <div><h2>${esc(e.name)}</h2><div class="muted">${esc(e.position)} · ${esc(deptName(e.dept))}</div></div>
      <button class="icon" data-act="close" title="Закрыть (Esc)">✕</button>
    </div>
    <dl class="facts">
      <div><dt>Руководитель</dt><dd>${esc(managerName(e.managerId))}</dd></div>
      <div><dt>Наставник</dt><dd>${e.mentor ? esc(e.mentor) : '<span class="red">не назначен</span>'}</dd></div>
      <div><dt>Вышел на работу</dt><dd>${fmt(e.hireDate)}</dd></div>
      <div><dt>${e.status === 'left' ? 'Уволился' : 'Сегодня на работе'}</dt><dd>${e.status === 'left' ? `${fmt(e.leftDate)} · ${esc(e.leftReason || '')}` : m.checkedInToday ? `<span class="ok">✓ отметился в ${m.checkedInToday}</span>` : '<span class="muted">ещё не отметился</span>'}</dd></div>
    </dl>
    ${timeline(m)}
    <section class="risk-box ${a.level}">
      <div class="rb-head">${badge(a)} <span>${LEVELS[a.level].label}</span></div>
      ${a.reasons.length ? `<ul class="reasons">${a.reasons.map((r) => `<li><b>+${r.points}</b> ${esc(r.text)}</li>`).join('')}</ul>` : ''}
      ${a.ok.length ? `<ul class="oks">${a.ok.map((t) => `<li>✓ ${esc(t)}</li>`).join('')}</ul>` : ''}
      ${a.level === 'done' ? '<p class="muted">Прошёл 90 дней — риск раннего ухода больше не считаем.</p>' : ''}
    </section>
    <div class="actions-row">${actions}</div>

    ${myActions.length ? `<section><h3>Поручения руководителю</h3>${myActions.map((x) => `
      <div class="act-item ${x.status}"><span>${x.status === 'done' ? '✓' : '●'} ${esc(x.title)}</span>
      <small class="muted">${esc(managerName(x.responsibleId))} · срок ${fmt(x.deadline)}${x.status === 'done' ? ` · выполнена ${fmt(x.doneAt)}` : ''}${x.comment ? ` · «${esc(x.comment)}»` : ''}</small></div>`).join('')}</section>` : ''}

    <section><h3>Встречи с руководителем</h3>${checkinList(e, m, true)}</section>

    <section>
      <h3>Задачи в Битрикс24 и отметки</h3>
      <div class="stats">
        <div><b>${m.received}</b><span>получил задач</span></div>
        <div><b>${m.closed}</b><span>завершил${m.closedLate ? `, <span class="amber">из них ${m.closedLate} с опозданием</span>` : ''}</span></div>
        <div><b class="${m.overdueNotStarted ? 'red' : ''}">${m.overdueNotStarted}</b><span>не взялся, срок прошёл</span></div>
        <div><b class="${m.overdueStuck ? 'red' : ''}">${m.overdueStuck}</b><span>начал и застрял после срока</span></div>
        <div><b class="${m.idleStreak >= 5 ? 'red' : ''}">${m.received ? m.idleStreak : '—'}</b><span>раб. дн. подряд без действий в задачах</span></div>
        <div><b>${m.hasAttendance ? `${m.presentDays}/${m.workdaysCount}` : '—'}</b><span>отметился на работе, раб. дн.</span></div>
      </div>
      ${activityStrip(e, m)}
      <p class="note">«Нет действий в задачах» — в этот день человек не начал и не завершил ни одной задачи в Б24. Работа на складе или в зале может идти вне Б24, это повод спросить, а не обвинить.</p>
    </section>

    <section>
      <h3>Последние задачи ${tasks.length > 6 ? `<button class="link" data-act="all-tasks">${ctx.ui.showAllTasks ? 'свернуть' : `все ${tasks.length}`}</button>` : ''}</h3>
      ${tasks.length ? `<table class="tasks"><thead><tr><th>Задача</th><th>Поставлена</th><th>Срок</th><th>Статус</th></tr></thead><tbody>
        ${shown.map((t) => `<tr><td>${esc(t.title)}</td><td class="nowrap">${fmt(t.created)}</td><td class="nowrap">${fmt(t.deadline)}</td><td>${taskStatus(t, m.end)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted">Задач в Б24 пока нет.</p>'}
    </section>
  </aside>`;
}

/** Статус задачи с учётом срока. end — дата, на которую смотрим (сегодня или день увольнения). */
export function taskStatus(t, end) {
  const closed = t.closed && t.closed <= end;
  const started = t.started && t.started <= end;
  if (closed) {
    const late = diffDays(t.deadline, t.closed);
    return late > 0
      ? `<span class="amber">✓ завершена ${fmt(t.closed)}, опоздание ${late} дн.</span>`
      : `<span class="ok">✓ завершена ${fmt(t.closed)}</span>`;
  }
  if (t.deadline < end) {
    const by = diffDays(t.deadline, end);
    return started
      ? `<span class="red">в работе, застряла: срок прошёл ${by} дн. назад</span>`
      : `<span class="red">не начата, срок прошёл ${by} дн. назад</span>`;
  }
  return started ? 'в работе' : '<span class="muted">не начата</span>';
}

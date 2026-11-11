// Экраны HR: обзор, новички, аналитика, задачи руководителям.
import { ctx, esc, pct, fmt, plural, assess, managerName, deptName, emp, newcomers, RISK_COLORS } from '../ctx.js';
import { LEVELS } from '../risk.js';
import { buildAnalytics } from '../analytics.js';
import { stackedBars, columns, hBars } from '../charts.js';

export const badge = (a) => `<span class="badge ${a.level}">${LEVELS[a.level].short}${a.score ? ` · ${a.score}` : ''}</span>`;

function kpi(n, label, sub, tone = '', attrs = '') {
  return `<div class="kpi ${tone} ${attrs ? 'click' : ''}" ${attrs}><b>${n}</b><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

// ---------- Обзор ----------
export function overview() {
  const S = ctx.state;
  const list = newcomers();
  const by = (lvl) => list.filter((e) => assess(e).level === lvl);
  const A = buildAnalytics(S, ctx.today);
  const urgent = by('high').sort((a, b) => assess(b).score - assess(a).score).slice(0, 6);
  const open = S.actions.filter((x) => x.status === 'open');
  const late = open.filter((x) => x.deadline < ctx.today);

  const riskRows = S.departments.map((d) => {
    const l = list.filter((e) => e.dept === d.id);
    return { id: d.id, label: d.name, values: { high: l.filter((e) => assess(e).level === 'high').length, medium: l.filter((e) => assess(e).level === 'medium').length, low: l.filter((e) => assess(e).level === 'low').length } };
  });

  return `
  <section class="kpis">
    ${kpi(list.length, 'новичков сейчас', 'работают меньше 90 дней', '', 'data-act="goto-newbies" data-risk="all"')}
    ${kpi(by('high').length, 'с высоким риском', 'нужно действие сегодня', 'red', 'data-act="goto-newbies" data-risk="high"')}
    ${kpi(by('medium').length, 'требуют внимания', '1–2 тревожных сигнала', 'amber', 'data-act="goto-newbies" data-risk="medium"')}
    ${kpi(pct(A.earlyRate), 'уходят в первые 90 дней', `${A.early} из ${A.matured} принятых за год`, '', 'data-act="page" data-p="analytics"')}
  </section>

  <div class="grid2">
    <section class="card">
      <h3>Кому нужно внимание сегодня</h3>
      <p class="sub">Новички с высоким риском, самые тревожные сверху. Клик — карточка с причинами.</p>
      ${urgent.length ? `<ul class="urgent">${urgent.map((e) => {
        const a = assess(e);
        return `<li data-act="open" data-id="${e.id}">
          <div><b>${esc(e.name)}</b><small class="muted">${esc(deptName(e.dept))} · ${esc(e.position)} · день ${a.metrics.tenureDays}</small></div>
          <div class="u-reason">${esc(a.reasons[0]?.text || '')}${a.reasons.length > 1 ? ` <span class="muted">и ещё ${a.reasons.length - 1}</span>` : ''}</div>
          ${badge(a)}
        </li>`;
      }).join('')}</ul>` : '<p class="muted">Новичков с высоким риском нет.</p>'}
    </section>

    <section class="card">
      <h3>Риск по отделам</h3>
      <p class="sub">Сколько новичков в каждом отделе и в каком они состоянии. Клик по строке — список отдела.</p>
      ${stackedBars(riskRows, RISK_COLORS, { act: 'goto-dept' })}
    </section>

    <section class="card">
      <h3>Приём и ранние уходы по месяцам</h3>
      <p class="sub">Сколько человек вышло на работу и сколько уволилось, не проработав 90 дней (по месяцу увольнения). Последний месяц ещё идёт.</p>
      ${columns(A.byMonth.map((m) => m.label), [
        { label: 'Вышли на работу', color: 'var(--s1)', values: A.byMonth.map((m) => m.hired) },
        { label: 'Ушли в первые 90 дней', color: 'var(--s2)', values: A.byMonth.map((m) => m.early) },
      ])}
    </section>

    <section class="card">
      <h3>Задачи руководителям</h3>
      <p class="sub">Что HR поручил руководителям по новичкам и выполнено ли.</p>
      <div class="mini-kpis">
        <div><b>${open.length}</b><span>в работе</span></div>
        <div><b class="${late.length ? 'red' : ''}">${late.length}</b><span>просрочено</span></div>
        <div><b>${S.actions.length - open.length}</b><span>выполнено</span></div>
      </div>
      ${open.length ? `<ul class="plain">${open.slice(0, 4).map((x) => `<li><span>${esc(x.title)}</span><small class="muted">${esc(managerName(x.responsibleId))} · до ${fmt(x.deadline)}</small></li>`).join('')}</ul>` : '<p class="muted">Открытых задач нет. Их ставят из карточки новичка.</p>'}
      <button class="link" data-act="page" data-p="actions">Все задачи →</button>
    </section>
  </div>`;
}

// ---------- Новички ----------
const TENURE = {
  adapt: { label: 'Все новички (до 90 дней)', test: (e, a) => e.status === 'active' && a.metrics.tenureDays <= 90 },
  w1: { label: 'Первая неделя', test: (e, a) => e.status === 'active' && a.metrics.tenureDays <= 7 },
  m1: { label: '8–30 дней', test: (e, a) => e.status === 'active' && a.metrics.tenureDays >= 8 && a.metrics.tenureDays <= 30 },
  m2: { label: '31–60 дней', test: (e, a) => e.status === 'active' && a.metrics.tenureDays >= 31 && a.metrics.tenureDays <= 60 },
  m3: { label: '61–90 дней', test: (e, a) => e.status === 'active' && a.metrics.tenureDays >= 61 && a.metrics.tenureDays <= 90 },
  left: { label: 'Уволившиеся', test: (e) => e.status === 'left' },
};

const SORTS = {
  name: (e) => e.name,
  dept: (e) => deptName(e.dept),
  manager: (e) => managerName(e.managerId),
  day: (e, a) => a.metrics.tenureDays,
  risk: (e, a) => LEVELS[a.level].order * 100 + a.score,
};

function rows() {
  const { ui } = ctx;
  const q = ui.q.trim().toLowerCase();
  const out = ctx.state.employees
    .filter((e) => ui.dept === 'all' || e.dept === ui.dept)
    .map((e) => ({ e, a: assess(e) }))
    .filter(({ e, a }) => TENURE[ui.tenure].test(e, a))
    .filter(({ a }) => ui.risk === 'all' || a.level === ui.risk)
    .filter(({ e }) => ui.manager === 'all' || e.managerId === ui.manager)
    .filter(({ e }) => !q || `${e.name} ${e.position} ${e.mentor} ${managerName(e.managerId)}`.toLowerCase().includes(q));
  const f = SORTS[ui.sort.key];
  out.sort((x, y) => {
    const a = f(x.e, x.a), b = f(y.e, y.a);
    const c = typeof a === 'string' ? a.localeCompare(b, 'ru') : a - b;
    return c * ui.sort.dir || x.e.name.localeCompare(y.e.name, 'ru');
  });
  return out;
}

export function deptTabs(current, act) {
  const S = ctx.state;
  const tab = (id, name) => {
    const list = newcomers().filter((e) => id === 'all' || e.dept === id);
    const high = list.filter((e) => assess(e).level === 'high').length;
    return `<button class="tab ${current === id ? 'on' : ''}" data-act="${act}" data-id="${id}">${esc(name)} <span class="cnt">${list.length}</span>${high ? `<span class="hi" data-tip="Высокий риск: ${high}">${high}</span>` : ''}</button>`;
  };
  return `<div class="tabs">${tab('all', 'Все отделы')}${S.departments.map((d) => tab(d.id, d.name)).join('')}</div>`;
}

export function newbies() {
  const { ui } = ctx;
  const managers = ctx.state.managers.filter((m) => ui.dept === 'all' || m.dept === ui.dept);
  if (ui.manager !== 'all' && !managers.some((m) => m.id === ui.manager)) ui.manager = 'all';
  return `
    ${deptTabs(ui.dept, 'dept')}
    <section class="toolbar">
      <input type="search" placeholder="Поиск: ФИО, должность, руководитель" value="${esc(ui.q)}" data-filter="q" />
      <select data-filter="tenure" aria-label="Срок работы">${Object.entries(TENURE).map(([k, v]) => `<option value="${k}" ${ui.tenure === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <select data-filter="risk" aria-label="Риск">${[['all', 'Любой риск'], ...RISK_COLORS.map((r) => [r.key, r.label])].map(([k, l]) => `<option value="${k}" ${ui.risk === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select data-filter="manager" aria-label="Руководитель"><option value="all">Все руководители</option>${managers.map((m) => `<option value="${m.id}" ${ui.manager === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
      <span class="grow"></span>
      <button class="link" data-act="rules">Как считается риск?</button>
      <button class="primary" data-act="add-emp">＋ Новичок</button>
    </section>
    <div id="tbl">${table()}</div>`;
}

function th(key, label, tip = '') {
  const on = ctx.ui.sort.key === key;
  return `<th data-act="sort" data-key="${key}" class="${on ? 'sorted' : ''}" ${tip ? `data-tip="${esc(tip)}"` : ''}>${label}${on ? (ctx.ui.sort.dir > 0 ? ' ▲' : ' ▼') : ' <span class="sort-hint">↕</span>'}</th>`;
}

export function table() {
  const list = rows();
  const all = ctx.ui.dept === 'all';
  if (!list.length) return '<div class="empty">Никого не нашлось. Измените фильтры или добавьте новичка.</div>';
  return `<div class="count">${list.length} ${plural(list.length, 'сотрудник', 'сотрудника', 'сотрудников')} · клик по строке открывает карточку</div>
  <div class="table-wrap"><table class="list">
    <thead><tr>${th('name', 'Сотрудник')}${all ? th('dept', 'Отдел') : ''}${th('manager', 'Руководитель')}${th('day', 'День из 90', 'Сколько календарных дней человек работает')}${th('risk', 'Риск', 'Сумма баллов по сигналам — см. «Как считается риск?»')}<th>Главная причина</th></tr></thead>
    <tbody>${list.map(({ e, a }) => {
      const m = a.metrics;
      const openTask = ctx.state.actions.find((x) => x.employeeId === e.id && x.status === 'open');
      const day = e.status === 'left'
        ? `<span class="muted">ушёл на ${m.tenureDays}-й день</span>`
        : `${m.tenureDays}<div class="mini"><i style="width:${Math.min(100, (m.tenureDays / 90) * 100)}%"></i></div>`;
      const reason = e.status === 'left' ? esc(e.leftReason || '') : a.reasons[0] ? `${esc(a.reasons[0].text)}${a.reasons.length > 1 ? ` <span class="muted">+${a.reasons.length - 1}</span>` : ''}` : '<span class="muted">сигналов нет</span>';
      return `<tr data-act="open" data-id="${e.id}" class="${ctx.ui.openId === e.id ? 'sel' : ''}">
        <td><b>${esc(e.name)}</b><div class="muted">${esc(e.position)}</div></td>
        ${all ? `<td>${esc(deptName(e.dept))}</td>` : ''}
        <td>${esc(managerName(e.managerId))}</td>
        <td class="nowrap">${day}</td>
        <td>${badge(a)}</td>
        <td class="reason-cell">${reason}${openTask ? `<div class="has-task">✎ поручено руководителю до ${fmt(openTask.deadline)}</div>` : ''}</td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

// ---------- Аналитика ----------
export function analytics() {
  const { ui } = ctx;
  const A = buildAnalytics(ctx.state, ctx.today, ui.anDept);
  const maxRate = Math.max(0.01, ...A.byDept.map((d) => d.rate ?? 0));
  return `
    <div class="banner">Данные синтетические: закономерности заложены в генератор вручную. Экран показывает, <b>какие вопросы</b> можно будет задать реальным данным, а не готовые выводы.</div>
    <div class="tabs">
      <button class="tab ${ui.anDept === 'all' ? 'on' : ''}" data-act="an-dept" data-id="all">Все отделы</button>
      ${ctx.state.departments.map((d) => `<button class="tab ${ui.anDept === d.id ? 'on' : ''}" data-act="an-dept" data-id="${d.id}">${esc(d.name)}</button>`).join('')}
    </div>
    <section class="kpis">
      ${kpi(A.hires, 'вышли на работу', 'за последние 12 месяцев')}
      ${kpi(A.early, 'уволились в первые 90 дней', `всего уволились за период: ${A.leftAll}`, 'red')}
      ${kpi(pct(A.earlyRate), 'доля ранних уходов', `${A.early} из ${A.matured} — считаем только тех, у кого 90 дней уже прошли`, 'amber')}
      ${kpi(A.median == null ? '—' : `${A.median} дн.`, 'типичный срок до ухода', 'медиана среди ушедших в первые 90 дней')}
    </section>
    <div class="grid2">
      ${ui.anDept === 'all' ? `<section class="card"><h3>В каком отделе теряем новичков</h3>
        <p class="sub">% новичков отдела, уволившихся в первые 90 дней. Справа — сколько ушло из скольких принятых.</p>
        ${hBars(A.byDept.map((d) => ({ label: d.label, value: d.rate, text: `${pct(d.rate)} <small class="muted">${d.early} из ${d.total}</small>`, tip: `${d.label}: ушли ${d.early} из ${d.total} принятых (${pct(d.rate)})` })), 'var(--s1)', maxRate)}</section>` : ''}
      <section class="card"><h3>На каком сроке уходят</h3>
        <p class="sub">Сколько человек уволилось на каждом этапе первых 90 дней.</p>
        ${columns(A.byWeek.map((w) => w.label), [{ label: 'Уволились', color: 'var(--s1)', values: A.byWeek.map((w) => w.count) }])}
        <p class="note">Пик на 1–2 неделе — проблема первых дней (встретили, объяснили, дали задачи). Пик на 3-м месяце — ожидания и деньги.</p></section>
      <section class="card"><h3>Почему уходят</h3>
        <p class="sub">Причина со слов сотрудника при увольнении, число человек.</p>
        ${A.byReason.length ? hBars(A.byReason.map((r) => ({ label: r.label, value: r.count, text: `${r.count} чел.` }))) : '<p class="muted">Нет данных</p>'}</section>
      <section class="card"><h3>У каких руководителей уходят чаще</h3>
        <p class="sub">Из новичков руководителя (у кого 90 дней уже прошли) — сколько уволились раньше.</p>
        <table class="mini-table"><thead><tr><th>Руководитель</th><th class="num">Было новичков</th><th class="num">Из них ушли до 90 дней</th><th>% ушедших</th></tr></thead><tbody>
        ${A.byManager.map((r) => `<tr><td>${esc(r.label)}<div class="muted small">${esc(r.dept)}</div></td><td class="num">${r.total}</td><td class="num">${r.early}</td>
          <td class="pct-cell"><span class="pbar"><i style="width:${(r.rate ?? 0) * 100}%"></i></span> ${pct(r.rate)}${r.total < 5 ? ' <small class="muted">мало данных</small>' : ''}</td></tr>`).join('')}
        </tbody></table>
        <p class="note">Маленькие числа — повод поговорить с руководителем, а не оценка его работы.</p></section>
    </div>
    <section class="card">
      <h3>Первые две недели: чем ушедшие отличались от оставшихся</h3>
      <p class="sub">Средние показатели за первые 10 рабочих дней. Проверка, есть ли смысл в сигналах риска.</p>
      <table class="mini-table"><thead><tr><th></th><th class="num">Ушли до 90 дней (${A.earlyN} чел.)</th><th class="num">Остались после 90 дней (${A.stayN} чел.)</th></tr></thead><tbody>
        ${A.compare.map((c) => `<tr><td>${c.label}</td><td class="num">${c.fmt === 'pct' ? pct(c.early) : c.early?.toFixed(1) ?? '—'}</td><td class="num">${c.fmt === 'pct' ? pct(c.stay) : c.stay?.toFixed(1) ?? '—'}</td></tr>`).join('')}
      </tbody></table>
      <p class="note">Это корреляция, а не причина.</p>
    </section>`;
}

// ---------- Задачи руководителям ----------
export function actionsPage() {
  const list = [...ctx.state.actions].sort((a, b) => (a.status === b.status ? (a.created < b.created ? 1 : -1) : a.status === 'open' ? -1 : 1));
  return `
    <div class="banner">Задачи создаются в демо локально. Под каждой — запрос <code>tasks.task.add</code>, который ушёл бы в REST API Битрикс24.</div>
    ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Задача</th><th>Новичок</th><th>Ответственный</th><th>Срок</th><th>Статус</th></tr></thead><tbody>
      ${list.map((x) => {
        const e = emp(x.employeeId);
        const late = x.status === 'open' && x.deadline < ctx.today;
        return `<tr class="${x.status}">
          <td><b>${esc(x.title)}</b><details><summary>запрос в Битрикс24</summary><pre>${esc(JSON.stringify(b24Payload(x), null, 2))}</pre></details></td>
          <td>${e ? `<button class="link" data-act="open" data-id="${e.id}">${esc(e.name)}</button>` : '<span class="muted">удалён</span>'}</td>
          <td>${esc(managerName(x.responsibleId))}</td>
          <td class="nowrap ${late ? 'red' : ''}">${fmt(x.deadline)}${late ? ' · просрочена' : ''}</td>
          <td class="nowrap">${x.status === 'open' ? '<span class="badge medium">в работе</span>' : `<span class="ok">✓ выполнена ${fmt(x.doneAt)}</span>${x.comment ? `<div class="muted small">«${esc(x.comment)}»</div>` : ''}`}</td>
        </tr>`;
      }).join('')}
    </tbody></table></div>` : '<div class="empty">Пока нет задач. Откройте новичка с высоким риском и нажмите «Поручить руководителю».</div>'}`;
}

export function b24Payload(x) {
  const m = ctx.state.managers.find((mm) => mm.id === x.responsibleId);
  return { method: 'tasks.task.add', params: { fields: { TITLE: x.title, DESCRIPTION: x.description, RESPONSIBLE_ID: m?.b24Id ?? null, DEADLINE: `${x.deadline}T18:00:00+03:00`, TAGS: ['новичок', 'адаптация'] } } };
}

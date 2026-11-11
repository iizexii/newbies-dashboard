// Админка HR: справочники сотрудников, руководителей и отделов.
import { ctx, esc, fmt, plural, assess, managerName, deptName } from '../ctx.js';

export function admin() {
  const t = ctx.ui.adminTab;
  const tab = (k, l, n) => `<button class="tab ${t === k ? 'on' : ''}" data-act="admin-tab" data-id="${k}">${l} <span class="cnt">${n}</span></button>`;
  const S = ctx.state;
  return `<div class="tabs">
      ${tab('employees', 'Сотрудники', S.employees.length)}
      ${tab('managers', 'Руководители', S.managers.length)}
      ${tab('depts', 'Отделы', S.departments.length)}
    </div>
    ${t === 'employees' ? employees() : t === 'managers' ? managers() : depts()}`;
}

const STATUS = { active: 'Работают', adapt: 'Новички (до 90 дн.)', left: 'Уволились', all: 'Все' };

function employees() {
  const a = ctx.ui.adm;
  const q = a.q.trim().toLowerCase();
  const list = ctx.state.employees
    .filter((e) => a.dept === 'all' || e.dept === a.dept)
    .filter((e) => a.status === 'all' || (a.status === 'left' ? e.status === 'left' : a.status === 'active' ? e.status === 'active' : e.status === 'active' && assess(e).metrics.tenureDays <= 90))
    .filter((e) => !q || `${e.name} ${e.position} ${managerName(e.managerId)}`.toLowerCase().includes(q));
  const key = {
    name: (e) => e.name, dept: (e) => deptName(e.dept), position: (e) => e.position,
    manager: (e) => managerName(e.managerId), hire: (e) => e.hireDate,
  }[a.sort.key];
  list.sort((x, y) => key(x).localeCompare(key(y), 'ru') * a.sort.dir);
  const th = (k, l) => `<th data-act="adm-sort" data-key="${k}" class="${a.sort.key === k ? 'sorted' : ''}">${l}${a.sort.key === k ? (a.sort.dir > 0 ? ' ▲' : ' ▼') : ' <span class="sort-hint">↕</span>'}</th>`;
  return `
    <section class="toolbar">
      <input type="search" placeholder="Поиск: ФИО, должность, руководитель" value="${esc(a.q)}" data-adm="q" />
      <select data-adm="dept" aria-label="Отдел"><option value="all">Все отделы</option>${ctx.state.departments.map((d) => `<option value="${d.id}" ${a.dept === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
      <select data-adm="status" aria-label="Статус">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="grow"></span>
      <button class="primary" data-act="add-emp">＋ Сотрудник</button>
    </section>
    <div class="count">${list.length} ${plural(list.length, 'запись', 'записи', 'записей')}</div>
    <div class="table-wrap"><table class="list admin">
      <thead><tr>${th('name', 'ФИО')}${th('dept', 'Отдел')}${th('position', 'Должность')}${th('manager', 'Руководитель')}<th>Наставник</th>${th('hire', 'Вышел')}<th>Статус</th><th></th></tr></thead>
      <tbody>${list.map((e) => `<tr>
        <td><b>${esc(e.name)}</b></td><td>${esc(deptName(e.dept))}</td><td>${esc(e.position)}</td><td>${esc(managerName(e.managerId))}</td>
        <td>${e.mentor ? esc(e.mentor) : '<span class="muted">—</span>'}</td><td class="nowrap">${fmt(e.hireDate)}</td>
        <td class="nowrap">${e.status === 'left' ? `<span class="muted">уволен ${fmt(e.leftDate)}</span>` : assess(e).metrics.tenureDays <= 90 ? '<span class="badge low">новичок</span>' : 'работает'}</td>
        <td class="row-actions"><button class="small" data-act="edit-emp" data-id="${e.id}">Изменить</button><button class="small danger" data-act="del-emp" data-id="${e.id}" aria-label="Удалить">Удалить</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
}

function managers() {
  const S = ctx.state;
  return `
    <section class="toolbar"><span class="sub">Руководители получают поручения HR и видят своих новичков. ID в Б24 нужен, чтобы задача ушла нужному человеку.</span><span class="grow"></span><button class="primary" data-act="add-mgr">＋ Руководитель</button></section>
    <div class="table-wrap"><table class="list admin">
      <thead><tr><th>ФИО</th><th>Отдел</th><th class="num">ID в Битрикс24</th><th class="num">Сотрудников</th><th class="num">Новичков сейчас</th><th></th></tr></thead>
      <tbody>${S.departments.flatMap((d) => S.managers.filter((m) => m.dept === d.id)).concat(S.managers.filter((m) => !S.departments.some((d) => d.id === m.dept))).map((m) => {
        const people = S.employees.filter((e) => e.managerId === m.id && e.status === 'active');
        return `<tr><td><b>${esc(m.name)}</b></td><td>${esc(deptName(m.dept))}</td><td class="num">${m.b24Id ?? '<span class="muted">не указан</span>'}</td>
          <td class="num">${people.length}</td><td class="num">${people.filter((e) => assess(e).metrics.tenureDays <= 90).length}</td>
          <td class="row-actions"><button class="small" data-act="edit-mgr" data-id="${m.id}">Изменить</button><button class="small danger" data-act="del-mgr" data-id="${m.id}">Удалить</button></td></tr>`;
      }).join('')}</tbody>
    </table></div>`;
}

function depts() {
  const S = ctx.state;
  return `
    <form data-form="dept-add" class="toolbar"><input name="name" required maxlength="40" placeholder="Новый отдел, например «Интернет-магазин»"><button class="primary">＋ Добавить отдел</button></form>
    <div class="table-wrap"><table class="list admin">
      <thead><tr><th>Порядок</th><th>Название <small class="muted">(можно править прямо здесь)</small></th><th class="num">Сотрудников</th><th class="num">Руководителей</th><th>Чек-лист первых дней</th><th></th></tr></thead>
      <tbody>${S.departments.map((d, i) => `<tr>
        <td class="nowrap"><button class="icon" data-act="dept-up" data-id="${d.id}" ${i === 0 ? 'disabled' : ''} aria-label="Выше">↑</button><button class="icon" data-act="dept-down" data-id="${d.id}" ${i === S.departments.length - 1 ? 'disabled' : ''} aria-label="Ниже">↓</button></td>
        <td><input value="${esc(d.name)}" data-rename="${d.id}" maxlength="40" aria-label="Название отдела"></td>
        <td class="num">${S.employees.filter((e) => e.dept === d.id && e.status === 'active').length}</td>
        <td class="num">${S.managers.filter((m) => m.dept === d.id).length}</td>
        <td><span class="muted">${(d.checklist || []).length} пунктов</span> <button class="small" data-act="dept-checklist" data-id="${d.id}">Настроить</button></td>
        <td class="row-actions"><button class="small danger" data-act="dept-del" data-id="${d.id}">Удалить</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <p class="note">Порядок здесь = порядок вкладок. Название сохраняется при выходе из поля. Чек-лист — что должно случиться с новичком в первые 3 рабочих дня.</p>`;
}

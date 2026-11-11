// Тесты бизнес-логики: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workdaysBetween, isWorkday, nextWorkday, addDays } from '../src/dates.js';
import { computeMetrics, assessRisk } from '../src/risk.js';
import { buildAnalytics, isMatured } from '../src/analytics.js';
import { generateDemo } from '../src/data.js';

const TODAY = '2026-11-11'; // среда

const base = (over = {}) => ({
  id: 't', name: 'Тест', dept: 'wh', position: 'Кладовщик', managerId: 'm1', mentor: 'Наставник',
  hireDate: '2026-11-02', status: 'active', leftDate: null, leftReason: null, checkins: {}, tasks: [], ...over,
});
const task = (created, started, closed, deadline = addDays(created, 3)) => ({ id: Math.random(), title: 'x', created, started, closed, deadline });

test('рабочие дни: выходные пропускаются', () => {
  assert.equal(isWorkday('2026-11-14'), false); // суббота
  assert.deepEqual(workdaysBetween('2026-11-06', '2026-11-10'), ['2026-11-06', '2026-11-09', '2026-11-10']);
  assert.equal(nextWorkday('2026-11-13'), '2026-11-16'); // пятница → понедельник
});

test('новичок без задач 3+ раб. дня получает сигнал +3', () => {
  const r = assessRisk(base(), TODAY);
  assert.ok(r.reasons.some((x) => x.points === 3 && x.text.includes('ни одной задачи')));
});

test('активность = начал или завершил задачу; получение задачи не считается', () => {
  const e = base({ tasks: [task('2026-11-02', null, null, '2026-11-20')] });
  const m = computeMetrics(e, TODAY);
  assert.equal(m.received, 1);
  assert.equal(m.started, 0);
  // 02..10 ноября = 7 завершённых раб. дней без активности, сегодня не считаем
  assert.equal(m.idleStreak, 7);
  const r = assessRisk(e, TODAY);
  assert.ok(r.reasons.some((x) => x.text.startsWith('7 раб. дн. подряд')));
});

test('идеальный новичок — низкий риск', () => {
  const days = workdaysBetween('2026-11-02', '2026-11-10');
  const e = base({ tasks: days.map((d) => task(d, d, d)) });
  const r = assessRisk(e, TODAY);
  assert.equal(r.level, 'low');
  assert.equal(r.score, 0);
});

test('пропущенная встреча 7-го дня учитывается только после 3 дней отсрочки', () => {
  const days = (hire) => workdaysBetween(hire, '2026-11-10');
  const onTime = base({ hireDate: '2026-11-02', tasks: days('2026-11-02').map((d) => task(d, d, d)) }); // день 10
  assert.ok(!assessRisk(onTime, TODAY).reasons.some((x) => x.text.includes('7-го дня')));
  const late = base({ hireDate: '2026-10-29', tasks: days('2026-10-29').map((d) => task(d, d, d)) }); // день 14
  assert.ok(assessRisk(late, TODAY).reasons.some((x) => x.text.includes('7-го дня')));
  late.checkins = { d7: '2026-11-05' };
  assert.ok(!assessRisk(late, TODAY).reasons.some((x) => x.text.includes('7-го дня')));
});

test('пороги уровней: 5+ высокий, 2–4 внимание', () => {
  const noMentorNoTasks = base({ mentor: '' }); // +2 наставник, +3 нет задач
  assert.equal(assessRisk(noMentorNoTasks, TODAY).level, 'high');
  const days = workdaysBetween('2026-11-02', '2026-11-10');
  const noMentor = base({ mentor: '', tasks: days.map((d) => task(d, d, d)) });
  assert.equal(assessRisk(noMentor, TODAY).level, 'medium');
});

test('после 90 дней и после увольнения риск не считается', () => {
  assert.equal(assessRisk(base({ hireDate: '2026-07-01' }), TODAY).level, 'done');
  assert.equal(assessRisk(base({ status: 'left', leftDate: '2026-11-05' }), TODAY).level, 'left');
});

test('метрики уволившегося считаются на дату увольнения', () => {
  const e = base({ status: 'left', leftDate: '2026-11-04', tasks: [task('2026-11-02', '2026-11-02', null, '2026-11-03'), task('2026-11-09', null, null)] });
  const m = computeMetrics(e, TODAY);
  assert.equal(m.received, 1); // задача от 09.11 после увольнения не считается
  assert.equal(m.tenureDays, 3);
  assert.equal(m.overdue, 1);
});

test('генератор детерминирован и правдоподобен', () => {
  const a = generateDemo(TODAY);
  const b = generateDemo(TODAY);
  assert.deepEqual(a, b);
  const hiresYear = a.employees.filter((e) => e.hireDate >= addDays(TODAY, -365)).length;
  assert.ok(hiresYear > 100, 'больше 100 приёмов в год, как у компании');
  const inAdapt = a.employees.filter((e) => assessRisk(e, TODAY).level in { high: 1, medium: 1, low: 1 });
  assert.ok(inAdapt.length >= 25);
  assert.ok(a.employees.every((e) => e.tasks.every((t) => !t.closed || t.closed >= t.created)));
});

test('аналитика: в знаменатель идут только "созревшие" (90 дней прошло или ушёл раньше)', () => {
  const fresh = base({ hireDate: '2026-10-01' });
  assert.equal(isMatured(fresh, TODAY), false);
  assert.equal(isMatured({ ...fresh, status: 'left', leftDate: '2026-10-10' }, TODAY), true);
  const st = generateDemo(TODAY);
  const A = buildAnalytics(st, TODAY);
  assert.ok(A.matured < A.hires);
  assert.equal(A.byDept.reduce((s, d) => s + d.early, 0), A.early);
  assert.equal(A.byWeek.reduce((s, w) => s + w.count, 0), A.early);
});

test('демо "не протухает": через 2 недели даты сдвигаются на 14 дней, риск-картина та же', async () => {
  const { keepDemoFresh } = await import('../src/store.js');
  const st = generateDemo(TODAY);
  const before = st.employees.map((e) => assessRisk(e, TODAY).level).join();
  const later = addDays(TODAY, 15);
  keepDemoFresh(st, later);
  assert.equal(st.generatedFor, addDays(TODAY, 14));
  const after = st.employees.map((e) => assessRisk(e, later).level).join();
  // за лишний 1 день могут сместиться пограничные случаи, но не массово
  const diff = before.split(',').filter((l, i) => l !== after.split(',')[i]).length;
  assert.ok(diff <= 6, `изменилось уровней: ${diff}`);
});

test('действие сегодня обнуляет серию без активности, отметка сегодня — серию пропусков', () => {
  const idle = base({ tasks: [task('2026-11-02', null, null, '2026-11-20')], attendance: {} });
  let m = computeMetrics(idle, TODAY);
  assert.equal(m.idleStreak, 7);
  assert.equal(m.absentStreak, 7);
  assert.ok(assessRisk(idle, TODAY).reasons.some((r) => r.text.startsWith('Не отмечался на работе 7')));
  idle.tasks[0].started = TODAY;
  idle.attendance[TODAY] = '09:00';
  m = computeMetrics(idle, TODAY);
  assert.equal(m.idleStreak, 0);
  assert.equal(m.absentStreak, 0);
  assert.equal(m.checkedInToday, '09:00');
});

test('без данных об отметках правило пропусков не применяется', () => {
  const r = assessRisk(base(), TODAY);
  assert.ok(!r.reasons.some((x) => x.text.includes('отмеча')));
});

// ---- просрочка: не начата / застряла / завершена с опозданием ----
const healthy = (extra) => {
  const days = workdaysBetween('2026-11-02', '2026-11-10');
  return base({ tasks: [...days.map((d) => task(d, d, d)), ...extra] });
};
const why = (e) => assessRisk(e, TODAY).reasons.map((r) => `${r.points}:${r.text}`);

test('не начатая задача со сроком в прошлом — «не взялся»', () => {
  const e = healthy([task('2026-11-03', null, null, '2026-11-06')]);
  const m = computeMetrics(e, TODAY);
  assert.equal(m.overdueNotStarted, 1);
  assert.equal(m.overdueStuck, 0);
  assert.ok(why(e).includes('1:Не взялся за 1 задачу со сроком'));
});

test('начатая и не законченная после срока — «застряла», отдельный сигнал', () => {
  const e = healthy([1, 2, 3].map(() => task('2026-11-03', '2026-11-03', null, '2026-11-05')));
  const m = computeMetrics(e, TODAY);
  assert.equal(m.overdueStuck, 3);
  assert.equal(m.overdueNotStarted, 0);
  const r = assessRisk(e, TODAY).reasons.find((x) => x.text.includes('застряли'));
  assert.equal(r.points, 2);
  assert.ok(r.hint.includes('Разобрать'));
});

test('срок сегодня — ещё не просрочка', () => {
  const e = healthy([task('2026-11-09', null, null, TODAY)]);
  assert.equal(computeMetrics(e, TODAY).overdue, 0);
});

test('завершённая с опозданием не считается просроченной; разовое опоздание не штрафуется', () => {
  const e = healthy([task('2026-11-03', '2026-11-03', '2026-11-09', '2026-11-05')]);
  const m = computeMetrics(e, TODAY);
  assert.equal(m.overdue, 0);
  assert.equal(m.closedLate, 1);
  assert.ok(!why(e).some((t) => t.includes('опоздани')));
});

test('систематические опоздания (больше половины из 5+) дают +1', () => {
  const late = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => task(d, d, '2026-11-10', d));
  const ontime = [task('2026-11-06', '2026-11-06', '2026-11-06'), task('2026-11-09', '2026-11-09', '2026-11-09')];
  const e = base({ tasks: [...late, ...ontime] });
  const m = computeMetrics(e, TODAY);
  assert.equal(m.closedLate, 4);
  assert.equal(m.closed, 6);
  assert.ok(why(e).includes('1:Завершает с опозданием: 4 из 6 задач'));
});

// ---- правка задачи постановщиком: история версий и уведомление сотруднику ----
test('правка задачи пишет историю, повышает версию и помечает задачу «изменена»', async () => {
  const { editTask, hasUnseenChanges, markSeen, changesSince, versionSnapshot } = await import('../src/tasks.js');
  const t = { id: 1, title: 'Приёмка', description: 'Пересчитать', created: '2026-11-02', deadline: '2026-11-05', started: null, closed: null, version: 1, history: [], seenVersion: 1 };
  assert.equal(editTask(t, { title: 'Приёмка' }, 'm1', '2026-11-03'), null, 'без изменений истории нет');
  editTask(t, { deadline: '2026-11-07' }, 'm1', '2026-11-03', 'Поставка позже');
  editTask(t, { description: 'Пересчитать и сверить', deadline: '2026-11-09' }, 'm1', '2026-11-04');
  assert.equal(t.version, 3);
  assert.equal(t.history.length, 2);
  assert.equal(t.history[0].note, 'Поставка позже');
  assert.ok(hasUnseenChanges(t));
  // сводно с версии, которую видел сотрудник: срок 05.11 → 09.11, описание изменилось
  assert.deepEqual(changesSince(t, 1).deadline, { from: '2026-11-05', to: '2026-11-09' });
  assert.equal(changesSince(t, 1).description.from, 'Пересчитать');
  assert.deepEqual(versionSnapshot(t, 1), { title: 'Приёмка', description: 'Пересчитать', deadline: '2026-11-05' });
  assert.equal(versionSnapshot(t, 2).deadline, '2026-11-07');
  markSeen(t);
  assert.ok(!hasUnseenChanges(t));
  t.closed = '2026-11-10';
  assert.equal(editTask(t, { title: 'Другое' }, 'm1', '2026-11-10'), null, 'завершённую задачу не правим');
});

test('возврат на доработку: задача снова в работе, комментарий в истории, сотрудник получает уведомление', async () => {
  const { returnForRework, isRework, hasUnseenChanges, markSeen, editTask } = await import('../src/tasks.js');
  const t = { title: 'Выкладка', description: 'По планограмме', created: '2026-11-02', deadline: '2026-11-05', started: '2026-11-03', closed: '2026-11-04', version: 1, history: [], seenVersion: 1 };
  assert.equal(returnForRework(t, 'm3', TODAY, '  '), false, 'без комментария не возвращаем');
  assert.ok(returnForRework(t, 'm3', TODAY, 'Ценники не на всех позициях', '2026-11-13'));
  assert.equal(t.closed, null);
  assert.equal(t.started, '2026-11-03');
  assert.equal(t.deadline, '2026-11-13');
  assert.ok(isRework(t) && hasUnseenChanges(t));
  assert.equal(t.history[0].closedWas, '2026-11-04');
  // комментарий дописан в описание, а сданная версия восстанавливается из истории
  assert.equal(t.description, 'По планограмме\n\nДоработка 11.11.2026: Ценники не на всех позициях');
  const { versionSnapshot } = await import('../src/tasks.js');
  assert.deepEqual(versionSnapshot(t, 1), { title: 'Выкладка', description: 'По планограмме', deadline: '2026-11-05' });
  assert.equal(returnForRework(t, 'm3', TODAY, 'ещё раз'), false, 'открытую задачу вернуть нельзя');
  markSeen(t);
  editTask(t, { description: 'По планограмме, с ценниками' }, 'm3', TODAY);
  assert.ok(!isRework(t), 'после следующей правки задача — просто «изменена»');
  // открытая, срок 13.11 ещё не прошёл — не просрочка
  assert.equal(computeMetrics(base({ tasks: [t] }), TODAY).overdue, 0);
});

test('новая задача — «новая», а не «изменена», даже если её успели поправить', async () => {
  const { editTask, isNewTask, hasUnseenChanges } = await import('../src/tasks.js');
  const t = { title: 'A', description: '', deadline: '2026-11-12', version: 1, history: [], seenVersion: 0 };
  editTask(t, { deadline: '2026-11-13' }, 'm1', TODAY);
  assert.ok(isNewTask(t));
  assert.ok(!hasUnseenChanges(t));
});

test('чек-лист первых дней: с 3-го рабочего дня невыполненные пункты дают баллы', () => {
  const checklist = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }];
  const days = workdaysBetween('2026-11-02', '2026-11-10');
  const e = base({ tasks: days.map((d) => task(d, d, d)), onboarding: { c1: '2026-11-02', c2: '2026-11-02', c3: '2026-11-03' } });
  assert.ok(why(e).length === 0, 'без чек-листа отдела правило не применяется');
  assert.deepEqual(assessRisk(e, TODAY, { checklist }).reasons.map((r) => r.points), [1]);
  e.onboarding = { c1: '2026-11-02' };
  assert.deepEqual(assessRisk(e, TODAY, { checklist }).reasons.map((r) => r.points), [2]);
  assert.equal(assessRisk(e, '2026-11-03', { checklist }).reasons.filter((r) => r.text.includes('чек-лист')).length, 0, 'во 2-й рабочий день ещё рано');
});

test('опрос: оценка 1–2 даёт +2 с советом для руководителя, высокие оценки — в «в порядке»', () => {
  const days = workdaysBetween('2026-10-26', '2026-11-10');
  const e = base({ hireDate: '2026-10-26', checkins: { d7: '2026-11-02' }, tasks: days.map((d) => task(d, d, d)), pulse: { d7: { date: '2026-11-02', clarity: 2, support: 4, comfort: 5, comment: 'Не понимаю задачи' } } });
  const r = assessRisk(e, TODAY);
  const p = r.reasons.find((x) => x.text.startsWith('Опрос 7-го дня'));
  assert.equal(p.points, 2);
  assert.ok(p.hint.includes('Не понимаю задачи'));
  e.pulse.d7.clarity = 4;
  assert.ok(assessRisk(e, TODAY).ok.some((t) => t.startsWith('Опрос 7-го дня: средняя оценка 4.3')));
  assert.equal(computeMetrics(base({ hireDate: '2026-11-02' }), TODAY).pulseDue.key, 'd7', 'на 10-й день ждём ответ на опрос 7-го дня');
});

test('динамика за неделю: считаем те же правила на дату неделю назад', async () => {
  const { riskTrend } = await import('../src/risk.js');
  // вышел 26.10; неделю назад (04.11) наставник уже был, а встреча 7-го дня ещё не просрочена
  const days = workdaysBetween('2026-10-26', '2026-11-10');
  const e = base({ hireDate: '2026-10-26', tasks: days.map((d) => task(d, d, d)) });
  const tr = riskTrend(e, TODAY);
  assert.equal(tr.prevScore, 0);
  assert.equal(tr.delta, 2, 'встреча 7-го дня стала просроченной');
  assert.equal(riskTrend(base({ hireDate: '2026-11-06' }), TODAY), null, 'неделю назад ещё не работал');
  // встреча, проведённая после даты расчёта, неделю назад не считается проведённой
  e.checkins = { d7: '2026-11-10' };
  assert.equal(riskTrend(e, TODAY).delta, 0);
});

test('генератор: у задач есть описание, часть правок сотрудник ещё не видел', async () => {
  const { hasUnseenChanges } = await import('../src/tasks.js');
  const st = generateDemo(TODAY);
  const tasks = st.employees.flatMap((e) => e.tasks);
  assert.ok(tasks.every((t) => t.description && t.description.length > 30));
  assert.ok(tasks.some((t) => t.history.length && hasUnseenChanges(t)));
  assert.ok(tasks.every((t) => t.history.every((h) => h.at >= t.created && h.at <= TODAY)));
  assert.ok(st.departments.every((d) => d.checklist.length >= 4));
});

test('поздно закрытая задача перестаёт давать сигнал просрочки', () => {
  const t = task('2026-11-03', '2026-11-03', null, '2026-11-05');
  const e = healthy([t]);
  assert.equal(computeMetrics(e, TODAY).overdueStuck, 1);
  t.closed = TODAY;
  assert.equal(computeMetrics(e, TODAY).overdue, 0);
});

test('демо как у заказчика: ~400 работающих, ранние уходы — около трети всех уволившихся за год', async () => {
  const today = '2026-11-11';
  const s = generateDemo(today);
  const active = s.employees.filter((e) => e.status === 'active').length;
  assert.ok(active >= 350 && active <= 450, `работающих ${active}`);
  const A = buildAnalytics(s, today);
  assert.ok(A.leavers > 0 && A.earlyLeavers <= A.leavers);
  assert.ok(A.earlyShareOfLeavers >= 0.25 && A.earlyShareOfLeavers <= 0.42, `доля ${A.earlyShareOfLeavers}`);
  // по отделу считается тем же способом и не больше общего
  const d = buildAnalytics(s, today, s.departments[0].id);
  assert.ok(d.leavers <= A.leavers && d.earlyLeavers <= A.earlyLeavers);
});

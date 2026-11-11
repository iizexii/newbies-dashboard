// Генератор синтетических демо-данных. Реальных людей нет: ФИО собраны случайно из списков.
// Данные строятся относительно "сегодня", поэтому демо не устаревает.
// ВАЖНО: закономерности (профили "вовлечён / буксует / брошен", перекос по руководителям)
// заложены здесь вручную — аналитика на этих данных показывает то, что сюда положили.
import { addDays, diffDays, isWorkday, workdaysBetween } from './dates.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MALE_FIRST = ['Алексей', 'Дмитрий', 'Сергей', 'Иван', 'Максим', 'Артём', 'Никита', 'Павел', 'Егор', 'Роман', 'Кирилл', 'Олег', 'Тимур', 'Василий', 'Глеб', 'Илья'];
const FEMALE_FIRST = ['Анна', 'Мария', 'Екатерина', 'Ольга', 'Дарья', 'Алина', 'Юлия', 'Ксения', 'Виктория', 'Полина', 'Светлана', 'Татьяна', 'Валерия', 'Софья'];
const LAST = ['Петров', 'Соколов', 'Морозов', 'Волков', 'Зайцев', 'Павлов', 'Семёнов', 'Голубев', 'Виноградов', 'Богданов', 'Воробьёв', 'Фёдоров', 'Михайлов', 'Беляев', 'Тарасов', 'Белов', 'Комаров', 'Орехов', 'Киселёв', 'Макаров', 'Андреев', 'Ковалёв', 'Ильин', 'Гусев', 'Титов', 'Кузьмин', 'Кудрявцев', 'Баранов', 'Куликов', 'Алексеев', 'Степанов', 'Яковлев', 'Сорокин', 'Сергеев', 'Романов', 'Захаров', 'Борисов', 'Королёв', 'Герасимов', 'Пономарёв'];

export const DEFAULT_DEPARTMENTS = [
  { id: 'wh', name: 'Склад' },
  { id: 'shop', name: 'Магазины' },
  { id: 'sales', name: 'Отдел продаж' },
  { id: 'office', name: 'Офис' },
];

// Руководители: id — условный ID пользователя в Битрикс24 (для payload задачи).
export const DEFAULT_MANAGERS = [
  { id: 'm1', b24Id: 118, name: 'Громов Виктор', dept: 'wh' },
  { id: 'm2', b24Id: 124, name: 'Ткаченко Ирина', dept: 'wh' },
  { id: 'm3', b24Id: 131, name: 'Белова Ольга', dept: 'shop' },
  { id: 'm4', b24Id: 137, name: 'Фомин Артём', dept: 'shop' },
  { id: 'm5', b24Id: 142, name: 'Савельева Наталья', dept: 'shop' },
  { id: 'm6', b24Id: 150, name: 'Орлов Денис', dept: 'sales' },
  { id: 'm7', b24Id: 156, name: 'Кузьмина Елена', dept: 'sales' },
  { id: 'm8', b24Id: 163, name: 'Лебедева Марина', dept: 'office' },
];

const POSITIONS = {
  wh: ['Кладовщик', 'Комплектовщик', 'Водитель погрузчика', 'Грузчик'],
  shop: ['Продавец-консультант', 'Кассир', 'Старший продавец'],
  sales: ['Менеджер оптовых продаж', 'Менеджер по работе с клиентами'],
  office: ['Бухгалтер', 'Специалист по закупкам', 'Контент-менеджер', 'Офис-менеджер'],
};

const TASKS = {
  wh: ['Приёмка поставки №{n}', 'Сборка заказа №{n}', 'Инвентаризация стеллажа {L}', 'Перемещение остатков в зону {L}', 'Маркировка партии №{n}', 'Инструктаж по охране труда'],
  shop: ['Выкладка новой коллекции', 'Переоценка товара, отдел {L}', 'Инвентаризация отдела {L}', 'Оформление витрины', 'Обучение: кассовая программа', 'Приёмка товара №{n}'],
  sales: ['Звонок клиенту по заказу №{n}', 'Подготовить КП для клиента №{n}', 'Внести контакты в CRM', 'Обучение: ассортимент, раздел {L}', 'Сверка дебиторки по клиенту №{n}'],
  office: ['Сверка актов №{n}', 'Заявка поставщику №{n}', 'Загрузить карточки товаров, раздел {L}', 'Обучение: 1С', 'Подготовить отчёт для руководителя'],
};

const REASONS = [
  'Тяжёлый график / нагрузка',
  'Ожидания по деньгам не совпали',
  'Не обучили, непонятные задачи',
  'Не сложилось с руководителем',
  'Нашёл другую работу',
  'Не прошёл испытательный срок',
  'Личные обстоятельства',
];
export const LEAVE_REASONS = REASONS;

const PROFILES = {
  //            шанс задачи в день, начнёт, завершит, наставник, check-in, ранний уход
  engaged: { p: 0.6, start: 0.99, close: 0.98, mentor: 0.9, checkin: 0.9, leave: 0.12 },
  struggling: { p: 0.45, start: 0.85, close: 0.75, mentor: 0.6, checkin: 0.5, leave: 0.5 },
  neglected: { p: 0.3, start: 0.6, close: 0.5, mentor: 0.2, checkin: 0.15, leave: 0.65 },
};

export function generateDemo(today, seed = 20261111) {
  const r = rng(seed);
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const between = (a, b) => a + Math.floor(r() * (b - a + 1));
  const usedNames = new Set();
  let taskSeq = 1000;

  const makeName = () => {
    for (;;) {
      const female = r() < 0.45;
      const last = pick(LAST);
      const name = female ? `${last.replace(/(ов|ев|ёв|ин)$/, '$1а').replace(/ий$/, 'ая')} ${pick(FEMALE_FIRST)}` : `${last} ${pick(MALE_FIRST)}`;
      if (!usedNames.has(name)) { usedNames.add(name); return name; }
    }
  };

  const deptWeights = [['wh', 0.35], ['shop', 0.35], ['sales', 0.2], ['office', 0.1]];
  const pickDept = () => {
    let x = r();
    for (const [d, w] of deptWeights) { if ((x -= w) < 0) return d; }
    return 'wh';
  };

  const employees = [];
  // ~40 приняты за последние 90 дней, ~95 — раньше (итого >100 в год, как у компании).
  const hireOffsets = [
    ...Array.from({ length: 40 }, () => between(1, 89)),
    ...Array.from({ length: 95 }, () => between(90, 365)),
  ];

  hireOffsets.forEach((off, i) => {
    let hireDate = addDays(today, -off);
    while (!isWorkday(hireDate)) hireDate = addDays(hireDate, 1);
    if (hireDate >= today) hireDate = addDays(today, -3);
    while (!isWorkday(hireDate)) hireDate = addDays(hireDate, -1);
    const dept = pickDept();
    const managers = DEFAULT_MANAGERS.filter((m) => m.dept === dept);
    const manager = pick(managers);

    // Заложенный перекос: у Громова и Орлова новичков чаще "бросают".
    let x = r();
    if (manager.id === 'm1' || manager.id === 'm6') x -= 0.2;
    const profile = x < 0.15 ? 'neglected' : x < 0.4 ? 'struggling' : 'engaged';
    const P = PROFILES[profile];

    // Судьба
    let status = 'active';
    let leftDate = null;
    let leftReason = null;
    if (r() < P.leave) {
      const stay = r() < 0.6 ? between(4, 35) : between(36, 88);
      const d = addDays(hireDate, stay);
      if (d < today) {
        status = 'left'; leftDate = d;
        const bias = profile === 'neglected' ? [2, 2, 3] : dept === 'wh' ? [0, 0, 1] : dept === 'sales' ? [1, 1, 4] : [];
        leftReason = r() < 0.55 && bias.length ? REASONS[pick(bias)] : pick(REASONS);
      }
    } else if (off > 150 && r() < 0.12) {
      status = 'left'; leftDate = addDays(hireDate, between(95, off - 1)); leftReason = pick(REASONS);
    }

    const end = leftDate || today;
    const tenure = diffDays(hireDate, end) + 1;

    const mentor = r() < P.mentor ? makeName() : '';
    const checkins = {};
    for (const [key, day] of [['d7', 7], ['d30', 30], ['d60', 60]]) {
      if (tenure > day + 1 && r() < P.checkin) {
        const d = addDays(hireDate, day + between(0, 2));
        if (d <= end) checkins[key] = d;
      }
    }

    // Задачи генерируем только на период адаптации (первые ~100 дней).
    const genEnd = addDays(hireDate, Math.min(tenure - 1, 100));
    const wds = workdaysBetween(hireDate, genEnd);
    const firstTaskAfter = profile === 'neglected' ? between(3, 9) : profile === 'struggling' ? between(0, 3) : between(0, 1);
    // У "буксующих" активность затухает со второй половины срока (или к концу, если ушёл).
    const fadeFrom = Math.floor(wds.length * (0.35 + r() * 0.35));
    const tasks = [];
    wds.forEach((d, idx) => {
      if (idx < firstTaskAfter) return;
      const fading = profile !== 'engaged' && idx >= fadeFrom;
      const p = fading ? P.p * 0.35 : P.p;
      const n = r() < p ? (r() < 0.25 ? 2 : 1) : 0;
      for (let k = 0; k < n; k++) {
        const title = pick(TASKS[dept]).replace('{n}', between(1200, 9800)).replace('{L}', pick(['А', 'Б', 'В', 'Г', 'Д']) + between(1, 12));
        const startP = fading ? P.start * 0.5 : P.start;
        const closeP = fading ? P.close * 0.5 : P.close;
        const startIdx = idx + (r() < 0.7 ? 0 : between(1, 2));
        const started = r() < startP && wds[startIdx] ? wds[startIdx] : null;
        const closeIdx = startIdx + between(0, 3);
        const closed = started && r() < closeP && wds[closeIdx] ? wds[closeIdx] : null;
        tasks.push({
          id: taskSeq++,
          title,
          created: d,
          deadline: addDays(d, between(2, 5)),
          started: started && started <= end ? started : null,
          closed: closed && closed <= end ? closed : null,
        });
      }
    });

    // Отметки «я на работе» — только у работающих, за последние ~100 дней.
    let attendance;
    if (status === 'active') {
      attendance = {};
      const from = hireDate > addDays(today, -100) ? hireDate : addDays(today, -100);
      const offset = workdaysBetween(hireDate, from).length - 1;
      workdaysBetween(from, today).forEach((d, k) => {
        const idx = offset + k;
        const p = d === today ? 0.65
          : profile === 'engaged' ? 0.985
          : profile === 'struggling' ? (idx >= fadeFrom ? 0.72 : 0.97)
          : 0.88;
        if (r() < p) {
          const min = between(20, 75);
          attendance[d] = `${String(8 + Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
        }
      });
    }

    employees.push({
      id: `e${i + 1}`,
      attendance,
      name: makeName(),
      dept,
      position: pick(POSITIONS[dept]),
      managerId: manager.id,
      mentor,
      hireDate,
      status,
      leftDate,
      leftReason,
      checkins,
      tasks,
      _profile: profile, // служебное поле генератора, в UI не показываем
    });
  });

  // Пара поручений HR → руководителям, чтобы кабинеты не открывались пустыми.
  const cand = employees.filter((e) => e.status === 'active' && e._profile !== 'engaged' && diffDays(e.hireDate, today) < 85 && diffDays(e.hireDate, today) > 14);
  const actions = cand.slice(0, 3).map((e, k) => ({
    id: `a${k + 1}`,
    employeeId: e.id,
    title: `Встреча с новичком: ${e.name}`,
    description: `${e.name}: новичок пропадает из задач Б24, встреча адаптации не проведена.\nЧто сделать: встреча 1:1, выяснить, что мешает; при необходимости назначить наставника.`,
    responsibleId: e.managerId,
    created: addDays(today, -[6, 3, 2][k]),
    deadline: addDays(today, [-2, -1, 1][k]), // второе — просрочено
    status: k === 0 ? 'done' : 'open',
    doneAt: k === 0 ? addDays(today, -3) : null,
    comment: k === 0 ? 'Не хватало обучения по программе, договорились о наставнике' : '',
  }));

  return {
    version: 2,
    generatedFor: today,
    departments: structuredClone(DEFAULT_DEPARTMENTS),
    managers: structuredClone(DEFAULT_MANAGERS),
    employees,
    actions,
  };
}

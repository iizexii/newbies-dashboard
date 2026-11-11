// Генератор синтетических демо-данных. Реальных людей нет: ФИО собраны случайно из списков.
// Данные строятся относительно "сегодня", поэтому демо не устаревает.
// ВАЖНО: закономерности (профили "вовлечён / буксует / брошен", перекос по руководителям)
// заложены здесь вручную - аналитика на этих данных показывает то, что сюда положили.
import { addDays, diffDays, isWorkday, workdaysBetween } from './dates.js';
import { editTask } from './tasks.js';

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

const items = (...texts) => texts.map((text, i) => ({ id: `c${i + 1}`, text }));
// Чек-лист первых дней: что должно случиться с новичком в первые 3 рабочих дня.
export const DEFAULT_CHECKLIST = items('Рабочее место готово', 'Выданы доступы к нужным программам', 'Инструктаж по охране труда', 'Познакомили с наставником и командой');
export const DEFAULT_DEPARTMENTS = [
  { id: 'wh', name: 'Склад', checklist: items('Инструктаж по охране труда', 'Выданы спецодежда и пропуск', 'Доступ к складской программе и ТСД', 'Показали склад: зоны, стеллажи, правила', 'Познакомили с наставником и бригадой') },
  { id: 'shop', name: 'Магазины', checklist: items('Инструктаж по охране труда и кассовой дисциплине', 'Выданы форма и бейдж', 'Доступ к кассе и учётной программе', 'Показали зал и склад магазина', 'Познакомили с наставником и сменой') },
  { id: 'sales', name: 'Отдел продаж', checklist: items('Рабочее место и ноутбук', 'Доступы: Битрикс24, CRM, почта, телефония', 'Знакомство с ассортиментом и прайсом', 'Скрипты и регламент работы с клиентами', 'Познакомили с наставником и отделом') },
  { id: 'office', name: 'Офис', checklist: items('Рабочее место и компьютер', 'Доступы: Битрикс24, 1С, почта', 'Регламенты отдела', 'Познакомили с наставником и коллегами') },
];

// Руководители: id - условный ID пользователя в Битрикс24 (для payload задачи).
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

// Шаблоны задач: [название, описание - что именно сделать и какой результат]
const TASKS = {
  wh: [
    ['Приёмка поставки №{n}', 'Принять поставку №{n} по накладной: пересчитать места, проверить упаковку, сверить количество с документами.\nРасхождения оформить актом и сообщить старшему смены.\nРезультат: накладная подписана, товар в зоне приёмки.'],
    ['Сборка заказа №{n}', 'Собрать заказ №{n} по листу подбора в ТСД. Проверить артикулы и размеры, упаковать, наклеить этикетку.\nРезультат: заказ в зоне отгрузки, статус в программе - "Собран".'],
    ['Инвентаризация стеллажа {L}', 'Пересчитать товар на стеллаже {L} и сверить с остатками в программе.\nРасхождения записать в лист инвентаризации и передать наставнику.'],
    ['Перемещение остатков в зону {L}', 'Переместить остатки по списку в зону {L}. После перемещения отсканировать ячейки, чтобы остатки в программе совпали.'],
    ['Маркировка партии №{n}', 'Промаркировать партию №{n}: распечатать коды маркировки, наклеить на каждую единицу, отсканировать для ввода в оборот.'],
    ['Инструктаж по охране труда', 'Пройти инструктаж по охране труда у инженера ОТ и расписаться в журнале.\nВопросы по работе с погрузчиком и стеллажами задать на инструктаже.'],
  ],
  shop: [
    ['Выкладка новой коллекции', 'Выложить новую коллекцию по планограмме: размерный ряд слева направо, ценник на каждой позиции.\nСфотографировать выкладку и прикрепить фото к задаче.'],
    ['Переоценка товара, отдел {L}', 'Заменить ценники в отделе {L} по списку переоценки. Старые ценники сдать старшему продавцу.\nПроверить 5 случайных позиций на кассе: цена должна совпасть.'],
    ['Инвентаризация отдела {L}', 'Пересчитать товар в отделе {L} вместе со старшим продавцом. Результат внести в инвентаризационную ведомость.'],
    ['Оформление витрины', 'Оформить витрину по макету визуального мерчандайзера. Манекены - в образах из новой коллекции, подсветка включена.'],
    ['Обучение: кассовая программа', 'Пройти обучение по кассовой программе: продажа, возврат, оплата картой и по QR.\nПровести 3 тестовые продажи под присмотром наставника.'],
    ['Приёмка товара №{n}', 'Принять товар по накладной №{n}: пересчитать, проверить бирки и брак. Разложить на складе магазина по местам хранения.'],
  ],
  sales: [
    ['Звонок клиенту по заказу №{n}', 'Позвонить клиенту по заказу №{n}: подтвердить состав, сроки и адрес доставки.\nИтог разговора записать в карточку сделки в CRM.'],
    ['Подготовить КП для клиента №{n}', 'Подготовить коммерческое предложение для клиента №{n} по шаблону отдела. Цены - из актуального прайса, скидку согласовать с руководителем.\nРезультат: КП в карточке сделки.'],
    ['Внести контакты в CRM', 'Внести в CRM контакты с выставки по списку: ФИО, компания, телефон, интерес. Дубли не создавать - сначала искать по телефону.'],
    ['Обучение: ассортимент, раздел {L}', 'Изучить раздел ассортимента {L}: ключевые бренды, отличия моделей, частые вопросы клиентов.\nВ конце - короткий устный тест с наставником.'],
    ['Сверка дебиторки по клиенту №{n}', 'Сверить задолженность клиента №{n} с бухгалтерией. Если есть просрочка - согласовать с руководителем, как напомнить клиенту.'],
  ],
  office: [
    ['Сверка актов №{n}', 'Сверить акт №{n} с поставщиком: суммы, даты, номера документов. Расхождения выписать и отправить поставщику.'],
    ['Заявка поставщику №{n}', 'Оформить заявку №{n} поставщику по потребностям склада. Согласовать количество с руководителем и отправить по почте.'],
    ['Загрузить карточки товаров, раздел {L}', 'Загрузить на сайт карточки товаров раздела {L}: название, описание, характеристики, 3+ фото.\nПроверить, как карточки выглядят на телефоне.'],
    ['Обучение: 1С', 'Пройти вводное обучение по 1С: поиск документов, проведение, отчёты отдела. Вопросы задать наставнику.'],
    ['Подготовить отчёт для руководителя', 'Собрать недельный отчёт по шаблону: что сделано, что в работе, что мешает. Отправить руководителю до конца дня.'],
  ],
};

// Уточнения, которые постановщик дописывает в задачу (демо истории изменений).
const CLARIFY = [
  'Сначала сделать срочные позиции из списка, остальное - до конца срока.',
  'Перед началом подойти к наставнику: он покажет, как это делается у нас.',
  'Результат прикрепить к задаче - фото или файлом.',
  'Если что-то непонятно, пишите в комментариях к задаче, отвечу в течение часа.',
];
const MOVE_NOTES = ['Поставка пришла позже, сдвинул срок', 'Сначала нужно закончить обучение', 'Поменялся график смены', ''];

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
  // ~40 приняты за последние 90 дней, ~95 - раньше (итого >100 в год, как у компании).
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
        const [tt, td] = pick(TASKS[dept]);
        const num = between(1200, 9800);
        const loc = pick(['А', 'Б', 'В', 'Г', 'Д']) + between(1, 12);
        const fill = (x) => x.replace('{n}', num).replace('{L}', loc);
        const startP = fading ? P.start * 0.5 : P.start;
        const closeP = fading ? P.close * 0.5 : P.close;
        const startIdx = idx + (r() < 0.7 ? 0 : between(1, 2));
        const started = r() < startP && wds[startIdx] ? wds[startIdx] : null;
        const closeIdx = startIdx + between(0, 3);
        const closed = started && r() < closeP && wds[closeIdx] ? wds[closeIdx] : null;
        tasks.push({
          id: taskSeq++,
          title: fill(tt),
          description: fill(td),
          created: d,
          deadline: addDays(d, between(2, 5)),
          started: started && started <= end ? started : null,
          closed: closed && closed <= end ? closed : null,
          by: manager.id,
          version: 1,
          history: [],
          seenVersion: 1,
        });
      }
    });

    // Отметки "я на работе" - только у работающих, за последние ~100 дней.
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

  // Отдельные генераторы, чтобы добавление новых полей не меняло остальную картину.
  addTaskEdits(employees, today, rng(seed + 1));
  addPulses(employees, today, rng(seed + 2));
  leavePulsesUnanswered(employees, today);
  addOnboarding(employees, today, rng(seed + 3));

  // Давно работающие сотрудники (приняты 1-7 лет назад): без них почти все увольнения
  // в демо были бы ранними. У компании ~400 человек, и ранние уходы - около трети всех уходов.
  {
    const rv = rng(seed + 4);
    const pv = (arr) => arr[Math.floor(rv() * arr.length)];
    const bv = (a, b) => a + Math.floor(rv() * (b - a + 1));
    const lateReasons = ['Нашёл другую работу', 'Нашёл другую работу', 'Ожидания по деньгам не совпали', 'Тяжёлый график / нагрузка', 'Личные обстоятельства'];
    const vetName = () => {
      for (;;) {
        const female = rv() < 0.45;
        const last = pv(LAST);
        const name = female ? `${last.replace(/(ов|ев|ёв|ин)$/, '$1а').replace(/ий$/, 'ая')} ${pv(FEMALE_FIRST)}` : `${last} ${pv(MALE_FIRST)}`;
        if (!usedNames.has(name)) { usedNames.add(name); return name; }
      }
    };
    const pickDeptV = () => { let x = rv(); for (const [d, w] of deptWeights) { if ((x -= w) < 0) return d; } return 'wh'; };
    for (let k = 0; k < 380; k++) {
      let hireDate = addDays(today, -bv(366, 2555));
      while (!isWorkday(hireDate)) hireDate = addDays(hireDate, -1);
      const dept = pickDeptV();
      const manager = pv(DEFAULT_MANAGERS.filter((m) => m.dept === dept));
      let status = 'active', leftDate = null, leftReason = null;
      if (rv() < 0.16) { // ~16% опытных ушли за последний год - обычная текучесть для ритейла
        leftDate = addDays(today, -bv(1, 364));
        while (!isWorkday(leftDate)) leftDate = addDays(leftDate, -1);
        status = 'left'; leftReason = pv(lateReasons);
      }
      employees.push({
        id: `v${k + 1}`, attendance: undefined, name: vetName(), dept, position: pv(POSITIONS[dept]), managerId: manager.id,
        mentor: '', hireDate, status, leftDate, leftReason, checkins: {}, tasks: [], pulse: {}, onboarding: {}, _profile: 'veteran',
      });
    }
  }

  // Пара поручений HR → руководителям, чтобы кабинеты не открывались пустыми.
  const cand = employees.filter((e) => e.status === 'active' && e._profile !== 'engaged' && diffDays(e.hireDate, today) < 85 && diffDays(e.hireDate, today) > 14);
  const actions = cand.slice(0, 3).map((e, k) => ({
    id: `a${k + 1}`,
    employeeId: e.id,
    title: `Встреча с новичком: ${e.name}`,
    description: `${e.name}: новичок пропадает из задач Б24, встреча адаптации не проведена.\nЧто сделать: встреча 1:1, выяснить, что мешает; при необходимости назначить наставника.`,
    responsibleId: e.managerId,
    created: addDays(today, -[6, 8, 1][k]),
    deadline: addDays(today, [-2, -5, 2][k]), // второе просрочено и уходит в эскалацию к HR
    status: k === 0 ? 'done' : 'open',
    doneAt: k === 0 ? addDays(today, -3) : null,
    comment: k === 0 ? 'Не хватало обучения по программе, договорились о наставнике' : '',
    seenByManager: k !== 2, // третье поручение руководитель ещё не открывал
    hrSeen: k !== 0, // HR ещё не видел, что первое выполнено
    remindedAt: null,
  }));

  return {
    version: 6,
    generatedFor: today,
    departments: structuredClone(DEFAULT_DEPARTMENTS),
    managers: structuredClone(DEFAULT_MANAGERS),
    employees,
    actions,
  };
}

const lastWorkdayOnOrBefore = (d) => { while (!isWorkday(d)) d = addDays(d, -1); return d; };

/** Постановщик правит часть свежих открытых задач: сдвигает срок или дописывает уточнение. */
function addTaskEdits(employees, today, r) {
  for (const e of employees) {
    if (e.status !== 'active') continue;
    const fresh = e.tasks.filter((t) => !t.closed && t.created >= addDays(today, -14) && t.created < today);
    fresh.forEach((t, i) => {
      // у последней открытой задачи шанс выше: почти у каждого новичка в демо есть что показать
      if (r() > (i === fresh.length - 1 ? 0.6 : 0.25)) return;
      let at = lastWorkdayOnOrBefore(addDays(t.created, 1 + Math.floor(r() * 3)));
      if (at > today) at = lastWorkdayOnOrBefore(today);
      if (at < t.created) at = t.created;
      const kind = r();
      const patch = {};
      if (kind < 0.45 || kind >= 0.8) patch.deadline = addDays(t.deadline, 2 + Math.floor(r() * 3));
      if (kind >= 0.45) patch.description = `${t.description}\n\nУточнение: ${CLARIFY[Math.floor(r() * CLARIFY.length)]}`;
      editTask(t, patch, t.by, at, patch.deadline ? MOVE_NOTES[Math.floor(r() * MOVE_NOTES.length)] : '');
      t.seenVersion = r() < 0.4 ? t.version : 1; // часть правок сотрудник ещё не видел
    });
  }
}

/** Короткий опрос новичка на 7-й и 30-й день (оценки 1-5). */
function addPulses(employees, today, r) {
  const range = { engaged: [4, 5], struggling: [2, 4], neglected: [1, 3] };
  const answerP = { engaged: 0.9, struggling: 0.7, neglected: 0.45 };
  const comments = {
    engaged: ['Всё нравится, наставник помогает', 'Пока всё понятно', ''],
    struggling: ['Не всегда понятно, к кому идти с вопросом', 'Много задач сразу, не успеваю разобраться', ''],
    neglected: ['Никто толком не объяснил, что делать', 'Нет наставника, учусь сам', 'Чувствую себя лишним'],
  };
  for (const e of employees) {
    const end = e.leftDate || today;
    const tenure = diffDays(e.hireDate, end) + 1;
    e.pulse = {};
    for (const [key, day] of [['d7', 7], ['d30', 30]]) {
      if (tenure <= day + 1 || r() > answerP[e._profile]) continue;
      const date = addDays(e.hireDate, day + Math.floor(r() * 3));
      if (date > end) continue;
      const [lo, hi] = range[e._profile];
      const score = () => lo + Math.floor(r() * (hi - lo + 1));
      const fresh = diffDays(date, today) <= 6;
      const list = comments[e._profile];
      e.pulse[key] = { date, clarity: score(), support: score(), comfort: score(), comment: list[Math.floor(r() * list.length)], hrSeen: !fresh, mgrSeen: !fresh };
    }
  }
}

/**
 * Часть новичков тянет с ответом на опрос: опрос открыт 5-11 дней, ответа нет.
 * На них в демо видно напоминание руководителю. Выбор без случайности, чтобы не менять остальные данные:
 * все "проблемные" и каждый второй из остальных.
 */
function leavePulsesUnanswered(employees, today) {
  let n = 0;
  for (const e of employees) {
    if (e.status !== 'active') continue;
    const tenure = diffDays(e.hireDate, today) + 1;
    for (const [key, day] of [['d7', 7], ['d30', 30]]) {
      if (!e.pulse[key] || tenure < day + 6 || tenure > day + 12) continue;
      if (e._profile !== 'engaged' || n++ % 2 === 0) delete e.pulse[key];
    }
  }
}

/** Чек-лист первых дней: у "брошенных" новичков половина пунктов не выполнена. */
function addOnboarding(employees, today, r) {
  const p = { engaged: 1, struggling: 0.85, neglected: 0.45 };
  for (const e of employees) {
    const end = e.leftDate || today;
    const list = DEFAULT_DEPARTMENTS.find((d) => d.id === e.dept).checklist;
    e.onboarding = {};
    for (const c of list) {
      if (r() > p[e._profile]) continue;
      let d = addDays(e.hireDate, Math.floor(r() * 3));
      while (!isWorkday(d)) d = addDays(d, 1);
      if (d <= end) e.onboarding[c.id] = d;
    }
  }
}

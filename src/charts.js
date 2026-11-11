// Небольшие графики на HTML/CSS (без библиотек). Подсказка при наведении — атрибут data-tip,
// его показывает общий обработчик в app.js. Цвет никогда не единственный носитель смысла:
// у каждого графика есть легенда или подписи значений.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const strip = (h) => String(h).replace(/<[^>]+>/g, '').replace(/s+/g, ' ').trim();

/** Те же данные таблицей: для чтения с экранного диктора и для точных чисел. */
function dataTable(head, rows) {
  return `<details class="ch-table"><summary>Показать таблицей</summary><table class="mini-table"><thead><tr>${head.map((h, i) => `<th class="${i ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${i ? 'num' : ''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

export function legend(items) {
  return `<div class="ch-legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}

/** Горизонтальные столбики с накоплением: строки = отделы, сегменты = уровни риска. */
export function stackedBars(rows, segments, { act } = {}) {
  const max = Math.max(1, ...rows.map((r) => segments.reduce((s, g) => s + (r.values[g.key] || 0), 0)));
  return `${legend(segments)}<div class="ch-stack">${rows.map((r) => {
    const total = segments.reduce((s, g) => s + (r.values[g.key] || 0), 0);
    return `<div class="ch-srow" ${act ? `data-act="${act}" data-id="${r.id}" role="button" tabindex="0"` : ''}>
      <span class="ch-label">${esc(r.label)}</span>
      <span class="ch-strack">
        ${total ? `<span class="ch-sfill" style="width:${(total / max) * 100}%">${segments.map((g) => {
          const v = r.values[g.key] || 0;
          return v ? `<i style="flex:${v};background:${g.color}" data-tip="${esc(`${r.label}: ${g.label.toLowerCase()} — ${v}`)}" tabindex="0">${v}</i>` : '';
        }).join('')}</span>` : '<span class="muted ch-zero">нет новичков</span>'}
      </span>
      <span class="ch-total">${total}</span>
    </div>`;
  }).join('')}</div>${dataTable([' ', ...segments.map((g) => g.label), 'Всего'], rows.map((r) => [r.label, ...segments.map((g) => r.values[g.key] || 0), segments.reduce((s, g) => s + (r.values[g.key] || 0), 0)]))}`;
}

/** Горизонтальные столбики одной серии. rows: {label, value, text, tip} */
export function hBars(rows, color = 'var(--s1)', max) {
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value ?? 0));
  return `<div class="ch-stack">${rows.map((r) => `
    <div class="ch-srow">
      <span class="ch-label" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="ch-strack"><span class="ch-sfill" style="width:${((r.value ?? 0) / top) * 100}%"><i style="flex:1;background:${color}" data-tip="${esc(r.tip || `${r.label}: ${strip(r.text)}`)}" tabindex="0"></i></span></span>
      <span class="ch-total wide">${r.text}</span>
    </div>`).join('')}</div>${dataTable([' ', 'Значение'], rows.map((r) => [r.label, strip(r.text)]))}`;
}

/**
 * Вертикальные столбцы: одна или несколько серий по категориям.
 * cats: ['янв', ...], series: [{label, color, values: [...]}]
 */
export function columns(cats, series, { height = 170, showValues = series.length === 1 } = {}) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return `${series.length > 1 ? legend(series) : ''}
  <div class="ch-cols" style="height:${height}px">
    <div class="ch-grid">${ticks.map((t) => `<span style="bottom:${(t / top) * 100}%"><em>${t}</em></span>`).join('')}</div>
    ${cats.map((c, i) => `<div class="ch-col">
      <div class="ch-bars">${series.map((s) => {
        const v = s.values[i];
        return `<span class="ch-bar" style="height:${(v / top) * 100}%;background:${s.color}" data-tip="${esc(`${c}: ${s.label.toLowerCase()} — ${v}`)}" tabindex="0">${showValues && v ? `<b>${v}</b>` : ''}</span>`;
      }).join('')}</div>
    </div>`).join('')}
  </div>
  <div class="ch-xlabels">${cats.map((c) => `<span>${esc(c)}</span>`).join('')}</div>${dataTable([' ', ...series.map((x) => x.label)], cats.map((c, i) => [c, ...series.map((x) => x.values[i])]))}`;
}

function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

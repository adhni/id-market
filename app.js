const COLORS = ["#0f766e", "#f97316", "#2563eb", "#dc2626", "#7c3aed", "#059669", "#d97706", "#0284c7", "#be123c", "#4f46e5"];
const DEFAULT_SERIES = ["BBCA", "BBRI", "BMRI", "USDIDR"];
const BENCHMARK_IDS = ["USDIDR", "GOLD", "OIL_WTI"];
const CHART_DIMS = { width: 1100, height: 520, pad: { top: 28, right: 28, bottom: 56, left: 78 } };

const state = {
  rawSeries: [],
  metadata: [],
  seriesMap: new Map(),
  metadataMap: new Map(),
  selectedSeries: new Set(DEFAULT_SERIES),
  mode: "growth",
  benchmark: "USDIDR",
  startDate: null,
  endDate: null,
  allDates: [],
  hoverIndex: null,
  lastDisplay: { series: [], dates: [], units: [] },
};

async function loadTextWithFallback(path, embeddedId) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (error) {
    const embedded = document.getElementById(embeddedId)?.textContent?.trim();
    if (!embedded) throw error;
    return embedded;
  }
}

function parseCSV(text) {
  const rows = [];
  const lines = text.trim().split(/\r?\n/);
  const headers = splitCSVLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = splitCSVLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function splitCSVLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function buildMaps(seriesRows, metadataRows) {
  const grouped = new Map();
  for (const row of seriesRows) {
    if (row.frequency !== "monthly") continue;
    const item = {
      date: row.date,
      value: Number(row.value),
      unit: row.unit,
      category: row.category,
      display_name: row.display_name,
    };
    if (!grouped.has(row.series_id)) grouped.set(row.series_id, []);
    grouped.get(row.series_id).push(item);
  }
  for (const values of grouped.values()) {
    values.sort((a, b) => a.date.localeCompare(b.date));
  }
  const metaMap = new Map(metadataRows.map((row) => [row.series_id, row]));
  return { grouped, metaMap };
}

function setupControls() {
  renderSeriesList();
  renderBenchmarkOptions();
  populateDateSelects();
  setupTooltipButtons();

  document.getElementById("modeSelect").addEventListener("change", (event) => {
    state.mode = event.target.value;
    render();
  });

  document.getElementById("benchmarkSelect").addEventListener("change", (event) => {
    state.benchmark = event.target.value;
    render();
  });

  document.getElementById("startDate").addEventListener("change", (event) => {
    state.startDate = event.target.value;
    clampDateRange();
    syncTimeframeButtons(null);
    render();
  });

  document.getElementById("endDate").addEventListener("change", (event) => {
    state.endDate = event.target.value;
    clampDateRange();
    syncTimeframeButtons(null);
    render();
  });

  document.getElementById("resetSelections").addEventListener("click", () => {
    state.selectedSeries = new Set(DEFAULT_SERIES.filter((id) => state.metadataMap.has(id)));
    state.mode = "growth";
    state.benchmark = "USDIDR";
    state.startDate = state.allDates[0];
    state.endDate = state.allDates[state.allDates.length - 1];
    state.hoverIndex = null;
    document.getElementById("modeSelect").value = state.mode;
    document.getElementById("benchmarkSelect").value = state.benchmark;
    populateDateSelects();
    syncTimeframeButtons("MAX");
    renderSeriesList();
    render();
  });

  document.querySelectorAll("#timeframeButtons button").forEach((button) => {
    button.addEventListener("click", () => applyTimeframe(button.dataset.range));
  });
}

function setupTooltipButtons() {
  document.querySelectorAll(".info-dot").forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.toggle("open");
    });
    button.addEventListener("blur", () => {
      button.classList.remove("open");
    });
  });
}

function renderSeriesList() {
  const host = document.getElementById("seriesList");
  host.innerHTML = "";
  const rows = [...state.metadata].sort((a, b) => sortMeta(a, b));
  rows.forEach((row) => {
    const checked = state.selectedSeries.has(row.series_id);
    const label = document.createElement("label");
    label.className = `series-item ${checked ? "active" : ""}`;
    label.innerHTML = `
      <input type="checkbox" value="${row.series_id}" ${checked ? "checked" : ""} />
      <span class="series-copy">
        <span class="series-name">${row.display_name}</span>
        <span class="series-meta">${row.short_name} · ${row.category}${row.sector ? ` · ${row.sector}` : ""}</span>
      </span>
    `;
    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selectedSeries.add(row.series_id);
      } else {
        state.selectedSeries.delete(row.series_id);
      }
      state.hoverIndex = null;
      renderSeriesList();
      render();
    });
    host.appendChild(label);
  });
}

function sortMeta(a, b) {
  const order = { stock: 0, fx: 1, commodity: 2, index: 3 };
  return (order[a.category] ?? 99) - (order[b.category] ?? 99) || a.display_name.localeCompare(b.display_name);
}

function renderBenchmarkOptions() {
  const select = document.getElementById("benchmarkSelect");
  select.innerHTML = "";
  BENCHMARK_IDS.forEach((id) => {
    const meta = state.metadataMap.get(id);
    if (!meta) return;
    select.add(new Option(meta.short_name || meta.display_name, id, false, id === state.benchmark));
  });
}

function populateDateSelects() {
  const startSelect = document.getElementById("startDate");
  const endSelect = document.getElementById("endDate");
  startSelect.innerHTML = "";
  endSelect.innerHTML = "";
  state.allDates.forEach((date) => {
    startSelect.add(new Option(formatMonth(date), date, false, date === state.startDate));
    endSelect.add(new Option(formatMonth(date), date, false, date === state.endDate));
  });
}

function applyTimeframe(range) {
  if (!state.allDates.length) return;
  state.endDate = state.allDates[state.allDates.length - 1];
  if (range === "MAX") {
    state.startDate = state.allDates[0];
  } else {
    const years = Number(range.replace("Y", ""));
    const end = new Date(`${state.endDate}T00:00:00`);
    const target = new Date(Date.UTC(end.getUTCFullYear() - years, end.getUTCMonth(), 1));
    const targetStr = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-01`;
    state.startDate = state.allDates.find((date) => date >= targetStr) || state.allDates[0];
  }
  populateDateSelects();
  syncTimeframeButtons(range);
  render();
}

function syncTimeframeButtons(active) {
  document.querySelectorAll("#timeframeButtons button").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === active);
  });
}

function clampDateRange() {
  if (state.startDate > state.endDate) {
    if (document.activeElement?.id === "startDate") {
      state.endDate = state.startDate;
    } else {
      state.startDate = state.endDate;
    }
    populateDateSelects();
  }
}

function formatMonth(date) {
  const [year, month] = date.split("-");
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${monthNames[Number(month) - 1]} ${year}`;
}

function getSeriesWithinRange(seriesId) {
  const rows = state.seriesMap.get(seriesId) || [];
  return rows.filter((row) => row.date >= state.startDate && row.date <= state.endDate);
}

function getCommonDates(seriesIds) {
  const sets = seriesIds.map((id) => new Set(getSeriesWithinRange(id).map((row) => row.date)));
  if (!sets.length) return [];
  return [...sets[0]].filter((date) => sets.every((set) => set.has(date))).sort();
}

function alignSeriesToDates(seriesId, dates) {
  const map = new Map(getSeriesWithinRange(seriesId).map((row) => [row.date, row]));
  return dates.map((date) => ({ date, ...map.get(date) }));
}

function transformSeries(alignedRows, benchmarkRows) {
  if (!alignedRows.length) return [];
  if (state.mode === "price") {
    return alignedRows.map((row) => ({ date: row.date, value: row.value }));
  }
  if (state.mode === "growth") {
    const first = alignedRows[0].value;
    return alignedRows.map((row) => ({ date: row.date, value: (row.value / first) * 100 }));
  }
  const benchMap = new Map(benchmarkRows.map((row) => [row.date, row.value]));
  const firstRatio = alignedRows[0].value / benchMap.get(alignedRows[0].date);
  return alignedRows.map((row) => ({
    date: row.date,
    value: ((row.value / benchMap.get(row.date)) / firstRatio) * 100,
  }));
}

function buildDisplaySeries() {
  const selected = [...state.selectedSeries].filter((id) => state.seriesMap.has(id));
  if (!selected.length) return { series: [], dates: [], reason: "no-selection", units: [] };

  const comparisonIds = state.mode === "relative" ? [...selected, state.benchmark] : selected;
  const commonDates = getCommonDates(comparisonIds);
  if (!commonDates.length) return { series: [], dates: [], reason: "no-common-dates", units: [] };

  const benchmarkRows = state.mode === "relative" ? alignSeriesToDates(state.benchmark, commonDates) : [];
  const series = selected.map((seriesId) => {
    const aligned = alignSeriesToDates(seriesId, commonDates);
    const values = transformSeries(aligned, benchmarkRows);
    const meta = state.metadataMap.get(seriesId);
    return {
      id: seriesId,
      meta,
      rawUnit: meta?.currency_or_unit || aligned[0]?.unit || "",
      values,
    };
  }).filter((entry) => entry.values.length);

  if (!series.length) return { series: [], dates: [], reason: "no-values", units: [] };

  return {
    series,
    dates: commonDates,
    reason: null,
    units: [...new Set(series.map((entry) => entry.rawUnit).filter(Boolean))],
  };
}

function render() {
  updateCopy();
  const display = buildDisplaySeries();
  state.lastDisplay = display;
  const maxIndex = display.dates.length ? display.dates.length - 1 : null;
  if (state.hoverIndex != null && (maxIndex == null || state.hoverIndex > maxIndex)) {
    state.hoverIndex = maxIndex;
  }

  renderLegend(display.series);
  renderChart(display);
  renderSummary(display.series);
  updateSnapshot(display);
  document.getElementById("coverageText").textContent = `${state.startDate?.slice(0, 7) || "-"} to ${state.endDate?.slice(0, 7) || "-"}`;
}

function updateCopy() {
  const yAxisLabel = document.getElementById("yAxisLabel");
  const chartTitle = document.getElementById("chartTitle");
  const chartSubtitle = document.getElementById("chartSubtitle");
  const modeHelp = document.getElementById("modeHelp");
  const footnote = document.getElementById("chartFootnote");

  if (state.mode === "growth") {
    yAxisLabel.textContent = "Index (Start = 100)";
    chartTitle.textContent = "Growth since start";
    chartSubtitle.textContent = "Every selected series starts at 100 on the first visible month, so the slope shows cumulative growth rather than raw price level.";
    modeHelp.textContent = "Best default for comparing unlike assets because everything is rebased to a common starting point.";
    footnote.textContent = "Growth mode rebases each selected monthly series to 100 at the chosen start month.";
  } else if (state.mode === "price") {
    yAxisLabel.textContent = "Actual value";
    chartTitle.textContent = "Price";
    chartSubtitle.textContent = "Raw monthly values from the local dataset. Useful for inspecting one line closely or comparing similar units.";
    modeHelp.textContent = "Price mode keeps original units, so lines can be visually misleading when units differ.";
    footnote.textContent = "Price mode preserves raw monthly values. Mixed units are shown together for exploration only.";
  } else {
    const benchmarkName = state.metadataMap.get(state.benchmark)?.short_name || state.benchmark;
    yAxisLabel.textContent = "Relative performance";
    chartTitle.textContent = `Performance vs ${benchmarkName}`;
    chartSubtitle.textContent = "Lines above 100 outperformed the benchmark from the chosen start month. Lines below 100 lagged it.";
    modeHelp.textContent = "Each selected series is divided by the chosen benchmark and then rebased to 100.";
    footnote.textContent = `Relative mode compares each selected monthly series against ${benchmarkName}.`;
  }
}

function updateSnapshot(display) {
  const selectedCount = document.getElementById("selectedCount");
  const activeBenchmark = document.getElementById("activeBenchmark");
  const windowMonths = document.getElementById("windowMonths");
  const chartReadingHint = document.getElementById("chartReadingHint");
  const benchmarkName = state.metadataMap.get(state.benchmark)?.short_name || state.benchmark;
  const months = display.dates.length;

  selectedCount.textContent = `${display.series.length} ${display.series.length === 1 ? "series" : "series"}`;
  activeBenchmark.textContent = state.mode === "relative" ? benchmarkName : "Off in this mode";
  windowMonths.textContent = months ? `${months} ${months === 1 ? "month" : "months"}` : "No shared window";

  if (!display.series.length) {
    chartReadingHint.textContent = "Adjust the selection or date window";
  } else if (state.mode === "price" && display.units.length > 1) {
    chartReadingHint.textContent = "Mixed units on one axis";
  } else if (state.mode === "relative") {
    chartReadingHint.textContent = `Relative to ${benchmarkName}`;
  } else {
    chartReadingHint.textContent = "Hover the chart for monthly detail";
  }
}

function renderLegend(displaySeries) {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  displaySeries.forEach((series, index) => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${COLORS[index % COLORS.length]}"></span>${series.meta.short_name}`;
    legend.appendChild(item);
  });
}

function renderSummary(displaySeries) {
  const tbody = document.getElementById("summaryBody");
  const highlights = document.getElementById("summaryHighlights");
  tbody.innerHTML = "";
  highlights.innerHTML = "";

  if (!displaySeries.length) {
    highlights.innerHTML = `<div class="highlight-card empty">No summary yet. Select at least one series with a valid shared monthly window.</div>`;
    return;
  }

  const ranked = displaySeries.map((series) => {
    const start = series.values[0]?.value;
    const end = series.values[series.values.length - 1]?.value;
    const pct = ((end / start) - 1) * 100;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${series.meta.display_name}</td>
      <td>${formatSummaryValue(start, series.rawUnit)}</td>
      <td>${formatSummaryValue(end, series.rawUnit)}</td>
      <td class="${pct >= 0 ? "positive" : "negative"}">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);

    return { series, start, end, pct };
  }).sort((a, b) => b.pct - a.pct);

  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];
  const avgPct = ranked.reduce((sum, item) => sum + item.pct, 0) / ranked.length;

  highlights.innerHTML = `
    <div class="highlight-card">
      <span class="highlight-label">Leader</span>
      <strong>${leader.series.meta.short_name}</strong>
      <span class="${leader.pct >= 0 ? "positive" : "negative"}">${leader.pct >= 0 ? "+" : ""}${leader.pct.toFixed(1)}%</span>
    </div>
    <div class="highlight-card">
      <span class="highlight-label">Laggard</span>
      <strong>${laggard.series.meta.short_name}</strong>
      <span class="${laggard.pct >= 0 ? "positive" : "negative"}">${laggard.pct >= 0 ? "+" : ""}${laggard.pct.toFixed(1)}%</span>
    </div>
    <div class="highlight-card">
      <span class="highlight-label">Average move</span>
      <strong>${avgPct >= 0 ? "+" : ""}${avgPct.toFixed(1)}%</strong>
      <span>${ranked.length} selected lines</span>
    </div>
  `;
}

function renderChart(display) {
  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("chartTooltip");
  const emptyState = document.getElementById("chartEmptyState");
  const stage = document.getElementById("chartStage");
  svg.innerHTML = "";
  hideTooltip();

  const { width, height, pad } = CHART_DIMS;
  const { series: displaySeries, dates } = display;
  const reason = getEmptyReason(display.reason);

  if (!displaySeries.length) {
    stage.classList.add("is-empty");
    emptyState.classList.remove("hidden");
    emptyState.innerHTML = `<strong>${reason.title}</strong><span>${reason.body}</span>`;
    return;
  }

  stage.classList.remove("is-empty");
  emptyState.classList.add("hidden");

  const values = displaySeries.flatMap((series) => series.values.map((point) => point.value));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const hoverIndex = state.hoverIndex ?? dates.length - 1;

  const x = (index) => pad.left + (index / Math.max(dates.length - 1, 1)) * chartWidth;
  const y = (value) => pad.top + (1 - ((value - min) / span)) * chartHeight;

  svg.insertAdjacentHTML("beforeend", `<rect x="${pad.left}" y="${pad.top}" width="${chartWidth}" height="${chartHeight}" rx="20" fill="rgba(255,255,255,0.55)"></rect>`);

  const ticks = buildTicks(min, max, 5);
  ticks.forEach((tick) => {
    const yy = y(tick);
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="rgba(107,114,128,0.18)" />
      <text x="${pad.left - 14}" y="${yy + 4}" text-anchor="end" fill="#6b7280" font-size="12">${formatAxis(tick)}</text>
    `);
  });

  const referenceValue = state.mode === "price" ? (min <= 0 && max >= 0 ? 0 : null) : 100;
  if (referenceValue != null && referenceValue >= min && referenceValue <= max) {
    const yy = y(referenceValue);
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="rgba(15,23,42,0.28)" stroke-dasharray="5 5" />
    `);
  }

  const step = Math.max(1, Math.floor(dates.length / 6));
  dates.forEach((date, index) => {
    if (index % step !== 0 && index !== dates.length - 1) return;
    const xx = x(index);
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${xx}" y1="${height - pad.bottom + 6}" x2="${xx}" y2="${height - pad.bottom + 12}" stroke="rgba(107,114,128,0.5)" />
      <text x="${xx}" y="${height - 18}" text-anchor="middle" fill="#6b7280" font-size="12">${formatMonth(date)}</text>
    `);
  });

  displaySeries.forEach((series, index) => {
    const color = COLORS[index % COLORS.length];
    const points = series.values.map((point, pointIndex) => `${x(pointIndex)},${y(point.value)}`).join(" ");
    const areaPoints = `${pad.left},${height - pad.bottom} ${points} ${x(series.values.length - 1)},${height - pad.bottom}`;
    const lastPoint = series.values[series.values.length - 1];
    const hoverPoint = series.values[hoverIndex];

    svg.insertAdjacentHTML("beforeend", `
      <polygon fill="${color}" opacity="0.06" points="${areaPoints}"></polygon>
      <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
      <circle cx="${x(series.values.length - 1)}" cy="${y(lastPoint.value)}" r="4.5" fill="${color}" />
      <circle cx="${x(hoverIndex)}" cy="${y(hoverPoint.value)}" r="5.5" fill="white" stroke="${color}" stroke-width="3" />
    `);
  });

  const hoverX = x(hoverIndex);
  svg.insertAdjacentHTML("beforeend", `
    <line x1="${hoverX}" y1="${pad.top}" x2="${hoverX}" y2="${height - pad.bottom}" stroke="rgba(15,23,42,0.26)" stroke-dasharray="4 5" />
    <rect id="chartOverlay" x="${pad.left}" y="${pad.top}" width="${chartWidth}" height="${chartHeight}" fill="transparent" style="cursor:crosshair"></rect>
  `);

  const overlay = document.getElementById("chartOverlay");
  overlay.addEventListener("mousemove", (event) => onChartHover(event, chartWidth, x));
  overlay.addEventListener("mouseleave", () => {
    state.hoverIndex = dates.length - 1;
    renderChart(state.lastDisplay);
  });
  overlay.addEventListener("touchstart", (event) => onChartHover(event.touches[0], chartWidth, x), { passive: true });
  overlay.addEventListener("touchmove", (event) => onChartHover(event.touches[0], chartWidth, x), { passive: true });

  renderTooltip(display, hoverIndex, hoverX);
}

function onChartHover(event, chartWidth, xScale) {
  const svg = document.getElementById("chart");
  const bounds = svg.getBoundingClientRect();
  const relativeX = Math.max(0, Math.min(chartWidth, ((event.clientX - bounds.left) / bounds.width) * CHART_DIMS.width - CHART_DIMS.pad.left));
  const ratio = chartWidth ? relativeX / chartWidth : 0;
  const index = Math.round(ratio * Math.max(state.lastDisplay.dates.length - 1, 0));
  if (index !== state.hoverIndex) {
    state.hoverIndex = index;
    renderChart(state.lastDisplay);
    return;
  }
  renderTooltip(state.lastDisplay, index, xScale(index));
}

function renderTooltip(display, index, xPos) {
  const tooltip = document.getElementById("chartTooltip");
  const stage = document.getElementById("chartStage");
  if (!display.series.length || index == null) {
    hideTooltip();
    return;
  }

  const date = display.dates[index];
  const rows = display.series.map((series, seriesIndex) => {
    const point = series.values[index];
    const start = series.values[0]?.value;
    const deltaPct = ((point.value / start) - 1) * 100;
    return `
      <div class="tooltip-row">
        <span class="tooltip-series"><span class="legend-swatch" style="background:${COLORS[seriesIndex % COLORS.length]}"></span>${series.meta.short_name}</span>
        <span class="tooltip-value">${formatTooltipValue(point.value, series.rawUnit)}</span>
        <span class="${deltaPct >= 0 ? "positive" : "negative"}">${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%</span>
      </div>
    `;
  }).join("");

  tooltip.innerHTML = `
    <div class="tooltip-date">${formatMonth(date)}</div>
    ${rows}
  `;
  tooltip.setAttribute("aria-hidden", "false");

  const stageWidth = stage.clientWidth;
  const left = (xPos / CHART_DIMS.width) * stageWidth;
  tooltip.style.left = `${Math.min(Math.max(left, 110), stageWidth - 110)}px`;
  tooltip.style.top = "16px";
}

function hideTooltip() {
  const tooltip = document.getElementById("chartTooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.innerHTML = "";
}

function getEmptyReason(reason) {
  if (reason === "no-selection") {
    return {
      title: "No lines selected",
      body: "Pick at least one stock, FX, or commodity series from the left panel to start the comparison.",
    };
  }
  if (reason === "no-common-dates") {
    return {
      title: "No shared monthly window",
      body: "The selected lines and benchmark do not overlap inside the chosen date range. Try widening the range or changing the benchmark.",
    };
  }
  return {
    title: "Nothing to draw",
    body: "The current combination does not produce usable monthly points.",
  };
}

function buildTicks(min, max, count) {
  const ticks = [];
  for (let i = 0; i < count; i++) {
    ticks.push(min + ((max - min) * i) / (count - 1));
  }
  return ticks;
}

function formatAxis(value) {
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 100) return value.toFixed(1);
  return value.toFixed(2);
}

function formatSummaryValue(value, unit) {
  if (!Number.isFinite(value)) return "-";
  if (state.mode === "growth" || state.mode === "relative") return value.toFixed(1);
  return `${formatRawValue(value)}${unit ? ` ${unit}` : ""}`;
}

function formatTooltipValue(value, unit) {
  if (state.mode === "growth" || state.mode === "relative") return `${value.toFixed(1)}`;
  return `${formatRawValue(value)}${unit ? ` ${unit}` : ""}`;
}

function formatRawValue(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }
  if (Math.abs(value) >= 100) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

async function init() {
  const [seriesText, metadataText] = await Promise.all([
    loadTextWithFallback("data/series.csv", "embedded-series-csv"),
    loadTextWithFallback("data/metadata.csv", "embedded-metadata-csv"),
  ]);

  state.rawSeries = parseCSV(seriesText);
  state.metadata = parseCSV(metadataText);
  const { grouped, metaMap } = buildMaps(state.rawSeries, state.metadata);
  state.seriesMap = grouped;
  state.metadataMap = metaMap;
  state.allDates = [...new Set(state.rawSeries.filter((row) => row.frequency === "monthly").map((row) => row.date))].sort();
  state.startDate = state.allDates[0];
  state.endDate = state.allDates[state.allDates.length - 1];

  setupControls();
  populateDateSelects();
  syncTimeframeButtons("MAX");
  document.getElementById("modeSelect").value = state.mode;
  document.getElementById("benchmarkSelect").value = state.benchmark;
  render();
}

init();

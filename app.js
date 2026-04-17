const COLORS = ["#0f766e", "#f97316", "#2563eb", "#dc2626", "#7c3aed", "#059669", "#d97706", "#0284c7", "#be123c", "#4f46e5"];
const DEFAULT_SERIES = ["BBCA", "BBRI", "BMRI"];
const PRICE_GROWTH_BENCHMARK_IDS = ["IDR", "USDIDR", "EURIDR", "JPYIDR", "GOLD", "OIL_WTI", "COAL", "NICKEL", "PALM_OIL", "RICE"];
const RELATIVE_BENCHMARK_IDS = ["IDR", "USDIDR", "GOLD", "OIL_WTI"];
const CHART_DIMS = { width: 1100, height: 520, pad: { top: 28, right: 28, bottom: 56, left: 78 } };
const TROY_OUNCE_IN_GRAMS = 31.1034768;
const BARREL_IN_LITERS = 158.987294928;
const METRIC_TON_IN_KILOGRAMS = 1000;
const SERIES_GROUPS = [
  { key: "stock", title: "Stocks", caption: "Indonesian listed names grouped by sector." },
  { key: "fx", title: "FX", caption: "Currency reference series." },
  { key: "commodity", title: "Commodities", caption: "Global benchmark commodities in the bundled data." },
  { key: "index", title: "Other", caption: "Other series in the dataset." },
];

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
  seriesSearch: "",
  openGroups: new Set(),
  lastDisplay: { series: [], dates: [], units: [] },
};

const BENCHMARK_DEFS = {
  IDR: {
    label: "Rupiah (IDR)",
    displayUnit: "IDR",
    refs: [],
    convert: (idrValue) => idrValue,
  },
  USDIDR: {
    label: "US Dollar (USD)",
    displayUnit: "USD",
    refs: ["USDIDR"],
    convert: (idrValue, date, referenceMaps) => {
      const idrPerUnit = referenceMaps.get("USDIDR")?.get(date);
      if (!Number.isFinite(idrPerUnit) || idrPerUnit <= 0) return NaN;
      return idrValue / idrPerUnit;
    },
  },
  EURIDR: {
    label: "Euro (EUR)",
    displayUnit: "EUR",
    refs: ["EURIDR"],
    convert: (idrValue, date, referenceMaps) => {
      const idrPerUnit = referenceMaps.get("EURIDR")?.get(date);
      if (!Number.isFinite(idrPerUnit) || idrPerUnit <= 0) return NaN;
      return idrValue / idrPerUnit;
    },
  },
  JPYIDR: {
    label: "Japanese Yen (JPY)",
    displayUnit: "JPY",
    refs: ["JPYIDR"],
    convert: (idrValue, date, referenceMaps) => {
      const idrPerUnit = referenceMaps.get("JPYIDR")?.get(date);
      if (!Number.isFinite(idrPerUnit) || idrPerUnit <= 0) return NaN;
      return idrValue / idrPerUnit;
    },
  },
  GOLD: {
    label: "Milligram of Gold",
    displayUnit: "mg gold",
    refs: ["USDIDR", "GOLD"],
    convert: (idrValue, date, referenceMaps) => {
      const usdValue = idrToUsd(idrValue, date, referenceMaps);
      const goldUsdPerOunce = referenceMaps.get("GOLD")?.get(date);
      if (!Number.isFinite(usdValue) || !Number.isFinite(goldUsdPerOunce) || goldUsdPerOunce <= 0) return NaN;
      const usdPerGram = goldUsdPerOunce / TROY_OUNCE_IN_GRAMS;
      return (usdValue / usdPerGram) * 1000;
    },
  },
  OIL_WTI: {
    label: "Liters of Oil",
    displayUnit: "liters oil",
    refs: ["USDIDR", "OIL_WTI"],
    convert: (idrValue, date, referenceMaps) => {
      const usdValue = idrToUsd(idrValue, date, referenceMaps);
      const oilUsdPerBarrel = referenceMaps.get("OIL_WTI")?.get(date);
      if (!Number.isFinite(usdValue) || !Number.isFinite(oilUsdPerBarrel) || oilUsdPerBarrel <= 0) return NaN;
      const usdPerLiter = oilUsdPerBarrel / BARREL_IN_LITERS;
      return usdValue / usdPerLiter;
    },
  },
  COAL: {
    label: "Kilograms of Coal",
    displayUnit: "kg coal",
    refs: ["USDIDR", "COAL"],
    convert: (idrValue, date, referenceMaps) => convertUsdCommodityToKilograms(idrValue, date, referenceMaps, "COAL"),
  },
  NICKEL: {
    label: "Kilograms of Nickel",
    displayUnit: "kg nickel",
    refs: ["USDIDR", "NICKEL"],
    convert: (idrValue, date, referenceMaps) => convertUsdCommodityToKilograms(idrValue, date, referenceMaps, "NICKEL"),
  },
  PALM_OIL: {
    label: "Kilograms of Palm Oil",
    displayUnit: "kg palm oil",
    refs: ["USDIDR", "PALM_OIL"],
    convert: (idrValue, date, referenceMaps) => convertUsdCommodityToKilograms(idrValue, date, referenceMaps, "PALM_OIL"),
  },
  RICE: {
    label: "Kilograms of Rice",
    displayUnit: "kg rice",
    refs: ["USDIDR", "RICE"],
    convert: (idrValue, date, referenceMaps) => convertUsdCommodityToKilograms(idrValue, date, referenceMaps, "RICE"),
  },
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
  renderStockToggleDropdown();
  populateDateSelects();
  renderSelectedChips();
  setupTooltipButtons();
  setupModeButtons();

  document.getElementById("modeSelect").addEventListener("change", (event) => {
    state.mode = event.target.value;
    render();
  });

  document.getElementById("benchmarkSelect").addEventListener("change", (event) => {
    state.benchmark = event.target.value;
    render();
  });

  document.getElementById("seriesSearch").addEventListener("input", (event) => {
    state.seriesSearch = event.target.value.trim().toLowerCase();
    renderSeriesList();
  });

  document.getElementById("stockToggleSearch")?.addEventListener("input", () => {
    renderStockToggleDropdown();
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

  setupDateRangeSlider();

  document.getElementById("resetSelections").addEventListener("click", () => {
    state.selectedSeries = new Set(DEFAULT_SERIES.filter((id) => state.metadataMap.has(id)));
    state.mode = "price";
    state.benchmark = "USDIDR";
    state.startDate = state.allDates[0];
    state.endDate = state.allDates[state.allDates.length - 1];
    state.hoverIndex = null;
    state.seriesSearch = "";
    state.openGroups = new Set();
    document.getElementById("modeSelect").value = state.mode;
    document.getElementById("benchmarkSelect").value = state.benchmark;
    document.getElementById("seriesSearch").value = "";
    populateDateSelects();
    renderSeriesList();
    renderSelectedChips();
    applyTimeframe("3Y");
  });

  document.querySelectorAll("#timeframeButtons button").forEach((button) => {
    button.addEventListener("click", () => applyTimeframe(button.dataset.range));
  });

  document.querySelectorAll("#presetButtons button").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });
}

function setupModeButtons() {
  document.querySelectorAll("#modeButtons .mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      document.getElementById("modeSelect").value = state.mode;
      render();
    });
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
  const rows = [...state.metadata].filter((row) => row.category === "stock").sort((a, b) => sortMeta(a, b));
  const grouped = new Map(SERIES_GROUPS.map((group) => [group.key, []]));

  rows.forEach((row) => {
    const haystack = `${row.series_id} ${row.display_name} ${row.short_name} ${row.category} ${row.sector || ""}`.toLowerCase();
    if (state.seriesSearch && !haystack.includes(state.seriesSearch)) return;
    const groupKey = grouped.has(row.category) ? row.category : "index";
    grouped.get(groupKey).push(row);
  });

  SERIES_GROUPS.forEach((group) => {
    const items = grouped.get(group.key) || [];
    if (!items.length) return;

    const shouldOpen = state.seriesSearch ? true : state.openGroups.has(group.key);

    const wrapper = document.createElement("section");
    wrapper.className = `series-group ${shouldOpen ? "open" : ""}`;
    wrapper.innerHTML = `
      <button type="button" class="group-toggle" aria-expanded="${shouldOpen}">
        <span class="group-title">
          <span class="group-name">${group.title}</span>
          <span class="group-caption">${group.caption}</span>
        </span>
        <span class="group-count">${items.length} series</span>
      </button>
      <div class="group-body">
        <div class="series-grid"></div>
      </div>
    `;

    wrapper.querySelector(".group-toggle").addEventListener("click", () => {
      // Keep the search experience obvious by auto-opening all groups while filtering.
      if (state.seriesSearch) return;
      if (state.openGroups.has(group.key)) {
        state.openGroups.delete(group.key);
      } else {
        state.openGroups.add(group.key);
      }
      renderSeriesList();
    });

    const grid = wrapper.querySelector(".series-grid");
    items.forEach((row) => {
      const checked = state.selectedSeries.has(row.series_id);
      const coverage = formatCoverageLabel(row);
      const label = document.createElement("label");
      label.className = `series-item ${checked ? "active" : ""}`;
      label.innerHTML = `
        <input type="checkbox" value="${row.series_id}" ${checked ? "checked" : ""} />
        <span class="series-copy">
          <span class="series-name">${row.display_name}</span>
          <span class="series-meta">${row.short_name} · ${row.category}${row.sector ? ` · ${row.sector}` : ""}${coverage ? ` · ${coverage}` : ""}</span>
        </span>
      `;
      label.querySelector("input").addEventListener("change", (event) => {
        if (event.target.checked) {
          state.selectedSeries.add(row.series_id);
          state.openGroups.add(group.key);
        } else {
          state.selectedSeries.delete(row.series_id);
        }
        state.hoverIndex = null;
        renderSeriesList();
        renderSelectedChips();
        render();
      });
      grid.appendChild(label);
    });

    host.appendChild(wrapper);
  });

  if (!host.children.length) {
    host.innerHTML = `<div class="selected-empty">No stock matches. Try a ticker like BBCA, a sector like banks, or clear the search.</div>`;
  }
}

function renderSelectedChips() {
  const host = document.getElementById("selectedChips");
  const selected = [...state.selectedSeries]
    .map((id) => state.metadataMap.get(id))
    .filter(Boolean)
    .sort((a, b) => sortMeta(a, b));

  if (!selected.length) {
    host.innerHTML = `<span class="selected-empty">No stocks selected yet. Pick a preset or add stocks from the explorer.</span>`;
    return;
  }

  host.innerHTML = "";
  selected.forEach((row) => {
    const chip = document.createElement("span");
    chip.className = "selected-chip";
    chip.innerHTML = `${row.short_name}<button type="button" aria-label="Remove ${row.short_name}">&times;</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      state.selectedSeries.delete(row.series_id);
      renderSeriesList();
      renderSelectedChips();
      render();
    });
    host.appendChild(chip);
  });
}

function applyPreset(preset) {
  const presetMap = {
    default: DEFAULT_SERIES,
    banks: ["BBCA", "BBRI", "BMRI"],
    commodities: ["ADRO", "PTBA", "ANTM", "MDKA"],
    clear: [],
  };
  state.selectedSeries = new Set((presetMap[preset] || []).filter((id) => state.metadataMap.has(id)));
  state.openGroups = new Set();
  renderSeriesList();
  renderSelectedChips();
  render();
}

function sortMeta(a, b) {
  const order = { stock: 0, fx: 1, commodity: 2, index: 3 };
  return (order[a.category] ?? 99) - (order[b.category] ?? 99) || a.display_name.localeCompare(b.display_name);
}

function formatCoverageLabel(row) {
  if (!row?.coverage_start || !row?.coverage_end) return "";
  const start = row.coverage_start.slice(0, 7);
  const end = row.coverage_end.slice(0, 7);
  return start === end ? start : `${start} to ${end}`;
}

function getBenchmarkDef(id = state.benchmark) {
  return BENCHMARK_DEFS[id];
}

function idrToUsd(idrValue, date, referenceMaps) {
  const usdIdr = referenceMaps.get("USDIDR")?.get(date);
  if (!Number.isFinite(usdIdr) || usdIdr <= 0) return NaN;
  return idrValue / usdIdr;
}

function convertUsdCommodityToKilograms(idrValue, date, referenceMaps, seriesId) {
  const usdValue = idrToUsd(idrValue, date, referenceMaps);
  const usdPerMetricTon = referenceMaps.get(seriesId)?.get(date);
  if (!Number.isFinite(usdValue) || !Number.isFinite(usdPerMetricTon) || usdPerMetricTon <= 0) return NaN;
  return usdValue / (usdPerMetricTon / METRIC_TON_IN_KILOGRAMS);
}

function getBenchmarkLabel(id = state.benchmark) {
  const benchmarkDef = getBenchmarkDef(id);
  if (benchmarkDef) return benchmarkDef.label;
  const stockMeta = state.metadataMap.get(id);
  if (stockMeta?.category === "stock") return `${stockMeta.short_name} stock`;
  return stockMeta?.short_name || id;
}

function isStockBenchmark(id = state.benchmark) {
  return state.metadataMap.get(id)?.category === "stock";
}

function getPriceReferenceSeriesIds() {
  if (state.mode !== "price" && state.mode !== "growth") return [];
  if (isStockBenchmark()) return [state.benchmark];
  return getBenchmarkDef()?.refs || ["USDIDR"];
}

function getPriceDisplayUnit() {
  if (isStockBenchmark()) {
    const shortName = state.metadataMap.get(state.benchmark)?.short_name || state.benchmark;
    return `shares ${shortName}`;
  }
  return getBenchmarkDef()?.displayUnit || "USD";
}

function convertPriceValue(idrValue, date, referenceMaps) {
  if (isStockBenchmark()) {
    const benchmarkIdrValue = referenceMaps.get(state.benchmark)?.get(date);
    if (!Number.isFinite(benchmarkIdrValue) || benchmarkIdrValue <= 0) return NaN;
    return idrValue / benchmarkIdrValue;
  }
  const benchmarkDef = getBenchmarkDef();
  if (!benchmarkDef) return NaN;
  return benchmarkDef.convert(idrValue, date, referenceMaps);
}

function renderBenchmarkOptions() {
  const select = document.getElementById("benchmarkSelect");
  select.innerHTML = "";

  const macroGroup = document.createElement("optgroup");
  macroGroup.label = "Macro references";
  const macroIds = state.mode === "relative" ? RELATIVE_BENCHMARK_IDS : PRICE_GROWTH_BENCHMARK_IDS;
  macroIds.forEach((id) => {
    const shouldSkip = id !== "IDR" && !state.metadataMap.get(id);
    if (shouldSkip) return;
    macroGroup.appendChild(new Option(getBenchmarkLabel(id), id, false, id === state.benchmark));
  });
  select.appendChild(macroGroup);

  const stockGroup = document.createElement("optgroup");
  stockGroup.label = "Stocks";
  const stockRows = [...state.metadata]
    .filter((row) => row.category === "stock")
    .sort((a, b) => a.short_name.localeCompare(b.short_name));
  stockRows.forEach((row) => {
    const label = `${row.short_name} (${row.series_id})`;
    stockGroup.appendChild(new Option(label, row.series_id, false, row.series_id === state.benchmark));
  });
  select.appendChild(stockGroup);

  if (![...select.options].some((option) => option.value === state.benchmark)) {
    state.benchmark = "USDIDR";
  }
}

function renderStockToggleDropdown() {
  const host = document.getElementById("stockToggleList");
  const summary = document.getElementById("stockToggleSummary");
  const searchInput = document.getElementById("stockToggleSearch");
  if (!host || !summary) return;

  const selectedCount = state.selectedSeries.size;
  summary.textContent = selectedCount === 1 ? "1 selected" : `${selectedCount} selected`;

  const searchTerm = searchInput?.value?.trim().toLowerCase() || "";
  const stocks = [...state.metadata]
    .filter((row) => row.category === "stock")
    .filter((row) => {
      if (!searchTerm) return true;
      const haystack = `${row.series_id} ${row.display_name} ${row.short_name}`.toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  host.innerHTML = "";

  if (!stocks.length) {
    host.innerHTML = `<div class="selected-empty">No stocks match this search.</div>`;
    return;
  }

  stocks.forEach((row) => {
    const label = document.createElement("label");
    label.className = "stock-toggle-item";
    const checked = state.selectedSeries.has(row.series_id);
    const coverage = formatCoverageLabel(row);
    label.innerHTML = `
      <input type="checkbox" value="${row.series_id}" ${checked ? "checked" : ""} />
      <span class="stock-toggle-copy">
        <span class="stock-toggle-name">${row.short_name}</span>
        <span class="stock-toggle-meta">${row.display_name}${coverage ? ` · ${coverage}` : ""}</span>
      </span>
    `;

    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        state.selectedSeries.add(row.series_id);
        state.openGroups.add("stock");
      } else {
        state.selectedSeries.delete(row.series_id);
      }
      state.hoverIndex = null;
      renderSeriesList();
      renderSelectedChips();
      render();
    });

    host.appendChild(label);
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

function setupDateRangeSlider() {
  const startSlider = document.getElementById("rangeStart");
  const endSlider = document.getElementById("rangeEnd");
  if (!startSlider || !endSlider) return;

  startSlider.addEventListener("input", (event) => {
    const rawStart = Number(event.target.value);
    const end = state.allDates.indexOf(state.endDate);
    const start = Math.min(rawStart, end);
    applyDateRangeByIndex(start, end);
  });

  endSlider.addEventListener("input", (event) => {
    const rawEnd = Number(event.target.value);
    const start = state.allDates.indexOf(state.startDate);
    const end = Math.max(rawEnd, start);
    applyDateRangeByIndex(start, end);
  });
}

function applyDateRangeByIndex(startIndex, endIndex) {
  if (!state.allDates.length) return;
  const max = state.allDates.length - 1;
  const safeStart = Math.max(0, Math.min(startIndex, max));
  const safeEnd = Math.max(safeStart, Math.min(endIndex, max));
  state.startDate = state.allDates[safeStart];
  state.endDate = state.allDates[safeEnd];
  populateDateSelects();
  syncTimeframeButtons(null);
  render();
}

function syncDateRangeSlider() {
  const startSlider = document.getElementById("rangeStart");
  const endSlider = document.getElementById("rangeEnd");
  const fill = document.getElementById("dateRangeFill");
  const startLabel = document.getElementById("rangeStartLabel");
  const endLabel = document.getElementById("rangeEndLabel");
  const windowLabel = document.getElementById("rangeWindowLabel");

  if (!startSlider || !endSlider || !fill || !startLabel || !endLabel || !windowLabel || !state.allDates.length) return;

  const max = state.allDates.length - 1;
  startSlider.min = "0";
  endSlider.min = "0";
  startSlider.max = String(max);
  endSlider.max = String(max);

  const startIndex = Math.max(0, state.allDates.indexOf(state.startDate));
  const endIndex = Math.max(startIndex, state.allDates.indexOf(state.endDate));
  startSlider.value = String(startIndex);
  endSlider.value = String(endIndex);

  const leftPct = max > 0 ? (startIndex / max) * 100 : 0;
  const rightPct = max > 0 ? (endIndex / max) * 100 : 100;
  fill.style.left = `${leftPct}%`;
  fill.style.width = `${Math.max(0, rightPct - leftPct)}%`;

  const startMonth = state.allDates[startIndex];
  const endMonth = state.allDates[endIndex];
  const months = endIndex - startIndex + 1;
  startLabel.textContent = formatMonth(startMonth);
  endLabel.textContent = formatMonth(endMonth);
  windowLabel.textContent = `${formatMonth(startMonth)} to ${formatMonth(endMonth)} (${months} mo)`;
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

function transformSeries(alignedRows, benchmarkRows, referenceMaps) {
  if (!alignedRows.length) return [];
  if (state.mode === "price") {
    return alignedRows.map((row) => ({ date: row.date, value: convertPriceValue(row.value, row.date, referenceMaps) }));
  }
  if (state.mode === "growth") {
    const converted = alignedRows.map((row) => ({
      date: row.date,
      value: convertPriceValue(row.value, row.date, referenceMaps),
    }));
    if (converted.some((row) => !Number.isFinite(row.value))) return [];
    const first = converted[0]?.value;
    if (!Number.isFinite(first) || first === 0) return [];
    return converted.map((row) => ({ date: row.date, value: (row.value / first) * 100 }));
  }
  const benchMap = new Map(benchmarkRows.map((row) => [row.date, row.value]));
  const firstBench = benchMap.get(alignedRows[0].date);
  if (!Number.isFinite(firstBench) || firstBench === 0) return [];
  const firstRatio = alignedRows[0].value / firstBench;
  return alignedRows.map((row) => {
    const bench = benchMap.get(row.date);
    if (!Number.isFinite(bench) || bench === 0 || !Number.isFinite(firstRatio) || firstRatio === 0) {
      return { date: row.date, value: NaN };
    }
    return {
      date: row.date,
      value: ((row.value / bench) / firstRatio) * 100,
    };
  });
}

function buildDisplaySeries() {
  const selected = [...state.selectedSeries].filter((id) => {
    if (!state.seriesMap.has(id)) return false;
    return state.metadataMap.get(id)?.category === "stock";
  });
  if (!selected.length) return { series: [], dates: [], reason: "no-selection", units: [] };

  const priceReferenceIds = getPriceReferenceSeriesIds();
  const relativeIds = state.mode === "relative"
    ? (state.benchmark === "IDR" ? [...selected] : [...selected, state.benchmark])
    : [];
  const comparisonIds = state.mode === "relative" ? relativeIds : [...selected, ...priceReferenceIds];
  const commonDates = getCommonDates(comparisonIds);
  if (!commonDates.length) return { series: [], dates: [], reason: "no-common-dates", units: [] };

  const benchmarkRows = state.mode === "relative"
    ? (state.benchmark === "IDR"
      ? commonDates.map((date) => ({ date, value: 1 }))
      : alignSeriesToDates(state.benchmark, commonDates))
    : [];
  const referenceMaps = new Map(
    priceReferenceIds.map((id) => [
      id,
      new Map(alignSeriesToDates(id, commonDates).map((row) => [row.date, row.value])),
    ])
  );
  const series = selected.map((seriesId) => {
    const aligned = alignSeriesToDates(seriesId, commonDates);
    const values = transformSeries(aligned, benchmarkRows, referenceMaps);
    const meta = state.metadataMap.get(seriesId);
    return {
      id: seriesId,
      meta,
      rawUnit: state.mode === "price" ? getPriceDisplayUnit() : (meta?.currency_or_unit || aligned[0]?.unit || ""),
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

function updateControlVisibility() {
  const benchmarkBlock = document.getElementById("benchmarkBlock");
  const benchmarkSelect = document.getElementById("benchmarkSelect");
  const benchmarkLabel = document.getElementById("benchmarkLabel");
  const isRelative = state.mode === "relative";

  renderBenchmarkOptions();

  if (benchmarkBlock) {
    benchmarkBlock.classList.toggle("is-muted", false);
    benchmarkBlock.style.display = "";
  }
  if (benchmarkSelect) {
    benchmarkSelect.disabled = false;
    benchmarkSelect.value = state.benchmark;
  }
  if (benchmarkLabel) {
    benchmarkLabel.textContent = isRelative ? "Compare against" : "Measure in";
  }

  document.querySelectorAll("#modeButtons .mode-button").forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function render() {
  updateCopy();
  updateControlVisibility();
  renderStockToggleDropdown();
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
  syncDateRangeSlider();
  document.getElementById("coverageText").textContent = `${state.startDate?.slice(0, 7) || "-"} to ${state.endDate?.slice(0, 7) || "-"}`;
}

function updateCopy() {
  const yAxisLabel = document.getElementById("yAxisLabel");
  const chartTitle = document.getElementById("chartTitle");
  const chartSubtitle = document.getElementById("chartSubtitle");
  const yAxisExplain = document.getElementById("yAxisExplain");
  const modeHelp = document.getElementById("modeHelp");
  const footnote = document.getElementById("chartFootnote");

  if (state.mode === "growth") {
    const benchmarkLabel = getBenchmarkLabel();
    yAxisLabel.textContent = "Index (Start = 100)";
    chartTitle.textContent = "Growth since start";
    chartSubtitle.textContent = `Each selected series is first measured in ${benchmarkLabel}, then rebased to 100 at the first visible month.`;
    yAxisExplain.textContent = `Y-axis = growth index in ${benchmarkLabel} terms. The first visible month is 100 for every selected stock.`;
    if (modeHelp) modeHelp.textContent = "Best default for quick comparison. Use Measure in to switch growth basis across currencies, commodities, or stock terms.";
    footnote.textContent = `Growth mode rebases each series to 100 after converting to ${benchmarkLabel}.`;
  } else if (state.mode === "price") {
    const benchmarkLabel = getBenchmarkLabel();
    const displayUnit = getPriceDisplayUnit();
    yAxisLabel.textContent = `Price (${displayUnit})`;
    chartTitle.textContent = "Price";
    if (isStockBenchmark()) {
      const benchmarkShort = state.metadataMap.get(state.benchmark)?.short_name || state.benchmark;
      chartSubtitle.textContent = `Monthly stock prices as a ratio to ${benchmarkShort} stock price.`;
      yAxisExplain.textContent = `Y-axis = how many shares of ${benchmarkShort} each selected stock equals.`;
      if (modeHelp) modeHelp.textContent = "Use Measure in to compare in macro units (USD, oil, gold) or as stock-vs-stock ratios.";
      footnote.textContent = `Price mode uses raw ratio: selected stock price divided by ${benchmarkShort} stock price for each month.`;
      return;
    }
    if (state.benchmark === "IDR") {
      chartSubtitle.textContent = "Raw monthly stock prices in Rupiah (IDR).";
      yAxisExplain.textContent = "Y-axis = stock price in Rupiah (IDR).";
      if (modeHelp) modeHelp.textContent = "Use Measure in to switch from IDR to currencies, commodities, or stock-vs-stock ratios.";
      footnote.textContent = "Price mode shows native monthly stock prices in IDR when Rupiah is selected.";
      return;
    }
    chartSubtitle.textContent = `Monthly stock prices converted to ${benchmarkLabel}.`;
    yAxisExplain.textContent = `Y-axis = stock value in ${benchmarkLabel}.`;
    if (modeHelp) modeHelp.textContent = "Use Measure in to view stock values in different currencies, commodities, or stock terms.";
    footnote.textContent = `Price mode converts each monthly stock price using the selected reference (${benchmarkLabel}).`;
  } else {
    const benchmarkName = getBenchmarkLabel();
    yAxisLabel.textContent = "Relative performance";
    chartTitle.textContent = `Performance vs ${benchmarkName}`;
    chartSubtitle.textContent = "Lines above 100 outperformed the benchmark from the chosen start month. Lines below 100 lagged it.";
    yAxisExplain.textContent = `Y-axis = performance index versus ${benchmarkName}. The first visible month is rebased to 100.`;
    if (modeHelp) modeHelp.textContent = "Each selected series is divided by the chosen benchmark and then rebased to 100.";
    footnote.textContent = `Relative mode compares each selected monthly series against ${benchmarkName}.`;
  }
}

function updateSnapshot(display) {
  const selectedCount = document.getElementById("selectedCount");
  const activeBenchmark = document.getElementById("activeBenchmark");
  const windowMonths = document.getElementById("windowMonths");
  const chartReadingHint = document.getElementById("chartReadingHint");
  const benchmarkName = getBenchmarkLabel();
  const months = display.dates.length;

  selectedCount.textContent = `${display.series.length} ${display.series.length === 1 ? "line" : "lines"}`;
  activeBenchmark.textContent = (state.mode === "relative" || state.mode === "price" || state.mode === "growth") ? benchmarkName : "Off in this mode";
  windowMonths.textContent = months ? `${months} ${months === 1 ? "month" : "months"}` : "No shared window";

  if (!display.series.length) {
    chartReadingHint.textContent = "Adjust the selection or date window";
  } else if (state.mode === "price") {
    chartReadingHint.textContent = `Priced in ${benchmarkName}`;
  } else if (state.mode === "growth") {
    chartReadingHint.textContent = `Growth rebased in ${benchmarkName} terms`;
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
      body: "Pick at least one stock series from the explorer to start the comparison.",
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
  document.getElementById("modeSelect").value = state.mode;
  document.getElementById("benchmarkSelect").value = state.benchmark;
  applyTimeframe("3Y");
}

init();

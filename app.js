const COLORS = ["#5be3b1", "#82b7ff", "#efc66c", "#bb9df2", "#edac91", "#d9ff57", "#76d6dc", "#dfa5cf", "#abc6a0", "#c6cfe0"];
const SERIES_COLORS = { IHSG: COLORS[0], BBCA: COLORS[1], GOLD: COLORS[2], USDIDR: COLORS[3], BBRI: COLORS[4], BMRI: COLORS[6], BBNI: COLORS[5], LQ45: COLORS[7], COAL: COLORS[2], ADRO: COLORS[0], PTBA: COLORS[1], ITMG: COLORS[3], NICKEL: COLORS[0], ANTM: COLORS[1], INCO: COLORS[6], MDKA: COLORS[3], SP500: COLORS[1], NASDAQ100: COLORS[5], ASX200: COLORS[2], NIKKEI: COLORS[3], HANGSENG: COLORS[7], NIFTY50: COLORS[5], STI: COLORS[4], KLCI: COLORS[1], AAPL: COLORS[3], MSFT: COLORS[6], NVDA: COLORS[2], TSM: COLORS[1], GOTO: COLORS[3], BTC: COLORS[4], ETH: COLORS[6], DBS: COLORS[2], CBA: COLORS[3], BHP: COLORS[3], ASII: COLORS[0], TOYOTA: COLORS[1], TSLA: COLORS[3] };
const comparisonColors = new Map();
function seriesColor(id) {
  if (comparisonColors.has(id)) return comparisonColors.get(id);
  if (SERIES_COLORS[id]) return SERIES_COLORS[id];
  const hash = [...id].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 0);
  return COLORS[Math.abs(hash) % COLORS.length];
}
function assignComparisonColors(ids) {
  // Retain the colors of remaining lines; only new selections need a free color.
  for (const id of comparisonColors.keys()) if (!ids.includes(id)) comparisonColors.delete(id);
  const used = new Set(comparisonColors.values());
  for (const id of ids) {
    if (comparisonColors.has(id)) continue;
    const preferred = seriesColor(id);
    const color = !used.has(preferred) ? preferred : COLORS.find(candidate => !used.has(candidate)) || `hsl(${Math.round(used.size * 137.508) % 360} 65% 72%)`;
    comparisonColors.set(id, color);
    used.add(color);
  }
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
const DEFAULT_SERIES = ["IHSG", "BBCA", "GOLD", "USDIDR"];
const PRICE_GROWTH_BENCHMARK_IDS = ["IDR", "USDIDR", "EURIDR", "JPYIDR", "AUDIDR", "SGDIDR", "MYRIDR", "HKDIDR", "INRIDR", "GOLD", "OIL_WTI", "COAL", "NICKEL", "PALM_OIL", "RICE"];
const RELATIVE_BENCHMARK_IDS = ["IDR", "USDIDR", "EURIDR", "JPYIDR", "AUDIDR", "SGDIDR", "MYRIDR", "HKDIDR", "INRIDR", "GOLD", "OIL_WTI"];
const CHART_DIMS = { width: 1100, height: 520, pad: { top: 28, right: 28, bottom: 56, left: 78 } };
let chartScale = null;
const TROY_OUNCE_IN_GRAMS = 31.1034768;
const BARREL_IN_LITERS = 158.987294928;
const METRIC_TON_IN_KILOGRAMS = 1000;

const state = {
  rawSeries: [],
  metadata: [],
  seriesMap: new Map(),
  metadataMap: new Map(),
  selectedSeries: new Set(DEFAULT_SERIES),
  inflation: false,
  mode: "growth",
  benchmark: "IDR",
  startDate: null,
  endDate: null,
  allDates: [],
  hoverIndex: null,
  chartPinned: false,
  pinnedSeries: null,
  assetCategory: "all",
  assetCountry: "all",
  collection: "indonesia",
  activePreset: "default",
  resultMode: "percent",
  highlightedSeries: null,
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

const WORLD_MARKETS = ["IHSG", "SP500", "NASDAQ100", "ASX200", "STI", "KLCI", "NIKKEI", "HANGSENG", "NIFTY50"];
const COLLECTIONS = {
  indonesia: [["default", "Overview"], ["gold", "Stocks vs gold"], ["banks", "Banks"], ["commodities", "Coal"], ["nickel", "Nickel"], ["market", "Market indexes"]],
  world: [["global", "Indonesia vs world"], ["neighbours", "Our neighbours"], ["asia", "Across Asia"], ["us", "US companies"]],
  themes: [["digital", "Gold vs crypto"], ["globalbanks", "Banks across borders"], ["tech", "Technology"], ["resources", "Resources"], ["automotive", "Automotive"]],
};
const PRESET_DESCRIPTIONS = {
  default: "Stocks, gold and the dollar, side by side.",
  gold: "How did Indonesian stocks compare with gold?",
  banks: "Compare Indonesia’s four major banks.",
  commodities: "Coal prices alongside Indonesian coal companies.",
  nickel: "Nickel prices alongside Indonesian mining companies.",
  market: "Indonesia’s broad market, leading stocks and Astra.",
  global: "How did Indonesia compare with the US, Australia and Japan?",
  neighbours: "Indonesia, Singapore and Malaysia on one chart.",
  asia: "Compare Indonesia, Japan, Hong Kong and India.",
  us: "US market indexes alongside Apple and Microsoft.",
  digital: "Gold, Bitcoin and Ethereum. How different were their paths?",
  globalbanks: "Compare BBCA, DBS and Commonwealth Bank.",
  tech: "Nvidia, Microsoft, TSMC and GoTo, side by side.",
  resources: "Mining companies, nickel and gold on one chart.",
  automotive: "Compare Astra, Toyota and Tesla.",
};
const CURRENCY_IDS = ["IDR", "USDIDR", "EURIDR", "AUDIDR", "SGDIDR", "MYRIDR", "JPYIDR", "HKDIDR", "INRIDR"];
for (const [currency, label] of Object.entries({ AUD: "Australian Dollar", SGD: "Singapore Dollar", MYR: "Malaysian Ringgit", HKD: "Hong Kong Dollar", INR: "Indian Rupee" })) {
  const id = currency + "IDR";
  BENCHMARK_DEFS[id] = { label: `${label} (${currency})`, displayUnit: currency, refs: [id],
    convert: (value, date, refs) => value / refs.get(id)?.get(date) };
}

function currencyRefs(meta) {
  if (!meta || meta.category === "fx") return [];
  const currency = meta.currency || (meta.category === "commodity" ? "USD" : "IDR");
  return currency === "IDR" ? [] : [currency + "IDR"];
}

function renderCollections() {
  document.querySelectorAll("[data-collection]").forEach((button) => {
    const active = button.dataset.collection === state.collection;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.getElementById("presetButtons").innerHTML = COLLECTIONS[state.collection].map(([id, label]) =>
    `<button type="button" data-preset="${id}" title="${escapeHTML(t(PRESET_DESCRIPTIONS[id]))}" aria-pressed="${state.activePreset === id}" class="${state.activePreset === id ? "active" : ""}">${t(label)}</button>`).join("");
  document.getElementById("worldOverview").hidden = state.collection !== "world";
}

function renderWorldOverview() {
  if (state.collection !== "world") return;
  document.getElementById("worldContext").textContent = t("{0} — {1} · Measured in {2}", formatMonth(state.startDate), formatMonth(state.endDate), getBenchmarkLabel());
  const host = document.getElementById("worldMarkets");
  host.innerHTML = "";
  for (const id of WORLD_MARKETS) {
    const display = buildDisplaySeries({ ids: [id], mode: "growth" });
    const meta = state.metadataMap.get(id);
    if (!meta) continue;
    const series = display.series[0];
    const pct = series ? series.values.at(-1).value - 100 : null;
    const selected = state.selectedSeries.has(id);
    const values = series?.values.map((point) => point.value) || [];
    const min = Math.min(...values), span = Math.max(...values) - min || 1;
    const points = values.map((value, index) => `${index / Math.max(values.length - 1, 1) * 70},${24 - (value - min) / span * 22}`).join(" ");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `world-market ${selected ? "selected" : ""}`;
    button.dataset.market = id;
    button.setAttribute("aria-pressed", selected);
    button.setAttribute("aria-label", `${selected ? t("Remove") : t("Add")} ${t(meta.short_name)}`);
    button.title = series ? `${formatMonth(display.dates[0])} — ${formatMonth(display.dates.at(-1))}` : t("No history in this period");
    button.innerHTML = `<span class="world-country">${escapeHTML(t(meta.country))}</span><strong>${escapeHTML(meta.short_name)}</strong><svg class="world-sparkline" viewBox="0 0 72 26" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${seriesColor(id)}" stroke-width="1.5" /></svg><span class="world-move ${valueTone(pct)}">${pct == null ? "—" : `${pct >= 0 ? "+" : ""}${decimal(pct, 1)}%`}</span><span class="world-action" aria-hidden="true">${selected ? "✓" : "+"}</span>`;
    button.addEventListener("click", () => {
      if (state.selectedSeries.has(id)) state.selectedSeries.delete(id);
      else state.selectedSeries.add(id);
      if (state.mode === "price") state.mode = "growth";
      state.activePreset = null;
      state.hoverIndex = null;
      render();
    });
    host.appendChild(button);
  }
}

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
  document.getElementById("adjustInflation").addEventListener("change", (event) => {
    state.inflation = event.target.checked;
    state.hoverIndex = null;
    render();
  });
  document.getElementById("shareComparison").addEventListener("click", shareComparison);
  renderBenchmarkOptions();
  renderStockToggleDropdown();
  populateDateSelects();
  setupModeButtons();
  renderCollections();
  const countries = [...new Set(state.metadata.map((row) => row.country))].filter(Boolean).sort();
  const countrySelect = document.getElementById("assetCountry");
  countries.forEach((country) => countrySelect.add(new Option(t(country), country)));
  countrySelect.addEventListener("change", () => { state.assetCountry = countrySelect.value; renderStockToggleDropdown(); });
  document.querySelectorAll("[data-collection]").forEach((button) => {
    button.addEventListener("click", () => { state.collection = button.dataset.collection; renderCollections(); render(); });
  });
  document.getElementById("clearComparison").addEventListener("click", () => applyPreset("clear"));
  document.getElementById("benchmarkSelect").addEventListener("change", (event) => {
    state.benchmark = event.target.value;
    state.hoverIndex = null;
    render();
  });
  document.getElementById("currencySelect").addEventListener("change", (event) => {
    state.benchmark = event.target.value;
    render();
  });
  document.getElementById("stockToggleSearch").addEventListener("input", renderStockToggleDropdown);
  for (const field of ["startDate", "endDate"]) {
    document.getElementById(field).addEventListener("change", (event) => {
      state[field] = event.target.value;
      state.hoverIndex = null;
      clampDateRange();
      syncTimeframeButtons(null);
      render();
    });
  }
  document.getElementById("resetSelections").addEventListener("click", () => {
    state.inflation = false;
    state.resultMode = "percent";
    state.mode = "growth";
    state.benchmark = "IDR";
    state.assetCategory = "all";
    state.assetCountry = "all";
    state.collection = "indonesia";
    document.getElementById("assetCountry").value = "all";
    renderCollections();
    document.getElementById("stockToggleSearch").value = "";
    document.querySelectorAll(".toolbar details").forEach((el) => { el.open = false; });
    document.getElementById("moreOptions").open = false;
    applyPreset("default");
    applyTimeframe("3Y");
  });
  document.querySelectorAll("#timeframeButtons button").forEach((button) => {
    button.addEventListener("click", () => applyTimeframe(button.dataset.range));
  });
  document.getElementById("presetButtons").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) applyPreset(button.dataset.preset);
  });
  document.querySelectorAll("#assetFilters button").forEach((button) => {
    button.addEventListener("click", () => {
      state.assetCategory = button.dataset.category;
      renderStockToggleDropdown();
    });
  });
  document.querySelectorAll("#resultMode button").forEach((button) => {
    button.addEventListener("click", () => {
      state.resultMode = button.dataset.result;
      renderSummary(state.lastDisplay.series);
      updateCopy();
    });
  });
  for (const [button, panel] of [["closeAssetPicker", "stockToggleDropdown"], ["closeDatePicker", "customDates"]]) {
    document.getElementById(button).addEventListener("click", () => {
      document.getElementById(panel).open = false;
      document.querySelector(`#${panel} summary`).focus();
    });
  }
  document.querySelectorAll(".toolbar details").forEach((panel) => {
    panel.addEventListener("toggle", () => {
      if (panel.open) {
        document.getElementById("moreOptions").open = false;
        document.querySelectorAll(".toolbar details").forEach((other) => { if (other !== panel) other.open = false; });
        if (panel.id === "stockToggleDropdown") document.getElementById("stockToggleSearch").focus();
      }
    });
  });
  document.getElementById("moreOptions").addEventListener("toggle", (event) => {
    if (event.target.open) document.querySelectorAll(".toolbar details").forEach(panel => { panel.open = false; });
  });
  document.addEventListener("click", (event) => {
    document.querySelectorAll(".toolbar details[open]").forEach((panel) => {
      if (!panel.contains(event.target)) panel.open = false;
    });
    const options = document.getElementById("moreOptions");
    if (!options.contains(event.target)) options.open = false;
    if (state.chartPinned && !document.getElementById("chartStage").contains(event.target)) clearChartPoint();
  });
  document.getElementById("dismissChartDetails").addEventListener("click", dismissChartDetails);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dismissChartDetails();
    if (event.key === "Escape" && document.getElementById("moreOptions").open) {
      document.getElementById("moreOptions").open = false;
      document.querySelector("#moreOptions summary").focus();
    }
    if (event.key === "Escape") document.querySelectorAll(".toolbar details[open]").forEach((panel) => {
      panel.open = false;
      panel.querySelector("summary").focus();
    });
  });
}

function setupModeButtons() {
  document.querySelectorAll("#modeButtons .mode-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      state.hoverIndex = null;
      render();
    });
  });
}

function applyPreset(preset) {
  const presetMap = {
    default: DEFAULT_SERIES,
    banks: ["BBCA", "BBRI", "BMRI", "BBNI"],
    gold: ["IHSG", "BBCA", "GOLD"],
    nickel: ["NICKEL", "ANTM", "INCO", "MDKA"],
    market: ["IHSG", "LQ45", "ASII"],
    commodities: ["COAL", "ADRO", "PTBA", "ITMG"],
    global: ["IHSG", "SP500", "ASX200", "NIKKEI"],
    neighbours: ["IHSG", "STI", "KLCI"],
    asia: ["IHSG", "NIKKEI", "HANGSENG", "NIFTY50"],
    us: ["SP500", "NASDAQ100", "AAPL", "MSFT"],
    globalbanks: ["BBCA", "DBS", "CBA"],
    tech: ["NVDA", "MSFT", "TSM", "GOTO"],
    digital: ["GOLD", "BTC", "ETH"],
    resources: ["BHP", "ANTM", "NICKEL", "GOLD"],
    automotive: ["ASII", "TOYOTA", "TSLA"],
    clear: [],
  };
  state.selectedSeries = new Set((presetMap[preset] || []).filter((id) => state.metadataMap.has(id)));
  state.hoverIndex = null;
  state.activePreset = preset === "clear" ? null : preset;
  state.highlightedSeries = null;
  render();
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
  if (benchmarkDef) return t(benchmarkDef.label);
  const stockMeta = state.metadataMap.get(id);
  if (stockMeta) return stockMeta.short_name;
  return stockMeta?.short_name || id;
}

function isStockBenchmark(id = state.benchmark) {
  return ["stock", "index"].includes(state.metadataMap.get(id)?.category);
}

function getPriceReferenceSeriesIds(benchmark = state.benchmark) {
  if (isStockBenchmark(benchmark)) return [benchmark, ...currencyRefs(state.metadataMap.get(benchmark))];
  return getBenchmarkDef(benchmark)?.refs || ["USDIDR"];
}

function getPriceDisplayUnit(benchmark = state.benchmark) {
  if (isStockBenchmark(benchmark)) {
    const shortName = state.metadataMap.get(benchmark)?.short_name || benchmark;
    return t("shares {0}", shortName);
  }
  return t(getBenchmarkDef(benchmark)?.displayUnit || "USD");
}

function convertPriceValue(idrValue, date, referenceMaps, benchmark = state.benchmark) {
  if (isStockBenchmark(benchmark)) {
    const benchmarkIdrValue = valueInIDR(referenceMaps.get(benchmark)?.get(date), state.metadataMap.get(benchmark), date, referenceMaps);
    if (!Number.isFinite(benchmarkIdrValue) || benchmarkIdrValue <= 0) return NaN;
    return idrValue / benchmarkIdrValue;
  }
  const benchmarkDef = getBenchmarkDef(benchmark);
  if (!benchmarkDef) return NaN;
  return benchmarkDef.convert(idrValue, date, referenceMaps);
}

function renderBenchmarkOptions() {
  const select = document.getElementById("benchmarkSelect");
  select.innerHTML = "";

  const macroGroup = document.createElement("optgroup");
  macroGroup.label = t("Macro references");
  const macroIds = state.mode === "relative" ? RELATIVE_BENCHMARK_IDS : PRICE_GROWTH_BENCHMARK_IDS;
  macroIds.forEach((id) => {
    const shouldSkip = id !== "IDR" && !state.metadataMap.get(id);
    if (shouldSkip) return;
    macroGroup.appendChild(new Option(getBenchmarkLabel(id), id, false, id === state.benchmark));
  });
  select.appendChild(macroGroup);

  const stockGroup = document.createElement("optgroup");
  stockGroup.label = t("Stocks & market indexes");
  const stockRows = [...state.metadata]
    .filter((row) => ["stock", "index"].includes(row.category))
    .sort((a, b) => a.short_name.localeCompare(b.short_name));
  stockRows.forEach((row) => {
    const label = `${row.short_name} · ${row.display_name}`;
    stockGroup.appendChild(new Option(label, row.series_id, false, row.series_id === state.benchmark));
  });
  select.appendChild(stockGroup);

  if (![...select.options].some((option) => option.value === state.benchmark)) {
    state.benchmark = "IDR";
  }
}

function renderStockToggleDropdown() {
  const host = document.getElementById("stockToggleList");
  document.getElementById("stockToggleSummary").innerHTML = `<span aria-hidden="true">＋</span> ${t("Add assets")} <span class="asset-count">${state.selectedSeries.size}</span>`;
  const search = document.getElementById("stockToggleSearch").value.trim().toLowerCase();
  document.querySelectorAll("#assetFilters button").forEach((button) => {
    const active = state.assetCategory === button.dataset.category;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  const rows = state.metadata.filter((row) => (state.assetCategory === "all" || row.category === state.assetCategory) &&
    (state.assetCountry === "all" || row.country === state.assetCountry) &&
    `${t(row.short_name)} ${t(row.display_name)} ${t(row.country)} ${row.series_id} ${row.display_name} ${row.short_name} ${row.sector} ${row.category} ${row.country} ${row.exchange} ${row.currency}`.toLowerCase().includes(search)
  ).sort((a, b) => Number(state.selectedSeries.has(b.series_id)) - Number(state.selectedSeries.has(a.series_id)) || a.short_name.localeCompare(b.short_name));
  host.innerHTML = "";
  for (const row of rows) {
    const label = document.createElement("label");
    label.className = "stock-toggle-item";
    label.innerHTML = `<input type="checkbox" value="${escapeHTML(row.series_id)}" ${state.selectedSeries.has(row.series_id) ? "checked" : ""} />
      <span class="picker-swatch" style="background:${seriesColor(row.series_id)}"></span>
      <span class="stock-toggle-copy"><strong>${escapeHTML(t(row.short_name))}</strong><span>${escapeHTML(t(row.display_name))} · ${escapeHTML(row.exchange)} · ${escapeHTML(row.currency)}</span></span><span class="asset-category">${escapeHTML(t(row.category === "fx" ? "FX" : row.category))}</span>`;
    label.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) state.selectedSeries.add(row.series_id);
      else state.selectedSeries.delete(row.series_id);
      state.activePreset = null;
      state.hoverIndex = null;
      state.highlightedSeries = null;
      render();
      // Keep keyboard users on the item they just changed after reordering.
      host.querySelector(`input[value="${CSS.escape(row.series_id)}"]`)?.focus({ preventScroll: true });
    });
    host.appendChild(label);
  }
  if (!rows.length) host.innerHTML = `<p class="picker-empty">${t("No matches. Try another name or category.")}</p>`;
  document.getElementById("selectionAdvice").textContent = state.selectedSeries.size > 5 ? t("Try fewer assets for an easier comparison.") : t("Compare 2–5 assets for a clearer view.");
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
    const [endYear, endMonth] = state.endDate.split("-").map(Number);
    const target = new Date(Date.UTC(endYear - years, endMonth - 1, 1));
    const targetStr = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-01`;
    state.startDate = state.allDates.find((date) => date >= targetStr) || state.allDates[0];
  }
  state.hoverIndex = null;
  populateDateSelects();
  syncTimeframeButtons(range);
  render();
}

function syncTimeframeButtons(active) {
  document.querySelectorAll("#timeframeButtons button").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === active);
    button.setAttribute("aria-pressed", String(button.dataset.range === active));
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
  return new Intl.DateTimeFormat(locale(), {month: "short", year: "numeric", timeZone: "UTC"}).format(new Date(date + "T00:00:00Z"));
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

// All comparisons share an IDR basis before changing the measuring reference.
// Index levels are normalized proxies, not purchasable shares.
function valueInIDR(value, meta, date, referenceMaps) {
  const refs = currencyRefs(meta);
  return refs.length ? value * referenceMaps.get(refs[0])?.get(date) : value;
}

function inflationActive(mode = state.mode, benchmark = state.benchmark) {
  return state.inflation && mode === "growth" && benchmark === "IDR";
}

function maxDrawdown(values) {
  let peak = values[0], worst = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) worst = Math.min(worst, (value / peak - 1) * 100);
  }
  return worst;
}

function transformSeries(alignedRows, meta, referenceMaps, mode = state.mode, benchmark = state.benchmark) {
  const converted = alignedRows.map((row) => ({
    date: row.date,
    value: convertPriceValue(valueInIDR(row.value, meta, row.date, referenceMaps), row.date, referenceMaps, benchmark),
  }));
  if (converted.some((row) => !Number.isFinite(row.value))) return [];
  if (mode === "price") return converted;
  const first = converted[0]?.value;
  if (!Number.isFinite(first) || first <= 0) return [];
  return converted.map((row) => ({ date: row.date, value: row.value / first * 100 * (inflationActive(mode, benchmark) ? referenceMaps.get("CPI_ID").get(converted[0].date) / referenceMaps.get("CPI_ID").get(row.date) : 1) }));
}

function buildDisplaySeries({ ids = [...state.selectedSeries], mode = state.mode, benchmark = state.benchmark } = {}) {
  const selected = ids.filter((id) => state.seriesMap.has(id));
  if (!selected.length) return { series: [], dates: [], reason: "no-selection", units: [] };
  // Raw prices with unlike underlying units are not a useful shared axis.
  const metas = selected.map((id) => state.metadataMap.get(id));
  if (mode === "price" && (metas.some((m) => m.category === "index") || new Set(metas.map((m) => m.category === "stock" ? "share" : m.currency_or_unit)).size > 1)) {
    return { series: [], dates: [], reason: "mixed-price", units: [] };
  }
  const referenceIds = [...new Set([
    ...getPriceReferenceSeriesIds(benchmark),
    ...metas.flatMap(currencyRefs),
    ...(inflationActive(mode, benchmark) ? ["CPI_ID"] : []),
  ])];
  const commonDates = getCommonDates([...selected, ...referenceIds]);
  if (!commonDates.length) return { series: [], dates: [], reason: "no-common-dates", units: [] };
  const referenceMaps = new Map(referenceIds.map((id) => [id,
    new Map(alignSeriesToDates(id, commonDates).map((row) => [row.date, row.value])),
  ]));
  const series = selected.map((id) => {
    const meta = state.metadataMap.get(id);
    return {
      id, meta,
      rawUnit: mode === "price" ? getPriceDisplayUnit(benchmark) : "index",
      values: transformSeries(alignSeriesToDates(id, commonDates), meta, referenceMaps, mode, benchmark),
    };
  }).filter((entry) => entry.values.length);
  return { series, dates: commonDates, units: [...new Set(series.map((s) => s.rawUnit))], reason: series.length ? null : "no-values" };
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
    benchmarkLabel.textContent = isRelative ? t("Compare against") : t("Measure in");
  }
  const currencySelect = document.getElementById("currencySelect");
  currencySelect.replaceChildren(...CURRENCY_IDS.filter(id => id === "IDR" || state.metadataMap.has(id))
    .map(id => new Option(getBenchmarkLabel(id), id)));
  const customReference = !CURRENCY_IDS.includes(state.benchmark);
  if (customReference) {
    const option = new Option(getBenchmarkLabel(), state.benchmark);
    option.disabled = true;
    currencySelect.add(option);
  }
  currencySelect.value = state.benchmark;
  document.getElementById("currencyLabel").textContent = customReference || isRelative ? t("Reference") : t("Currency");

  document.querySelectorAll("#modeButtons .mode-button").forEach((button) => {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function render() {
  state.hoverIndex = null;
  state.chartPinned = false;
  state.pinnedSeries = null;
  state.highlightedSeries = null;
  assignComparisonColors([...state.selectedSeries]);
  updateControlVisibility();
  updateCopy();
  renderStockToggleDropdown();
  const display = buildDisplaySeries();
  state.lastDisplay = display;
  if (state.hoverIndex != null && state.hoverIndex >= display.dates.length) state.hoverIndex = null;
  renderLegend(display.series);
  renderChart(display);
  renderSummary(display.series);
  renderDiagnostics(display);
  updateSnapshot(display);
  renderWorldOverview();
  const visiblePreset = COLLECTIONS[state.collection].some(([id]) => id === state.activePreset);
  document.getElementById("presetDescription").textContent = t(visiblePreset ? PRESET_DESCRIPTIONS[state.activePreset] : "Pick a comparison, or build your own.");
  document.querySelectorAll("#presetButtons button").forEach((button) => {
    const active = button.dataset.preset === state.activePreset;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
}

function updateCopy() {
  const inflationAvailable = state.mode === "growth" && state.benchmark === "IDR";
  document.getElementById("adjustInflation").disabled = !inflationAvailable;
  document.getElementById("adjustInflation").checked = inflationActive();
  document.getElementById("inflationNote").textContent = !inflationAvailable ? t("Available in Growth measured in Rupiah") : inflationActive() ? t("After inflation · CPI through {0}", formatMonth(state.seriesMap.get("CPI_ID").at(-1).date)) : "";
  const label = getBenchmarkLabel();
  const price = state.mode === "price";
  const relative = state.mode === "relative";
  document.getElementById("chartTitle").textContent = price ? t("Price over time.") : relative ? t("Against {0}.", label) : t("A common starting point.");
  document.getElementById("chartSubtitle").textContent = price ? t("Monthly prices in {0}.", label) : relative ? t("Above 100 = ahead of the benchmark.") : t("All assets start at 100. A value of 120 means a 20% increase.");
  if (inflationActive()) document.getElementById("chartSubtitle").textContent = t("Starts at 100, after Indonesian inflation. Values reflect the starting month’s purchasing power.");
  document.getElementById("chartBasis").textContent = `${price ? t("PRICE") : t("BASE 100")} / ${t(getBenchmarkDef()?.displayUnit || "") || state.metadataMap.get(state.benchmark)?.short_name || state.benchmark}`;
  const settings = [relative ? t("Vs benchmark") : price ? t("Price") : t("Growth"), label];
  if (inflationActive()) settings.push(t("After inflation"));
  if (state.resultMode === "drawdown") settings.push(t("Biggest fall"));
  document.getElementById("comparisonSettings").textContent = settings.join(" · ");
  const advanced = Number(state.mode !== "growth") + Number(!CURRENCY_IDS.includes(state.benchmark)) + Number(inflationActive()) + Number(state.resultMode === "drawdown");
  const count = document.getElementById("advancedCount");
  count.hidden = !advanced;
  count.textContent = t("{0} active", advanced);
}

function updateSnapshot(display) {
  const dates = display.dates;
  const range = dates.length ? `${formatMonth(dates[0])} — ${formatMonth(dates.at(-1))}` : t("No shared dates");
  document.getElementById("chartRangeLabel").textContent = range;
  document.getElementById("rangeWindowLabel").textContent = t("{0} to {1}", formatMonth(state.startDate), formatMonth(state.endDate));
  const adjusted = dates.length && (dates[0] !== state.startDate || dates.at(-1) !== state.endDate);
  document.getElementById("sharedWindowNote").textContent = adjusted ? t("Adjusted to the history available for every asset: {0}.", range) : "";
  document.getElementById("selectedCount").textContent = String(display.series.length).padStart(2, "0");
}

function highlightSeries(id) {
  state.highlightedSeries = id;
  document.querySelectorAll("#chart .series-line").forEach((line) => {
    line.style.opacity = !id || line.dataset.series === id ? "1" : ".15";
    line.querySelector("polyline").style.strokeWidth = id === line.dataset.series ? "3" : "2";
  });
  document.querySelectorAll(".legend-item, .comparison-row").forEach((row) => {
    row.classList.toggle("is-highlighted", row.dataset.series === id);
    row.classList.toggle("is-muted", Boolean(id && row.dataset.series !== id));
  });
}

function bindHighlight(element, id) {
  element.addEventListener("mouseenter", () => { if (!state.pinnedSeries) highlightSeries(id); });
  element.addEventListener("mouseleave", () => highlightSeries(state.pinnedSeries));
  element.addEventListener("focusin", () => { if (!state.pinnedSeries) highlightSeries(id); });
  element.addEventListener("focusout", () => highlightSeries(state.pinnedSeries));
  const button = element.matches("button") ? element : element.querySelector(".asset-result");
  button.addEventListener("click", () => {
    state.pinnedSeries = state.pinnedSeries === id ? null : id;
    highlightSeries(state.pinnedSeries);
  });
}

function renderLegend(displaySeries) {
  const legend = document.getElementById("legend");
  legend.innerHTML = "";
  for (const series of displaySeries) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "legend-item";
    item.dataset.series = series.id;
    item.innerHTML = `<span class="legend-swatch" style="background:${seriesColor(series.id)}"></span>${escapeHTML(t(series.meta.short_name))}`;
    bindHighlight(item, series.id);
    legend.appendChild(item);
  }
}

function renderSummary(displaySeries) {
  document.getElementById("shareFeedback").hidden = true;
  const host = document.getElementById("comparisonResults");
  const moneyAvailable = state.mode === "growth" && state.benchmark === "IDR";
  if (!moneyAvailable && state.resultMode === "money") state.resultMode = "percent";
  const money = moneyAvailable && state.resultMode !== "drawdown";
  const drawdown = state.resultMode === "drawdown";
  document.querySelectorAll("#resultMode button").forEach((button) => {
    const active = button.dataset.result === (drawdown ? "drawdown" : "percent");
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.getElementById("resultContext").textContent = money ? t("If Rp1 million followed each asset") : state.mode === "price" && !drawdown ? t("Latest price in {0}", getBenchmarkLabel()) : state.mode === "relative" && !drawdown ? t("Change against {0}", getBenchmarkLabel()) : t("Change in {0} terms", getBenchmarkLabel());
  document.getElementById("comparisonNote").textContent = money ? t("An illustration of price movement, excluding dividends and costs. Indexes and commodities are proxies.") : t("Price movement only. Dividends and costs excluded.");
  if (drawdown) {
    document.getElementById("resultContext").textContent = t("Largest fall from a previous peak");
    document.getElementById("comparisonNote").textContent = t("Within this period, using monthly data. Daily falls may be larger. Closer to 0% means a smaller fall.");
  }
  if (inflationActive()) document.getElementById("resultContext").textContent += " · " + t("After inflation");
  const dates = state.lastDisplay.dates;
  document.getElementById("resultWindow").textContent = dates.length ? `${formatMonth(dates[0])} — ${formatMonth(dates.at(-1))}` : "";
  const takeaway = document.getElementById("comparisonTakeaway");
  takeaway.hidden = !displaySeries.length;
  takeaway.textContent = describeComparison(displaySeries);
  host.innerHTML = "";
  if (!displaySeries.length) {
    host.innerHTML = `<p class="results-empty">${t("Your results will appear here once there is a comparison to show.")}</p>`;
    return;
  }
  for (const series of displaySeries) {
    const values = series.values.map((point) => point.value);
    const ratio = values.at(-1) / values[0];
    const pct = drawdown ? maxDrawdown(values) : (ratio - 1) * 100;
    const percent = `${pct >= 0 ? "+" : ""}${decimal(pct, 1)}%`;
    const formatted = money ? `Rp${Math.round(1000000 * ratio).toLocaleString(locale())}` : state.mode === "price" && !drawdown ? formatRawValue(values.at(-1)) : percent;
    const min = Math.min(...values), span = Math.max(...values) - min || 1;
    const points = values.map((value, index) => `${index / Math.max(values.length - 1, 1) * 70},${22 - (value - min) / span * 20}`).join(" ");
    const row = document.createElement("div");
    row.className = "comparison-row";
    row.dataset.series = series.id;
    row.innerHTML = `<button class="asset-result" type="button" aria-label="${t("Highlight")} ${escapeHTML(t(series.meta.short_name))}: ${formatted}${money || state.mode === "price" && !drawdown ? `, ${percent}` : ""}">
      <span class="result-name"><span class="legend-swatch" style="background:${seriesColor(series.id)}"></span><strong>${escapeHTML(t(series.meta.short_name))}</strong></span>
      <span class="result-metrics">${money ? `<span class="result-start">${t("Rp1m")} <span aria-hidden="true">→</span></span>` : ""}<strong class="result-value ${money || state.mode === "price" && !drawdown ? "" : valueTone(pct)}">${formatted}</strong>${money || state.mode === "price" && !drawdown ? `<span class="result-growth ${valueTone(pct)}">${percent}</span>` : ""}</span>
      <span class="result-company">${escapeHTML(t(series.meta.display_name))}</span>
      <svg class="sparkline" viewBox="0 0 72 24" aria-hidden="true"><polyline points="${points}" fill="none" stroke="${seriesColor(series.id)}" stroke-width="1.4" /></svg>
      </button><button class="remove-asset" type="button" aria-label="${t("Remove")} ${escapeHTML(t(series.meta.short_name))}">×</button>`;
    row.querySelector(".remove-asset").addEventListener("click", () => {
      state.selectedSeries.delete(series.id);
      state.activePreset = null;
      state.highlightedSeries = null;
      state.hoverIndex = null;
      render();
    });
    bindHighlight(row, series.id);
    host.appendChild(row);
  }
}

function describeComparison(series) {
  if (!series.length) return "";
  const drawdown = state.resultMode === "drawdown";
  const results = series.map(entry => ({
    name: t(entry.meta.short_name),
    change: drawdown ? maxDrawdown(entry.values.map(point => point.value)) : (entry.values.at(-1).value / entry.values[0].value - 1) * 100,
  })).sort((a, b) => b.change - a.change);
  const first = results[0];
  const percent = `${first.change > 0 ? "+" : ""}${decimal(first.change, 1)}%`;
  if (drawdown) return t("Smallest fall from a peak: {0} ({1}).", first.name, percent);
  const describe = result => Math.abs(result.change) < 0.05 ? t("{0} was almost unchanged.", result.name) : t(result.change > 0 ? "{0} rose {1}." : "{0} fell {1}.", result.name, `${decimal(Math.abs(result.change), 1)}%`);
  let text = describe(first);
  const last = results.at(-1);
  if (results.length > 1 && first.change - last.change >= 0.05) text += " " + describe(last);
  return text;
}

function renderDiagnostics(display) {
  const tbody = document.getElementById("diagnosticBody");
  const changeUnitLabel = document.getElementById("changeUnitLabel");
  if (!tbody) return;

  hideDiagnosticTooltip();
  const diagnostics = buildDiagnostics(display.series);
  const unitLabel = getDiagnosticUnitLabel(display);
  if (changeUnitLabel) changeUnitLabel.textContent = unitLabel;

  renderMiniChart("changeChart", diagnostics, {
    metricKey: "changes",
    metricLabel: t("Monthly change"),
    formatTick: formatMiniAxis,
    formatValue: (value, item) => formatSignedDiagnostic(value, getDeltaUnit(item), false),
  });
  renderMiniChart("rateChart", diagnostics, {
    metricKey: "rates",
    metricLabel: t("Rate of change"),
    formatTick: (value) => `${formatMiniAxis(value)}%`,
    formatValue: (value) => formatSignedDiagnostic(value, "%", true),
  });

  tbody.innerHTML = "";
  if (!diagnostics.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="muted">${t("Select at least one series with two visible months to see change diagnostics.")}</td>
      </tr>
    `;
    return;
  }

  diagnostics.forEach((item) => {
    const latest = item.latest;
    const deltaUnit = (state.mode === "growth" || state.mode === "relative") ? t("pts") : item.rawUnit;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${t(item.meta.display_name)}</td>
      <td>${formatSummaryValue(latest.value, item.rawUnit)}</td>
      <td class="${valueTone(latest.change)}">${formatSignedDiagnostic(latest.change, deltaUnit, false)}</td>
      <td class="${valueTone(latest.rate)}">${formatSignedDiagnostic(latest.rate, "%", true)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function buildDiagnostics(displaySeries) {
  return displaySeries.map((series) => {
    const changes = [];
    const rates = [];

    for (let index = 1; index < series.values.length; index++) {
      const current = series.values[index];
      const previous = series.values[index - 1];
      const change = current.value - previous.value;
      const rate = previous.value !== 0 ? (change / previous.value) * 100 : NaN;

      changes.push({ date: current.date, value: change });
      rates.push({ date: current.date, value: rate });
    }

    const latestPoint = series.values[series.values.length - 1];
    return {
      id: series.id,
      meta: series.meta,
      rawUnit: series.rawUnit,
      changes,
      rates,
      latest: {
        value: latestPoint?.value,
        change: changes[changes.length - 1]?.value,
        rate: rates[rates.length - 1]?.value,
      },
    };
  }).filter((item) => item.changes.some((point) => Number.isFinite(point.value)));
}

function renderMiniChart(svgId, diagnostics, config) {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  svg.innerHTML = "";

  const { metricKey, metricLabel, formatTick, formatValue } = config;
  const width = 520;
  const height = 220;
  const pad = { top: 18, right: 18, bottom: 34, left: 58 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const lines = diagnostics.map((item, index) => ({
    id: item.id,
    label: t(item.meta.short_name),
    color: seriesColor(item.id),
    item,
    points: item[metricKey].filter((point) => Number.isFinite(point.value)),
  })).filter((line) => line.points.length);
  const allPoints = lines.flatMap((line) => line.points);

  svg.insertAdjacentHTML("beforeend", `<rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#0b1814"></rect>`);

  if (!allPoints.length) {
    svg.insertAdjacentHTML("beforeend", `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#91a49d" font-size="13">${t("Need more months")}</text>`);
    return;
  }

  const dates = [...new Set(allPoints.map((point) => point.date))].sort();
  const values = allPoints.map((point) => point.value);
  let min = Math.min(...values, 0);
  let max = Math.max(...values, 0);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const x = (date) => pad.left + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * chartWidth;
  const y = (value) => pad.top + (1 - ((value - min) / span)) * chartHeight;

  buildTicks(min, max, 4).forEach((tick) => {
    const yy = y(tick);
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="rgba(154,187,175,0.12)" />
      <text x="${pad.left - 10}" y="${yy + 4}" text-anchor="end" fill="#91a49d" font-size="10">${formatTick(tick)}</text>
    `);
  });

  const zeroY = y(0);
  svg.insertAdjacentHTML("beforeend", `<line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" stroke="rgba(154,187,175,0.35)" stroke-dasharray="4 5" />`);

  const dateLabels = [dates[0], dates[Math.floor((dates.length - 1) / 2)], dates[dates.length - 1]].filter(Boolean);
  [...new Set(dateLabels)].forEach((date) => {
    const xx = x(date);
    const anchor = date === dates[0] ? "start" : (date === dates[dates.length - 1] ? "end" : "middle");
    svg.insertAdjacentHTML("beforeend", `<text x="${xx}" y="${height - 12}" text-anchor="${anchor}" fill="#91a49d" font-size="10">${formatMonth(date)}</text>`);
  });

  lines.forEach((line) => {
    const points = line.points.map((point) => `${x(point.date)},${y(point.value)}`).join(" ");
    const last = line.points[line.points.length - 1];
    svg.insertAdjacentHTML("beforeend", `
      <polyline fill="none" stroke="${line.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
      <circle cx="${x(last.date)}" cy="${y(last.value)}" r="3.8" fill="${line.color}" />
    `);
  });

  svg.insertAdjacentHTML("beforeend", `
    <g id="${svgId}HoverLayer"></g>
    <rect id="${svgId}Overlay" x="${pad.left}" y="${pad.top}" width="${chartWidth}" height="${chartHeight}" fill="transparent" style="cursor:crosshair"></rect>
  `);

  const overlay = document.getElementById(`${svgId}Overlay`);
  const hoverLayer = document.getElementById(`${svgId}HoverLayer`);
  const showHover = (event) => {
    const pointer = event.touches?.[0] || event;
    const bounds = svg.getBoundingClientRect();
    const scaledX = ((pointer.clientX - bounds.left) / bounds.width) * width;
    const ratio = Math.max(0, Math.min(1, (scaledX - pad.left) / chartWidth));
    const dateIndex = Math.round(ratio * Math.max(dates.length - 1, 0));
    const date = dates[dateIndex];
    const xx = x(date);
    const rows = lines.map((line) => {
      const point = line.points.find((item) => item.date === date);
      return { ...line, value: point?.value };
    }).filter((row) => Number.isFinite(row.value));

    hoverLayer.innerHTML = `
      <line x1="${xx}" y1="${pad.top}" x2="${xx}" y2="${height - pad.bottom}" stroke="rgba(154,187,175,0.35)" stroke-dasharray="4 5" />
      ${rows.map((row) => `<circle cx="${xx}" cy="${y(row.value)}" r="4.5" fill="#0b1814" stroke="${row.color}" stroke-width="2.5" />`).join("")}
    `;
    renderDiagnosticTooltip(svg, pointer, metricLabel, date, rows, formatValue);
  };

  overlay.addEventListener("mousemove", showHover);
  overlay.addEventListener("mouseleave", () => {
    hoverLayer.innerHTML = "";
    hideDiagnosticTooltip();
  });
  overlay.addEventListener("touchstart", showHover, { passive: true });
  overlay.addEventListener("touchmove", showHover, { passive: true });
}

function getDiagnosticUnitLabel(display) {
  if (state.mode === "growth" || state.mode === "relative") return t("Index points");
  if (display.units?.length === 1) return `${t("Delta")} ${display.units[0]}`;
  return t("Delta");
}

function valueTone(value) {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function getDeltaUnit(item) {
  return (state.mode === "growth" || state.mode === "relative") ? t("pts") : item.rawUnit;
}

function renderDiagnosticTooltip(svg, pointer, title, date, rows, formatValue) {
  const tooltip = document.getElementById("diagnosticTooltip");
  const shell = document.getElementById("changeDiagnostics");
  if (!tooltip || !shell || !rows.length) return;

  tooltip.innerHTML = `
    <div class="tooltip-date">${title} · ${formatMonth(date)}</div>
    ${rows.map((row) => `
      <div class="tooltip-row">
        <span class="tooltip-series"><span class="legend-swatch" style="background:${row.color}"></span>${row.label}</span>
        <span class="${valueTone(row.value)}">${formatValue(row.value, row.item)}</span>
      </div>
    `).join("")}
  `;
  tooltip.setAttribute("aria-hidden", "false");

  const shellRect = shell.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const tooltipWidth = 230;
  const left = Math.min(
    Math.max(pointer.clientX - shellRect.left + 12, 10),
    shellRect.width - tooltipWidth - 10
  );
  const top = Math.max(48, pointer.clientY - shellRect.top - 12);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.min(top, svgRect.bottom - shellRect.top - 80)}px`;
}

function hideDiagnosticTooltip() {
  const tooltip = document.getElementById("diagnosticTooltip");
  if (!tooltip) return;
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.innerHTML = "";
}

function formatSignedDiagnostic(value, unit, isRateLike) {
  if (!Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  const formatted = isRateLike ? decimal(value, 2) : formatRawValue(value);
  if (unit === "%") return `${sign}${formatted}%`;
  if (unit === " pp") return `${sign}${formatted} pp`;
  return `${sign}${formatted}${unit ? ` ${unit}` : ""}`;
}

function formatMiniAxis(value) {
  if (!Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toLocaleString(locale(), { maximumFractionDigits: 0 });
  if (abs >= 100) return decimal(value, 0);
  if (abs >= 10) return decimal(value, 1);
  return decimal(value, 2);
}

function renderChart(display) {
  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("chartTooltip");
  const emptyState = document.getElementById("chartEmptyState");
  const stage = document.getElementById("chartStage");
  svg.innerHTML = "";
  chartScale = null;
  document.getElementById("dismissChartDetails").hidden = !state.chartPinned;
  hideTooltip();

  CHART_DIMS.width = Math.max(320, stage.clientWidth);
  CHART_DIMS.height = stage.clientWidth < 640 ? 320 : 380;
  CHART_DIMS.pad.left = 52;
  CHART_DIMS.pad.right = 32;
  CHART_DIMS.pad.bottom = 40;
  const { width, height, pad } = CHART_DIMS;
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.aspectRatio = `${width} / ${height}`;
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
  const ticks = chartTicks(min, max);
  min = ticks[0];
  max = ticks.at(-1);
  const span = max - min;
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const hoverIndex = state.hoverIndex ?? dates.length - 1;

  const x = (index) => pad.left + (index / Math.max(dates.length - 1, 1)) * chartWidth;
  const y = (value) => pad.top + (1 - ((value - min) / span)) * chartHeight;
  chartScale = { x, y, chartWidth };

  svg.insertAdjacentHTML("beforeend", `<rect x="${pad.left}" y="${pad.top}" width="${chartWidth}" height="${chartHeight}" rx="20" fill="#0b1814"></rect>`);

  ticks.forEach((tick) => {
    const yy = y(tick);
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="rgba(154,187,175,0.12)" />
      <text x="${pad.left - 14}" y="${yy + 4}" text-anchor="end" fill="#91a49d" font-size="12">${formatAxis(tick)}</text>
    `);
  });

  const referenceValue = state.mode === "price" ? (min <= 0 && max >= 0 ? 0 : null) : 100;
  if (referenceValue != null && referenceValue >= min && referenceValue <= max) {
    const yy = y(referenceValue);
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="rgba(154,187,175,0.35)" stroke-dasharray="5 5" />
    `);
  }

  const labelCount = Math.min(dates.length, width < 480 ? 3 : width < 640 ? 4 : 7);
  const labelIndexes = Array.from({length: labelCount}, (_, index) => Math.round(index * (dates.length - 1) / Math.max(labelCount - 1, 1)));
  labelIndexes.forEach((index) => {
    const date = dates[index];
    const xx = x(index);
    const anchor = index === 0 ? "start" : (index === dates.length - 1 ? "end" : "middle");
    svg.insertAdjacentHTML("beforeend", `
      <line x1="${xx}" y1="${height - pad.bottom + 6}" x2="${xx}" y2="${height - pad.bottom + 12}" stroke="rgba(154,187,175,0.25)" />
      <text x="${xx}" y="${height - 18}" text-anchor="${anchor}" fill="#91a49d" font-size="12">${formatMonth(date)}</text>
    `);
  });

  displaySeries.forEach((series, index) => {
    const color = seriesColor(series.id);
    const points = series.values.map((point, pointIndex) => `${x(pointIndex)},${y(point.value)}`).join(" ");
    const lastPoint = series.values[series.values.length - 1];
    const hoverPoint = series.values[hoverIndex];

    svg.insertAdjacentHTML("beforeend", `
      <g class="series-line" data-series="${series.id}">
      <polyline fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${points}" />
      <circle cx="${x(series.values.length - 1)}" cy="${y(lastPoint.value)}" r="3" fill="${color}" />
      <circle class="hover-point" cx="${x(hoverIndex)}" cy="${y(hoverPoint.value)}" r="${state.hoverIndex == null ? 0 : 4}" fill="#0b1814" stroke="${color}" stroke-width="2" /></g>
    `);
  });

  const hoverX = x(hoverIndex);
  svg.insertAdjacentHTML("beforeend", `
    <line id="chartCursor" opacity="${state.hoverIndex == null ? 0 : 1}" x1="${hoverX}" y1="${pad.top}" x2="${hoverX}" y2="${height - pad.bottom}" stroke="rgba(154,187,175,0.35)" stroke-dasharray="4 5" />
    <rect id="chartOverlay" tabindex="0" role="slider" aria-label="${t("Explore monthly chart")}" aria-valuemin="0" aria-valuemax="${dates.length - 1}" aria-valuenow="${hoverIndex}" aria-valuetext="${formatMonth(dates[hoverIndex])}" x="${pad.left}" y="${pad.top}" width="${chartWidth}" height="${chartHeight}" fill="transparent" style="cursor:crosshair;touch-action:pan-y"></rect>
  `);

  const overlay = document.getElementById("chartOverlay");
  overlay.addEventListener("mousemove", (event) => { if (!state.chartPinned) onChartHover(event); });
  overlay.addEventListener("mouseleave", () => {
    if (!state.chartPinned) clearChartPoint();
  });
  overlay.addEventListener("click", (event) => {
    state.chartPinned = true;
    onChartHover(event);
  });
  overlay.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === "Home" ? 0 : event.key === "End" ? dates.length - 1 : (state.hoverIndex ?? dates.length - 1) + (event.key === "ArrowLeft" ? -1 : 1);
    state.chartPinned = true;
    showChartPoint(Math.max(0, Math.min(index, dates.length - 1)));
  });
  document.getElementById("dismissChartDetails").hidden = !state.chartPinned;

  if (state.hoverIndex != null) renderTooltip(display, hoverIndex, hoverX);
  highlightSeries(state.highlightedSeries);
}

function onChartHover(event) {
  if (!chartScale || !state.lastDisplay.dates.length) return;
  const { chartWidth } = chartScale;
  const svg = document.getElementById("chart");
  const bounds = svg.getBoundingClientRect();
  const relativeX = Math.max(0, Math.min(chartWidth, ((event.clientX - bounds.left) / bounds.width) * CHART_DIMS.width - CHART_DIMS.pad.left));
  const ratio = chartWidth ? relativeX / chartWidth : 0;
  const index = Math.round(ratio * Math.max(state.lastDisplay.dates.length - 1, 0));
  showChartPoint(index);
}

function showChartPoint(index) {
  const { x, y } = chartScale;
  state.hoverIndex = index;
  document.querySelectorAll("#chart .hover-point").forEach((point, seriesIndex) => {
    point.setAttribute("cx", x(index));
    point.setAttribute("cy", y(state.lastDisplay.series[seriesIndex].values[index].value));
    point.setAttribute("r", "4");
  });
  const cursor = document.getElementById("chartCursor");
  cursor.setAttribute("x1", x(index));
  cursor.setAttribute("x2", x(index));
  cursor.setAttribute("opacity", "1");
  const overlay = document.getElementById("chartOverlay");
  overlay.setAttribute("aria-valuenow", index);
  overlay.setAttribute("aria-valuetext", formatMonth(state.lastDisplay.dates[index]));
  document.getElementById("dismissChartDetails").hidden = !state.chartPinned;
  renderTooltip(state.lastDisplay, index, x(index));
}

function clearChartPoint() {
  state.hoverIndex = null;
  state.chartPinned = false;
  document.querySelectorAll("#chart .hover-point").forEach(point => point.setAttribute("r", "0"));
  document.getElementById("chartCursor")?.setAttribute("opacity", "0");
  document.getElementById("dismissChartDetails").hidden = true;
  hideTooltip();
}

function dismissChartDetails() {
  clearChartPoint();
  state.pinnedSeries = null;
  highlightSeries(null);
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
        <span class="tooltip-series"><span class="legend-swatch" style="background:${seriesColor(series.id)}"></span>${escapeHTML(t(series.meta.short_name))}</span>
        <span class="tooltip-value">${formatTooltipValue(point.value, series.rawUnit)}</span>
        <span class="${deltaPct >= 0 ? "positive" : "negative"}">${deltaPct >= 0 ? "+" : ""}${decimal(deltaPct, 1)}%</span>
      </div>
    `;
  }).join("");

  tooltip.innerHTML = `
    <div class="tooltip-date">${formatMonth(date)}${state.chartPinned ? `<span class="tooltip-pinned">${t("Pinned")}</span>` : ""}</div>
    ${rows}
  `;
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.classList.toggle("is-pinned", state.chartPinned);

  const stageWidth = stage.clientWidth;
  const left = (xPos / CHART_DIMS.width) * stageWidth;
  tooltip.style.left = `${Math.max(8, Math.min(left + 18, stageWidth - tooltip.offsetWidth - 8))}px`;
  tooltip.style.top = "16px";
  const close = document.getElementById("dismissChartDetails");
  close.style.left = `${parseFloat(tooltip.style.left) + tooltip.offsetWidth - 48}px`;
  close.style.top = "17px";
}

function hideTooltip() {
  const tooltip = document.getElementById("chartTooltip");
  tooltip.setAttribute("aria-hidden", "true");
  tooltip.innerHTML = "";
}

function getEmptyReason(reason) {
  if (reason === "mixed-price") return { title: t("Use Growth for this comparison"), body: t("Index levels and prices in different units work best when everything starts at 100. Choose Growth above, or select stocks for Price mode.") };
  if (reason === "no-selection") {
    return {
      title: t("No lines selected"),
      body: t("Choose stocks, indexes, currencies, or commodities above to start exploring."),
    };
  }
  if (reason === "no-common-dates") {
    return {
      title: t("No shared monthly window"),
      body: t("The selected lines and benchmark do not overlap inside the chosen date range. Try widening the range or changing the benchmark."),
    };
  }
  return {
    title: t("Nothing to draw"),
    body: t("The current combination does not produce usable monthly points."),
  };
}

function chartTicks(min, max) {
  const rawStep = (max - min) / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= rawStep) * magnitude;
  const first = Math.floor(min / step);
  const last = Math.ceil(max / step);
  return Array.from({ length: last - first + 1 }, (_, index) => Number(((first + index) * step).toPrecision(12)));
}

function buildTicks(min, max, count) {
  const ticks = [];
  for (let i = 0; i < count; i++) {
    ticks.push(min + ((max - min) * i) / (count - 1));
  }
  return ticks;
}

function formatAxis(value) {
  if (Math.abs(value) >= 1000) return value.toLocaleString(locale(), { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 1) return value.toLocaleString(locale(), {maximumFractionDigits: 2, useGrouping: false});
  return value.toLocaleString(locale(), {maximumSignificantDigits: 3, useGrouping: false});
}

function formatSummaryValue(value, unit) {
  if (!Number.isFinite(value)) return "-";
  if (state.mode === "growth" || state.mode === "relative") return decimal(value, 1);
  return `${formatRawValue(value)}${unit ? ` ${unit}` : ""}`;
}

function formatTooltipValue(value, unit) {
  if (state.mode === "growth" || state.mode === "relative") return `${decimal(value, 1)}`;
  return `${formatRawValue(value)}${unit ? ` ${unit}` : ""}`;
}

function formatRawValue(value) {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(locale(), { maximumFractionDigits: 1 });
  }
  if (Math.abs(value) >= 100) {
    return decimal(value, 1);
  }
  return decimal(value, 2);
}

function updateCoverage() {
  document.getElementById("datasetBadge").innerHTML = `<strong>${state.metadata.length}</strong> ${t("assets")} <span>·</span> <strong>${new Set(state.metadata.filter(m => m.category === "stock" || m.category === "index").map(m => m.country)).size}</strong> ${t("markets")} <span>·</span> ${t("Since")} ${state.allDates[0].slice(0, 4)}`;
  document.getElementById("dataCoverage").textContent = t("Monthly · Through {0}", formatMonth(state.allDates.at(-1)));
  document.getElementById("sourceCoverage").textContent = t("Monthly history from {0} through {1}, where available. Every comparison uses the dates shared by all selected assets.", formatMonth(state.allDates[0]), formatMonth(state.allDates.at(-1)));
}

// Versioned links contain only public comparison settings, never local storage.
function comparisonHash() {
  return new URLSearchParams({v: "1", assets: [...state.selectedSeries].join(","), start: state.startDate,
    end: state.endDate, view: state.mode, ref: state.benchmark, result: state.resultMode,
    inflation: inflationActive() ? "1" : "0", collection: state.collection, lang: language}).toString();
}

function restoreComparison(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("v") !== "1") return;
  if (params.has("assets")) state.selectedSeries = new Set(params.get("assets").split(",").filter(id => state.metadataMap.has(id)));
  if (["growth", "price", "relative"].includes(params.get("view"))) state.mode = params.get("view");
  const ref = params.get("ref");
  if (Object.hasOwn(BENCHMARK_DEFS, ref) || isStockBenchmark(ref)) state.benchmark = ref;
  const start = params.get("start"), end = params.get("end");
  if (state.allDates.includes(start) && state.allDates.includes(end) && start <= end) {
    state.startDate = start; state.endDate = end;
  }
  if (["percent", "money", "drawdown"].includes(params.get("result"))) state.resultMode = params.get("result");
  if (Object.hasOwn(COLLECTIONS, params.get("collection"))) state.collection = params.get("collection");
  state.inflation = params.get("inflation") === "1";
  document.getElementById("moreOptions").open = state.mode !== "growth" || !CURRENCY_IDS.includes(state.benchmark) || inflationActive() || state.resultMode === "drawdown";
  state.activePreset = null;
  populateDateSelects(); syncTimeframeButtons(null); renderCollections(); render();
}

async function shareComparison() {
  const local = window.location.protocol === "file:" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const url = new URL(local ? "https://adhni.github.io/id-market/" : window.location.href);
  url.hash = comparisonHash();
  const feedback = document.getElementById("shareFeedback");
  const input = document.getElementById("shareLink");
  input.value = url.href;
  feedback.hidden = false;
  try {
    await navigator.clipboard.writeText(url.href);
    document.getElementById("shareMessage").textContent = t("Link copied. Anyone with it can open this comparison.");
    input.hidden = true;
  } catch {
    document.getElementById("shareMessage").textContent = t("Copy this link to share your comparison:");
    input.hidden = false; input.focus(); input.select();
  }
}

async function init() {
  setupLanguage();
  const [seriesText, metadataText, inflationText] = await Promise.all([
    loadTextWithFallback("data/series.csv", "embedded-series-csv"),
    loadTextWithFallback("data/metadata.csv", "embedded-metadata-csv"),
    loadTextWithFallback("data/inflation.csv", "embedded-inflation-csv"),
  ]);

  state.rawSeries = parseCSV(seriesText);
  state.metadata = parseCSV(metadataText);
  const { grouped, metaMap } = buildMaps(state.rawSeries, state.metadata);
  state.seriesMap = grouped;
  state.seriesMap.set("CPI_ID", parseCSV(inflationText).map(row => ({date: row.date, value: Number(row.value)})));
  state.metadataMap = metaMap;
  state.allDates = [...new Set(state.rawSeries.filter((row) => row.frequency === "monthly").map((row) => row.date))].sort();
  state.startDate = state.allDates[0];
  state.endDate = state.allDates[state.allDates.length - 1];

  updateCoverage();
  window.addEventListener("resize", () => renderChart(state.lastDisplay));
  setupControls();
  populateDateSelects();
  document.getElementById("benchmarkSelect").value = state.benchmark;
  applyTimeframe("3Y");
  restoreComparison(window.location.hash);
  window.addEventListener("hashchange", () => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get("v") !== "1") return;
    if (["en", "id"].includes(params.get("lang"))) {
      language = params.get("lang"); applyLanguage();
    }
    restoreComparison(window.location.hash);
  });
}

init().catch((error) => {
  document.getElementById("chartEmptyState").classList.remove("hidden");
  document.getElementById("chartEmptyState").textContent = t("Could not load the monthly data. Refresh the page to try again.");
  console.error(error);
});

# ID Market

A small playground for comparing Indonesia with global stocks, indexes, currencies, commodities, and crypto.

Live site: https://adhni.github.io/id-market/

## Explore

- **Start simply:** choose assets, a period, and a currency. Growth in Rupiah is the default. Price, benchmark comparisons, other measuring references, inflation, and Biggest fall live in **More options**. Active settings stay visible above the chart, including those restored from an existing share link.
- **Read the result:** Rupiah Growth shows the Rp1 million illustration and percentage change together, with a short factual takeaway and the actual shared dates. Other currencies show percentage change; Price shows the latest converted price and its change.
- **Explore by touch:** tap a chart month to pin its details, then close them or tap elsewhere. Arrow keys, Home, and End explore months from the focused chart; Escape dismisses details. Tap a result or legend item to pin its line highlight.

- **Inflation:** the checkbox adjusts Growth measured in Rupiah using Indonesia’s monthly CPI ([BIS, M.ID.628](https://data.bis.org/topics/CPI/BIS,WS_LONG_CPI,1.0/M.ID.628), index 2010=100, not seasonally adjusted). Growth is divided by CPI growth over the same shared dates; missing CPI months are excluded. Rp1 million then represents starting-month purchasing power.
- **Biggest fall:** the result option in More options shows the largest fall from a prior monthly peak within the chosen period and measuring reference. It includes inflation adjustment when active. Daily/intraday losses may be larger.
- **Share:** copies a versioned link with assets, dates, view, reference, inflation, results tab, collection, and language. Local previews generate public-site links, usable once the change is deployed.

- **EN / ID** in the header switches the interface between English and Indonesian, including dates, numbers, asset search, and chart details. Your choice is remembered locally; the first visit follows your browser language (English fallback). Switching keeps the active comparison intact.

- **62 stocks** (50 Indonesian + 12 international), **10 indexes**, **8 currencies**, **6 commodities**, and **Bitcoin + Ethereum**: 88 selectable lines.
- Explore **Indonesia**, **World**, and **Themes** in the same workspace. World shows nine clickable index snapshots, with mini charts and period changes in the chosen measuring currency.
- New markets include the US, Australia, Singapore, Malaysia, Japan, Hong Kong, and India. TSMC uses its USD-denominated US ADR, filed under Taiwan.
- Monthly history from **January 2010 to August 2026**, with shorter histories for newer listings.
- Start with Indonesia vs the world, neighbouring markets, banks across borders, technology, gold vs crypto, resources, or automotive. Search by ticker, company, country, exchange, sector, or asset name; filter by market and asset type.
- Growth starts every line at 100. IDR is the default; other measuring references are available.
- A desktop workspace puts the chart beside a comparison list. Presets include a short description and keep the chosen period, currency, and view. Dividends and costs are excluded; indexes and commodities are comparison proxies.
- Distinct comparison colors connect the chart, sparklines, and results; remaining lines keep their colors when an asset is removed. Hover, focus, or tap an asset to highlight its line. Search and category filters share one asset selector; custom dates sit beside the period shortcuts.
- Price mode is for comparable raw units. Mixed assets and indexes use Growth or Vs benchmark.
- Comparisons use dates shared by every selected line and required reference. The page shows the actual shared window.

The stocks are a curated exploration list, **not** a claim to current or historical index membership.

## Run locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173. You can also open `index.html` directly: it embeds the same CSV data for offline use.

No frontend dependencies, API keys, database, or runtime external market requests. GitHub Pages deploys `main`.

## Refresh or expand the data

Edit `data/catalog.json` to add a Yahoo Finance stock/index/currency/crypto symbol, then run:

```sh
python3 scripts/refresh_data.py
```

Requires Python 3 and curl, with internet access. The script downloads monthly history, excludes the current incomplete month, rebuilds both CSV files, and updates the embedded HTML copies. All downloads and parsing must succeed before the files are written. Provider URLs and coverage are stored per series in `data/metadata.csv`.

Sources:

- [Yahoo Finance](https://finance.yahoo.com/): monthly stock/index/FX/crypto close series. Uses the chart endpoint, which can change or rate-limit requests. Stock closes use the provider's split adjustments; cash dividends are not included.
- [World Bank Pink Sheet](https://www.worldbank.org/en/research/commodity-markets): monthly average gold, WTI oil, Australian coal, nickel, palm oil, and Thai 5% rice prices. The script discovers the current workbook link.

Every non-IDR asset is converted from its recorded quote currency into IDR before conversion to the chosen measuring reference. Currency, country, and exchange are recorded in the catalog and metadata. INR/IDR is derived as USD/IDR divided by USD/INR. Commodities and crypto use USD quotes. Their monthly averages are compared with month-end financial prices: this is an exploratory view, not a trading feed. The refresh replaces the older mixed-source dataset rather than splicing incompatible histories.

## Checks

```sh
node --check app.js
node --check i18n.js
node --test tests/market.test.cjs
```

Browser smoke checks require an installed Playwright package and Google Chrome, with the local server running:

```sh
node tests/browser-smoke.cjs
node tests/language-smoke.cjs
node tests/analysis-smoke.cjs
node tests/usability-smoke.cjs
```

If Playwright is installed elsewhere, set `NODE_PATH` to that installation's `node_modules` directory. Browser checks cover the World overview, cross-market themes, country filters, currency switching, desktop layout, presets, stable colors and linked highlights, category filters and search, custom dates, benchmarks, price mode, reset, empty selections, the money illustration, a basic narrow-screen fallback, and direct-file opening. Preview screenshots are written to the system temporary directory.

Usability checks also cover the simplified toolbar, combined results, preset settings retention, matching/distinct colors, existing advanced share links, keyboard chart exploration, and a 375px touch viewport with pinned tooltips and normal scrolling.

Translations live in `i18n.js`, keyed by English copy. Static page text is captured once at startup; dynamic interface text uses `t()`. Market data, ticker IDs, and calculations stay independent of the selected language.

Refresh CPI separately with `python3 scripts/refresh_inflation.py`; this updates `data/inflation.csv` and its offline HTML copy. Bundled CPI currently covers January 2010–August 2026.

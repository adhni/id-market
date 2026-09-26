# ID Market

A small playground for comparing Indonesian stocks, the market, gold, currencies, and commodities.

Live site: https://adhni.github.io/id-market/

## Explore

- **50 stocks**, **IHSG and LQ45**, **3 currencies**, and **6 commodities**: 61 selectable lines.
- Monthly history from **January 2010 to August 2026**, with shorter histories for newer listings.
- Start with banks, stocks vs gold, coal, nickel, or the broad market; search by ticker, company, sector, or asset name.
- Growth starts every line at 100. IDR is the default; other measuring references are available.
- The optional Rp1 million illustration follows each line's price movement. It excludes dividends and costs; indexes and commodities are comparison proxies.
- Price mode is for comparable raw units. Mixed assets and indexes use Growth or Vs benchmark.
- Comparisons use dates shared by every selected line and required reference. The page shows the actual shared window.

The 50 stocks are a curated exploration list, **not** a claim to current or historical LQ45 membership.

## Run locally

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open http://127.0.0.1:4173. You can also open `index.html` directly: it embeds the same CSV data for offline use.

No frontend dependencies, API keys, database, or runtime external market requests. GitHub Pages deploys `main`.

## Refresh or expand the data

Edit `data/catalog.json` to add a Yahoo Finance stock/index/currency symbol, then run:

```sh
python3 scripts/refresh_data.py
```

Requires Python 3 and curl, with internet access. The script downloads monthly history, excludes the current incomplete month, rebuilds both CSV files, and updates the embedded HTML copies. All downloads and parsing must succeed before the files are written. Provider URLs and coverage are stored per series in `data/metadata.csv`.

Sources:

- [Yahoo Finance](https://finance.yahoo.com/): monthly stock/index/FX close series. Uses the chart endpoint, which can change or rate-limit requests. Stock closes use the provider's split adjustments; cash dividends are not included.
- [World Bank Pink Sheet](https://www.worldbank.org/en/research/commodity-markets): monthly average gold, WTI oil, Australian coal, nickel, palm oil, and Thai 5% rice prices. The script discovers the current workbook link.

Commodities are converted from USD into IDR before comparison, then into the chosen measuring reference. Their monthly averages are compared with month-end financial prices: this is an exploratory view, not a trading feed. The refresh replaces the older mixed-source dataset rather than splicing incompatible histories.

## Checks

```sh
node --check app.js
node --test tests/market.test.cjs
```

Browser smoke checks require an installed Playwright package and Google Chrome, with the local server running:

```sh
node tests/browser-smoke.cjs
```

If Playwright is installed elsewhere, set `NODE_PATH` to that installation's `node_modules` directory. Browser checks cover presets, search, benchmarks, price mode, reset, empty selections, the money illustration, mobile layout, and direct-file fallback. Preview screenshots are written to the system temporary directory.

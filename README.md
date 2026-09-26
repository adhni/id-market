# ID Market

A small playground for comparing Indonesia with global stocks, indexes, currencies, commodities, and crypto.

Live site: https://adhni.github.io/id-market/

## Explore

- **62 stocks** (50 Indonesian + 12 international), **10 indexes**, **8 currencies**, **6 commodities**, and **Bitcoin + Ethereum**: 88 selectable lines.
- Explore **Indonesia**, **World**, and **Themes** in the same workspace. World shows nine clickable index snapshots, with mini charts and period changes in the chosen measuring currency.
- New markets include the US, Australia, Singapore, Malaysia, Japan, Hong Kong, and India. TSMC uses its USD-denominated US ADR, filed under Taiwan.
- Monthly history from **January 2010 to August 2026**, with shorter histories for newer listings.
- Start with Indonesia vs the world, neighbouring markets, banks across borders, technology, gold vs crypto, resources, or automotive. Search by ticker, company, country, exchange, sector, or asset name; filter by market and asset type.
- Growth starts every line at 100. IDR is the default; other measuring references are available.
- A desktop workspace puts the chart beside a comparison list. Switch the list between percentage change and an Rp1 million illustration. Dividends and costs are excluded; indexes and commodities are comparison proxies.
- Stable asset colors connect the chart, sparklines, and results. Hover or focus an asset to highlight its line. Search and category filters share one asset selector; custom dates sit beside the period shortcuts.
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
node --test tests/market.test.cjs
```

Browser smoke checks require an installed Playwright package and Google Chrome, with the local server running:

```sh
node tests/browser-smoke.cjs
```

If Playwright is installed elsewhere, set `NODE_PATH` to that installation's `node_modules` directory. Browser checks cover the World overview, cross-market themes, country filters, currency switching, desktop layout, presets, stable colors and linked highlights, category filters and search, custom dates, benchmarks, price mode, reset, empty selections, the money illustration, a basic narrow-screen fallback, and direct-file opening. Preview screenshots are written to the system temporary directory.

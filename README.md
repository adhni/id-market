# ID Market

A small playground for comparing Indonesia with global stocks, indexes, currencies, commodities, and crypto.

Live site: https://adhni.github.io/id-market/

## Explore

- **Start simply:** choose assets, a period, and a currency. Growth in Rupiah is the default. Price, benchmark comparisons, other measuring references, inflation, and Biggest fall live in **More options**. Active settings stay visible above the chart, including those restored from an existing share link.
- **Read the result:** Rupiah Growth shows the Rp1 million illustration and percentage change together, with a short factual takeaway and the actual shared dates. Other currencies show percentage change; Price shows the latest converted price and its change.
- **Explore by touch:** tap a chart month to pin its details, then close them or tap elsewhere. Arrow keys, Home, and End explore months from the focused chart; Escape dismisses details. Tap a result or legend item to pin its line highlight.

- **Inflation:** the checkbox adjusts Growth measured in Rupiah using Indonesia’s monthly CPI ([BIS, M.ID.628](https://data.bis.org/topics/CPI/BIS,WS_LONG_CPI,1.0/M.ID.628), index 2010=100, not seasonally adjusted). Growth is divided by CPI growth over the same shared dates; missing CPI months are excluded. Rp1 million then represents starting-month purchasing power.
- **Biggest fall:** the result option in More options shows the largest fall from a prior monthly peak within the chosen period and measuring reference. It includes inflation adjustment when active. Daily/intraday losses may be larger.
- **Company fundamentals:** selected Indonesian stocks show market cap in Rupiah, trailing P/E, P/B, trailing ROE and trailing ROA from IDX. Official sector and industry appear below the company name. Market cap sits above a two-column valuation/profitability grid. Index memberships and non-bank liabilities/equity sit inside each card’s expandable Company details; banks do not show this leverage ratio. These are the latest collected snapshots, independent of chart dates, currency, and inflation. All 50 Indonesian stocks are covered. International stocks show a coverage note. Definitions are expandable; nonpositive P/E and P/B are shown as not meaningful, and missing values are distinct from zero. ROE is also suppressed when negative P/B indicates negative equity; a rounded zero P/B is not used to infer the equity sign.
- **Share:** copies a versioned link with assets, dates, view, reference, inflation, results tab, collection, and language. Local previews generate public-site links, usable once the change is deployed.

- **EN / ID** in the header switches the interface between English and Indonesian, including dates, numbers, asset search, and chart details. Your choice is remembered locally; the first visit follows your browser language (English fallback). Switching keeps the active comparison intact.

- **62 stocks** (50 Indonesian + 12 international), **10 indexes**, **8 currencies**, **12 commodities**, and **Bitcoin + Ethereum**: 94 selectable lines.
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

To refresh only the World Bank commodities, run `python3 scripts/refresh_data.py --commodities-only`. This keeps the other series and limits commodity coverage to the bundled USD/IDR history so additions work in Rupiah immediately.

Sources:

- [Yahoo Finance](https://finance.yahoo.com/): monthly stock/index/FX/crypto close series. Uses the chart endpoint, which can change or rate-limit requests. Stock closes use the provider's split adjustments; cash dividends are not included.
- [World Bank Pink Sheet](https://www.worldbank.org/en/research/commodity-markets): monthly average gold, silver, copper, tin, WTI oil, Australian coal, nickel, palm oil, Thai 5% rice, Robusta coffee, cocoa, and RSS3 rubber prices. These are global commodity reference prices. The script discovers the current workbook link.

Every non-IDR asset is converted from its recorded quote currency into IDR before conversion to the chosen measuring reference. Currency, country, and exchange are recorded in the catalog and metadata. INR/IDR is derived as USD/IDR divided by USD/INR. Commodities and crypto use USD quotes. Their monthly averages are compared with month-end financial prices: this is an exploratory view, not a trading feed. The refresh replaces the older mixed-source dataset rather than splicing incompatible histories.

## Checks

```sh
node --check app.js
node --check i18n.js
node --test tests/market.test.cjs
node --test tests/fundamentals.test.cjs
python3 -B -m unittest discover -s tests -p 'test_fundamentals.py'
```

Browser smoke checks require an installed Playwright package and Google Chrome, with the local server running:

```sh
node tests/browser-smoke.cjs
node tests/language-smoke.cjs
node tests/analysis-smoke.cjs
node tests/usability-smoke.cjs
node tests/fundamentals-smoke.cjs
```

If Playwright is installed elsewhere, set `NODE_PATH` to that installation's `node_modules` directory. Browser checks cover the World overview, cross-market themes, country filters, currency switching, desktop layout, presets, stable colors and linked highlights, category filters and search, custom dates, benchmarks, price mode, reset, empty selections, the money illustration, a basic narrow-screen fallback, and direct-file opening. Preview screenshots are written to the system temporary directory.

Usability checks also cover the simplified toolbar, combined results, preset settings retention, matching/distinct colors, existing advanced share links, keyboard chart exploration, and a 375px touch viewport with pinned tooltips and normal scrolling.

Translations live in `i18n.js`, keyed by English copy. Static page text is captured once at startup; dynamic interface text uses `t()`. Market data, ticker IDs, and calculations stay independent of the selected language.

Refresh CPI separately with `python3 scripts/refresh_inflation.py`; this updates `data/inflation.csv` and its offline HTML copy. Bundled CPI currently covers January 2010–August 2026.

Refresh fundamentals separately with `python3 scripts/refresh_fundamentals.py`. It makes one public request to the [IDX stock screener data endpoint](https://www.idx.id/support/stock-screener/api/v1/stock-screener/get?lang=en), filters to the Indonesian stocks in the catalog, validates coverage, duplicates, numeric types, classifications and membership lists, then replaces `data/fundamentals.json` and its embedded offline copy. No API key or frontend dependency is needed. Explicit source nulls remain missing; an absent ticker/field or malformed response fails before either bundle is written. Keep the existing snapshot if the service is unavailable. A missing or malformed optional snapshot does not stop the price app; it uses the embedded copy when available.

The bundled snapshot was collected on **16 October 2026**. Its timestamp is a collection date, not a valuation date or financial reporting period: the endpoint supplies neither of those dates. [IDX's methodology](https://www.idx.id/id/investhub/stock-screener-column-explanation) describes previous month-end prices and listed shares, with the latest submitted financial statements; P/E, ROE and ROA use trailing 12-month earnings. The UI preserves that distinction instead of inventing report dates or applying current financials to an old chart period. IDX defines its DER field as total liabilities divided by equity; the UI labels it Liabilities / equity and keeps it out of bank cards. Values are retained as reported, including unusually large positive ratios; there are no cheap/expensive labels.

To import a previously downloaded IDX JSON response, use `python3 scripts/refresh_fundamentals.py --input /path/to/response.json --retrieved-at 2026-10-16T09:47:41+00:00`, supplying its original collection timestamp. This does not refresh prices or CPI. Monthly refreshes are appropriate for the documented source basis.

Dividend yield is deferred: this endpoint supplies no dividend-payment history, and complete trailing payment coverage across the 50 stocks has not been verified. A missing dividend feed is not treated as a zero yield. The existing performance comparisons continue to exclude dividends.

The asset picker includes an optional **Indonesian stock filters** disclosure with industry and index membership filters. Filters apply to the available Indonesian stock snapshots and do not change the chart selection. They combine with search, market and asset category. Switching to another market or non-stock category suspends the Indonesian filters; Reset clears them. Search accepts translated industries. The supported index filters are LQ45, IDX30, IDX80, KOMPAS100, ISSI, JII and JII70. Memberships describe the collected snapshot, not historical index composition or a current certification. Listing-board codes such as MBX/DBX are not offered as indexes. Data schema v2 adds these classifications, memberships, ROA and liabilities/equity; the reader also accepts older v1 snapshots.

# Indonesia Market Sandbox — Codex-ready starter repo

This repo combines the visual MVP structure with the cleaned monthly data pack so you can hand one folder to Codex.

## Included
- Static frontend: `index.html`, `styles.css`, `app.js`
- Data files: `data/series.csv`, `data/metadata.csv`
- Local-file fallback: the HTML embeds the CSV content, so opening `index.html` directly should still work without a server

## Current scope
- 10 Indonesian stocks: BBCA, BBRI, BMRI, TLKM, ASII, ICBP, ANTM, MDKA, ADRO, PTBA
- Comparison series: USD/IDR, Gold, WTI Oil
- Frequency: monthly
- Coverage: 2019-07 to 2025-02
- IHSG is not included yet in this pack

## UI logic
### X-axis
- Month / time

### Y-axis modes
- Growth since start
- Price
- Performance vs benchmark

### Benchmarks in relative mode
- US Dollar
- Gold
- Oil

## Notes
- This is for exploration and experimentation, not precise trading analysis
- The current app allows mixed-unit plotting in Price mode because the point is to play around, but Growth mode is the clearest default
- Codex can now improve the UI and extend features without needing to touch data sourcing first

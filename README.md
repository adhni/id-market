# Indonesia Market Sandbox — Codex-ready starter repo

Live site: https://adhni.github.io/id-market/

This repo combines the visual MVP structure with the cleaned monthly data pack so you can hand one folder to Codex.

## Included
- Static frontend: `index.html`, `styles.css`, `app.js`
- Data files: `data/series.csv`, `data/metadata.csv`
- Local-file fallback: the HTML embeds the CSV content, so opening `index.html` directly should still work without a server

## Current scope
- 16 Indonesian stocks: ADRO, ANTM, ASII, BBCA, BBNI, BBRI, BMRI, GOTO, ICBP, INCO, ISAT, ITMG, MDKA, PTBA, TLKM, UNVR
- Comparison series: USD/IDR, EUR/IDR, JPY/IDR, Gold, WTI Oil, Coal, Nickel, Palm Oil, Rice
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
- Rupiah
- US Dollar
- Gold
- Oil

## Notes
- This is for exploration and experimentation, not precise trading analysis
- The current app allows mixed-unit plotting in Price mode because the point is to play around, but Growth mode is the clearest default
- Codex can now improve the UI and extend features without needing to touch data sourcing first

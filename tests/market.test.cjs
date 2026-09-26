const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('\ninit().catch')[0];
function model() {
  const context = vm.createContext({console});
  vm.runInContext(source, context);
  for (const name of ['series', 'metadata']) context[name + 'CSV'] = fs.readFileSync(path.join(root, 'data', name + '.csv'), 'utf8');
  vm.runInContext(`
    state.rawSeries = parseCSV(seriesCSV); state.metadata = parseCSV(metadataCSV);
    const maps = buildMaps(state.rawSeries, state.metadata);
    state.seriesMap = maps.grouped; state.metadataMap = maps.metaMap;
    state.startDate = '2023-08-01'; state.endDate = '2026-08-01';
  `, context);
  return (code) => vm.runInContext(code, context);
}
test('expanded bundle includes 50 stocks, indexes, currencies and commodities', () => {
  const run = model();
  assert.equal(run('state.metadata.length'), 61);
  assert.equal(run('state.metadata.filter(m => m.category === "stock").length'), 50);
  assert.equal(run('state.seriesMap.has("IHSG") && state.seriesMap.has("LQ45")'), true);
  assert.equal(run('new Set(state.rawSeries.map(r => r.series_id + r.date)).size'), run('state.rawSeries.length'));
  assert.equal(run('state.rawSeries.every(r => Number.isFinite(Number(r.value)) && Number(r.value) > 0)'), true);
});
test('mixed default draws all four lines with a common base of 100', () => {
  const run = model();
  assert.equal(run('buildDisplaySeries().series.length'), 4);
  assert.equal(run('buildDisplaySeries().series.every(s => s.values[0].value === 100)'), true);
  assert.equal(run('buildDisplaySeries().dates.length'), 37);
});
test('gold in IDR includes both the gold price and the exchange rate', () => {
  const run = model();
  const [actual, expected] = run(`
    state.selectedSeries = new Set(['GOLD']); state.benchmark = 'IDR';
    const result = buildDisplaySeries();
    const a = result.dates[0], b = result.dates.at(-1);
    const price = (id, date) => state.seriesMap.get(id).find(r => r.date === date).value;
    [result.series[0].values.at(-1).value,
      100 * price('GOLD', b) * price('USDIDR', b) / (price('GOLD', a) * price('USDIDR', a))];
  `);
  assert.ok(Math.abs(actual - expected) < 1e-8);
});
test('USD measured in USD stays flat; a reference compared with itself stays flat', () => {
  const run = model();
  assert.equal(run(`state.selectedSeries = new Set(['USDIDR']); state.benchmark = 'USDIDR'; buildDisplaySeries().series[0].values.every(p => p.value === 100)`), true);
  assert.equal(run(`state.selectedSeries = new Set(['GOLD']); state.benchmark = 'GOLD'; state.mode = 'relative'; buildDisplaySeries().series[0].values.every(p => Math.abs(p.value - 100) < 1e-8)`), true);
  assert.equal(run(`state.selectedSeries = new Set(['IHSG']); state.benchmark = 'IHSG'; buildDisplaySeries().series[0].values.every(p => p.value === 100)`), true);
});
test('short-history additions use their actual shared start', () => {
  const run = model();
  assert.equal(run(`state.startDate = '2010-01-01'; state.selectedSeries = new Set(['BBCA', 'GOTO']); buildDisplaySeries().dates[0]`), run(`state.metadataMap.get('GOTO').coverage_start`));
});
test('native stock prices still work; mixed raw units explain how to recover', () => {
  const run = model();
  assert.equal(run(`state.mode = 'price'; buildDisplaySeries().reason`), 'mixed-price');
  assert.equal(run(`state.selectedSeries = new Set(['BBCA']); buildDisplaySeries().series[0].values[0].value`), run(`state.seriesMap.get('BBCA').find(r => r.date === state.startDate).value`));
});
test('empty selections remain recoverable', () => {
  assert.equal(model()(`state.selectedSeries.clear(); buildDisplaySeries().reason`), 'no-selection');
});
test('embedded files match CSVs for offline opening', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const name of ['series', 'metadata']) {
    const embedded = html.match(new RegExp('<script id="embedded-' + name + '-csv" type="text/plain">([\\s\\S]*?)</script>'))[1];
    assert.equal(embedded.trim(), fs.readFileSync(path.join(root, 'data', name + '.csv'), 'utf8').trim());
  }
});

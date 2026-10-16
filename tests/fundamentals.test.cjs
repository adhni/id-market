const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const bundle = fs.readFileSync(path.join(root, 'data/fundamentals.json'), 'utf8');
function model() {
  const context = vm.createContext({console});
  vm.runInContext(fs.readFileSync(path.join(root, 'i18n.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('\ninit().catch')[0], context);
  return code => vm.runInContext(code, context);
}
test('snapshot covers exactly the 50 catalog Indonesian stocks and embeds identically offline', () => {
  const snapshot = JSON.parse(bundle);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
  assert.deepEqual(snapshot.stocks.map(s => s.series_id).sort(), catalog.filter(s => s.category === 'stock' && s.country === 'Indonesia').map(s => s.id).sort());
  assert.equal(snapshot.stocks.length, 50);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const embedded = html.match(/<script id="embedded-fundamentals-json" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.deepEqual(JSON.parse(embedded), snapshot);
  assert.equal(snapshot.price_as_of, null, 'collection time must not become a fabricated price date');
  assert.equal(snapshot.financial_period_end, null);
  assert.equal(model()(`parseFundamentals(${JSON.stringify(bundle)})?.stocks.length`), 50);
});
test('missing, zero and loss-making values remain distinct, including Indonesian formatting', () => {
  const run = model();
  assert.equal(run(`fundamentalMetric({pe_ttm: -10.46}, 'pe_ttm').text`), 'Not meaningful');
  assert.equal(run(`fundamentalMetric({pe_ttm: 0}, 'pe_ttm').text`), 'Not meaningful');
  assert.equal(run(`fundamentalMetric({pe_ttm: null}, 'pe_ttm').text`), 'Not available');
  assert.equal(run(`fundamentalMetric({roe_pct: 0, pb: 1}, 'roe_pct').text`), '0%');
  assert.equal(run(`fundamentalMetric({roe_pct: -14.44, pb: 1}, 'roe_pct').text`), '-14.44%');
  assert.equal(run(`fundamentalMetric({roe_pct: 20, pb: -1}, 'roe_pct').text`), 'Not meaningful');
  assert.equal(run(`fundamentalMetric({roe_pct: 20, pb: 0}, 'roe_pct').text`), '20%', 'rounded zero P/B cannot establish the equity sign');
  assert.equal(run(`fundamentalMetric({roa_pct: -2}, 'roa_pct').text`), '-2%');
  assert.equal(run(`fundamentalMetric({roa_pct: 0}, 'roa_pct').text`), '0%');
  assert.equal(run(`fundamentalMetric({liabilities_equity: 1.25, pb: 1}, 'liabilities_equity').text`), '1.25×');
  assert.equal(run(`fundamentalMetric({liabilities_equity: -2, pb: -1}, 'liabilities_equity').text`), 'Not meaningful');
  assert.equal(run(`fundamentalMetric({pe_ttm: 19728.83}, 'pe_ttm').text`), '19,728.83×', 'extreme positive ratios must not be silently capped');
  assert.match(run(`fundamentalMetric({market_cap_idr: 741406969462500}, 'market_cap_idr').title`), /741,406,969,462,500/);
  assert.equal(run(`language = 'id'; fundamentalMetric({pe_ttm: 12.9}, 'pe_ttm').text`), '12,9×');
  assert.equal(run(`fundamentalMetric({pe_ttm: null}, 'pe_ttm').text`), 'Tidak tersedia');
});
test('stock filters use exact snapshot memberships, respect market/category and preserve selections', () => {
  const run = model();
  run(`state.fundamentals = parseFundamentals(${JSON.stringify(bundle)});`);
  const meta = {short_name:'BBCA',display_name:'Bank Central Asia',country:'Indonesia',series_id:'BBCA',category:'stock',exchange:'IDX',currency:'IDR'};
  run(`var meta=${JSON.stringify(meta)}; var stock=state.fundamentals.stocks.find(s=>s.series_id==='BBCA'); var selected=JSON.stringify([...state.selectedSeries]);`);
  assert.equal(run(`state.assetIndustry='Banks'; state.assetIndex='LQ45'; matchesStockFilters(meta,stock,'')`), true);
  assert.equal(run(`state.assetIndex='JII'; matchesStockFilters(meta,stock,'')`), false, 'a substring is not index membership');
  assert.equal(run(`state.assetCountry='Australia'; matchesStockFilters(meta,stock,'')`), true, 'hidden Indonesian filters do not affect other markets');
  assert.equal(run(`state.assetCountry='all'; state.assetCategory='commodity'; matchesStockFilters(meta,stock,'')`), true);
  assert.equal(run(`state.assetCategory='all'; state.assetIndex='all'; language='id'; matchesStockFilters(meta,stock,'perbankan')`), true);
  assert.equal(run(`JSON.stringify([...state.selectedSeries])===selected`), true);
  assert.equal(run(`STOCK_INDEX_FILTERS.includes('MBX') || STOCK_INDEX_FILTERS.includes('DBX')`), false, 'listing boards are not offered as indexes');
});
test('old snapshots remain usable, and malformed extension fields are rejected', () => {
  const run = model();
  const snapshot = JSON.parse(bundle);
  snapshot.schema_version = 1;
  for (const stock of snapshot.stocks) for (const key of ['industry','sector','index_memberships','roa_pct','liabilities_equity']) delete stock[key];
  assert.equal(run(`parseFundamentals(${JSON.stringify(JSON.stringify(snapshot))})?.stocks.length`), 50);
  for (const change of [{roa_pct:'3.5%'},{industry:[]},{index_memberships:['LQ45','LQ45']},{liabilities_equity:undefined}]) {
    const bad = JSON.parse(bundle); Object.assign(bad.stocks[0],change);
    assert.equal(run(`parseFundamentals(${JSON.stringify(JSON.stringify(bad))})`), null);
  }
});
test('bad optional snapshots are rejected so they can fall back without breaking the chart', () => {
  const run = model();
  for (const bad of ['<html>Error</html>', 'null', '{}', JSON.stringify({...JSON.parse(bundle), stocks: [null]}), JSON.stringify({...JSON.parse(bundle), stocks: [{series_id:'BBCA', market_cap_idr:'100'}]}), JSON.stringify({...JSON.parse(bundle), retrieved_at:'unknown'})]) {
    assert.equal(run(`parseFundamentals(${JSON.stringify(bad)})`), null);
  }
  const snapshot = JSON.parse(bundle);
  snapshot.stocks.push(snapshot.stocks[0]);
  assert.equal(run(`parseFundamentals(${JSON.stringify(JSON.stringify(snapshot))})`), null);
});

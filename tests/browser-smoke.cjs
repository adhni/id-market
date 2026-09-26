// Run with NODE_PATH pointing at an installed Playwright package, or install
// Playwright locally without saving it. Uses the installed Google Chrome.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async () => {
 const browser = await chromium.launch({channel:'chrome', headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[]; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4173');
  await page.waitForSelector('#chart polyline');
  assert.equal(await page.locator('#chart polyline').count(),4);
  assert.match(await page.locator('#rangeWindowLabel').innerText(),/Aug 2023 to Aug 2026/);
  for(const [preset,count] of [['banks',4],['gold',3],['commodities',4],['nickel',4],['market',3],['default',4]]) {
   await page.click(`[data-preset="${preset}"]`);
   assert.equal(await page.locator('#chart polyline').count(),count,preset);
  }
  await page.click('[data-mode="relative"]');
  await page.selectOption('#benchmarkSelect','IHSG');
  assert.match(await page.locator('#chartTitle').innerText(),/IHSG/);
  assert.equal(await page.locator('#chart polyline').count(),4);
  await page.click('[data-preset="banks"]');
  await page.click('[data-mode="price"]');
  assert.equal(await page.locator('#chart polyline').count(),4);
  await page.selectOption('#benchmarkSelect','USDIDR');
  await page.click('#resetSelections');
  assert.equal(await page.locator('#benchmarkSelect').inputValue(),'IDR');
  assert.equal(await page.locator('[data-mode="growth"]').getAttribute('aria-pressed'),'true');
  await page.click('#stockToggleSummary');
  await page.fill('#stockToggleSearch','nickel');
  assert.equal(await page.locator('#stockToggleList input').count(),1);
  await page.check('#stockToggleList input');
  assert.equal(await page.locator('#chart polyline').count(),5);
  await page.click('#clearComparison');
  assert.match(await page.locator('#chartEmptyState').innerText(),/No lines selected/);
  await page.click('#stockToggleSummary');
  await page.click('[data-preset="default"]');
  await page.uncheck('#investmentView');
  assert.equal(await page.locator('#investmentResults').isVisible(),false);
  await page.check('#investmentView');
  assert.equal(await page.locator('.investment-card').count(),4);
  await page.click('[data-range="MAX"]');
  await page.click('#stockToggleSummary');
  await page.fill('#stockToggleSearch','GOTO');
  await page.check('#stockToggleList input');
  assert.match(await page.locator('#sharedWindowNote').innerText(),/Adjusted to the history/);
  await page.click('#stockToggleSummary');
  await page.click('#resetSelections');
  await page.screenshot({path:'/tmp/id-market-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true);
  assert.ok(await page.locator('#chart').evaluate(el => el.getBoundingClientRect().height)>250);
  assert.equal(await page.locator('#chartTooltip').getAttribute('aria-hidden'),'true');
  await page.click('#stockToggleSummary');
  await page.fill('#stockToggleSearch','gold');
  const box=await page.locator('.stock-toggle-panel').boundingBox();
  assert.ok(box.x>=0 && box.x+box.width<=390,'mobile selector fits');
  await page.click('#stockToggleSummary');
  await page.screenshot({path:'/tmp/id-market-mobile.png',fullPage:true});
  await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
  await page.waitForSelector('#chart polyline');
  assert.equal(await page.locator('#chart polyline').count(),4);
  assert.deepEqual(errors,[]);
  console.log('PASS: all presets, mixed lines, benchmarks, prices, reset, search, clear, money view, shorter history, mobile layout, and file:// fallback.');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

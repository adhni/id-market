// Run with the same Playwright/Chrome setup as browser-smoke.cjs.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({channel:'chrome', headless:true});
 try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173';
  await page.goto(base); await page.waitForSelector('#chart polyline');
  await page.click('[data-collection="themes"]');
  for (const preset of ['resources','automotive']) {
   await page.click(`[data-preset="${preset}"]`);
   const colors = await page.locator('#chart .series-line polyline').evaluateAll(lines => lines.map(line => line.getAttribute('stroke')));
   assert.equal(new Set(colors).size, colors.length, `${preset} lines have distinct colors`);
   for (const id of await page.evaluate(() => [...state.selectedSeries])) {
    const chart = await page.locator(`#chart [data-series="${id}"] polyline`).getAttribute('stroke');
    assert.equal(await page.locator(`.comparison-row[data-series="${id}"] .sparkline polyline`).getAttribute('stroke'), chart);
    const expected = await page.evaluate(color => {const element=document.createElement('span');element.style.background=color;return element.style.background;}, chart);
    assert.equal(await page.locator(`.legend-item[data-series="${id}"] .legend-swatch`).evaluate(element => element.style.background), expected);
   }
  }
  const remainingColor = await page.locator('#chart [data-series="TSLA"] polyline').getAttribute('stroke');
  await page.locator('.comparison-row[data-series="TOYOTA"]').hover();
  await page.locator('.comparison-row[data-series="TOYOTA"] .remove-asset').click();
  assert.equal(await page.locator('#chart [data-series="TSLA"] polyline').getAttribute('stroke'), remainingColor);

  // Existing v1 links must restore both simple and advanced settings accurately.
  const cases = [
   {assets:'BBCA,BBRI',view:'price',ref:'GOLD',result:'percent',inflation:'0'},
   {assets:'BBCA,GOLD',view:'relative',ref:'IHSG',result:'drawdown',inflation:'0'},
   {assets:'IHSG,BBCA,GOLD',view:'growth',ref:'IDR',result:'money',inflation:'0'},
   {assets:'IHSG,GOLD',view:'growth',ref:'IDR',result:'drawdown',inflation:'1'},
  ];
  const snapshot = () => page.evaluate(() => JSON.stringify({assets:[...state.selectedSeries],mode:state.mode,ref:state.benchmark,result:state.resultMode,inflation:state.inflation,start:state.startDate,end:state.endDate,values:state.lastDisplay.series.map(series=>series.values)}));
  for (const settings of cases) {
   const hash = new URLSearchParams({v:'1',start:'2021-08-01',end:'2026-08-01',lang:'en',...settings});
   await page.goto(`${base}/#${hash}`); await page.waitForSelector('#chart polyline');
   assert.equal(await page.evaluate(() => state.benchmark), settings.ref);
   assert.equal(await page.evaluate(() => state.mode), settings.view);
   assert.equal(await page.evaluate(() => state.resultMode), settings.result);
   assert.equal(await page.evaluate(() => state.inflation), settings.inflation === '1');
   const advanced = settings.view !== 'growth' || settings.ref === 'GOLD' || settings.ref === 'IHSG' || settings.result === 'drawdown' || settings.inflation === '1';
   assert.equal(await page.locator('#moreOptions').evaluate(element=>element.open), advanced);
   assert.ok((await page.locator('#comparisonSettings').innerText()).includes(await page.evaluate(()=>getBenchmarkLabel())));
   const before = await snapshot();
   const roundTrip = await page.evaluate(() => comparisonHash());
   await page.goto(`${base}/#${roundTrip}`); await page.waitForSelector('#chart polyline');
   assert.equal(await snapshot(), before);
  }
  await page.goto(base); await page.waitForSelector('#chart polyline');
  await page.locator('#chartOverlay').focus(); await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => state.hoverIndex), await page.evaluate(() => state.lastDisplay.dates.length - 2));
  assert.equal(await page.locator('#chartTooltip').getAttribute('aria-hidden'),'false');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#chartTooltip').getAttribute('aria-hidden'),'true');

  const mobile = await browser.newContext({viewport:{width:375,height:900},hasTouch:true,isMobile:true});
  const phone = await mobile.newPage();
  phone.on('pageerror',error=>errors.push(error.message));
  await phone.goto(base); await phone.waitForSelector('#chart polyline');
  await phone.evaluate(() => document.fonts.ready);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const selector of ['#stockToggleSummary','#currencySelect','#timeframeButtons [data-range="3Y"]','#customDates > summary','#moreOptions > summary']) {
   assert.ok((await phone.locator(selector).boundingBox()).height >= 44, `${selector} is easy to tap`);
  }
  await phone.locator('#chartOverlay').scrollIntoViewIfNeeded();
  const box = await phone.locator('#chartOverlay').boundingBox();
  await phone.touchscreen.tap(box.x+box.width*.55,box.y+box.height*.5);
  assert.equal(await phone.evaluate(() => state.chartPinned),true);
  assert.equal(await phone.evaluate(() => state.hoverIndex),await phone.evaluate(() => Math.round(.55*(state.lastDisplay.dates.length-1))));
  assert.equal(await phone.locator('#chartTooltip').getAttribute('aria-hidden'),'false');
  const tooltip = await phone.locator('#chartTooltip').boundingBox();
  const stage = await phone.locator('#chartStage').boundingBox();
  assert.ok(tooltip.x >= stage.x && tooltip.x+tooltip.width <= stage.x+stage.width);
  assert.match(await phone.locator('#chartTooltip').innerText(),/Pinned/);
  await phone.screenshot({path:'/tmp/id-market-pinned-mobile.png',fullPage:true});
  await phone.locator('.asset-result').first().tap();
  assert.equal(await phone.evaluate(() => state.chartPinned),false,'tapping outside dismisses the month');
  assert.equal(await phone.evaluate(() => state.pinnedSeries),'IHSG','tapping a result still pins its line');
  await phone.locator('.asset-result').first().tap();
  await phone.locator('#chartOverlay').scrollIntoViewIfNeeded();
  const repinBox = await phone.locator('#chartOverlay').boundingBox();
  await phone.touchscreen.tap(repinBox.x+repinBox.width*.55,repinBox.y+repinBox.height*.5);
  await phone.locator('#dismissChartDetails').tap();
  assert.equal(await phone.evaluate(() => state.chartPinned),false);
  assert.equal(await phone.locator('#chartTooltip').getAttribute('aria-hidden'),'true');
  const scrollBefore = await phone.evaluate(() => scrollY);
  const scrollBox = await phone.locator('#chartOverlay').boundingBox();
  const session = await mobile.newCDPSession(phone);
  await session.send('Input.synthesizeScrollGesture',{x:Math.round(scrollBox.x+scrollBox.width*.5),y:Math.round(scrollBox.y+scrollBox.height*.5),yDistance:-150,gestureSourceType:'touch',speed:600});
  assert.ok(await phone.evaluate(() => scrollY) > scrollBefore,'the chart allows normal touch scrolling');
  await phone.locator('.asset-result').first().tap();
  assert.equal(await phone.evaluate(() => state.pinnedSeries),'IHSG');
  await phone.locator('.asset-result').first().tap();
  assert.equal(await phone.evaluate(() => state.pinnedSeries),null);
  assert.deepEqual(errors,[]);
  console.log('PASS: distinct/stable comparison colors, matching swatches, existing advanced share links, keyboard exploration, mobile tap/pin/dismiss, tooltip bounds and touch scrolling');
 } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});

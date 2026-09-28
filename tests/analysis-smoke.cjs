const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.PREVIEW_URL||'http://127.0.0.1:4173';
  await page.goto(base);await page.waitForSelector('#chart polyline');
  const nominal=await page.locator('.result-value').first().innerText();
  await page.check('#adjustInflation');
  assert.notEqual(await page.locator('.result-value').first().innerText(),nominal);
  assert.match(await page.locator('#chartSubtitle').innerText(),/purchasing power/);
  await page.click('[data-result="drawdown"]');
  assert.match(await page.locator('#resultContext').innerText(),/Largest fall/);
  assert.ok((await page.locator('.result-value').allTextContents()).every(v=>/^(-|0)/.test(v)));
  await page.click('[data-collection="world"]');await page.click('[data-preset="global"]');
  await page.click('[data-language="id"]');
  assert.match(await page.locator('#inflationNote').innerText(),/Setelah inflasi/);
  await page.click('#shareComparison');
  await page.waitForFunction(()=>document.getElementById('shareMessage').textContent.includes('Tautan disalin'));
  assert.match(await page.locator('#shareMessage').innerText(),/Tautan disalin/);
  const url=await page.evaluate(()=>navigator.clipboard.readText());
  assert.equal(new URL(url).origin,'https://adhni.github.io');
  const snapshot=()=>page.evaluate(()=>JSON.stringify({ids:[...state.selectedSeries],start:state.startDate,end:state.endDate,view:state.mode,ref:state.benchmark,result:state.resultMode,inflation:state.inflation,lang:language,collection:state.collection,values:state.lastDisplay.series.map(s=>s.values)}));
  const before=await snapshot();
  await page.goto(base+'/'+new URL(url).hash);await page.waitForSelector('#chart polyline');
  assert.equal(await snapshot(),before,'shared comparison round trips');
  await page.selectOption('#benchmarkSelect','USDIDR');
  assert.equal(await page.locator('#adjustInflation').isDisabled(),true);
  assert.equal(await page.locator('#adjustInflation').isChecked(),false);
  await page.selectOption('#benchmarkSelect','IDR');
  assert.equal(await page.locator('#adjustInflation').isChecked(),true);
  await page.click('#resetSelections');assert.equal(await page.locator('#adjustInflation').isChecked(),false);
  await page.check('#adjustInflation');await page.click('[data-result="drawdown"]');
  await page.screenshot({path:'/tmp/id-market-analysis.png',fullPage:true});
  for(const width of [1280,390]) {await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new Error('Denied'))}}));
  await page.click('#shareComparison');assert.equal(await page.locator('#shareLink').isVisible(),true);
  await page.goto(base+'/#v=1&assets=BBCA,UNKNOWN&start=bad&end=bad&ref=constructor&view=bad&result=bad&lang=bad');
  await page.waitForFunction(()=>state.selectedSeries.size===1);assert.equal(await page.locator('#chart polyline').count(),1);
  assert.equal(await page.locator('#benchmarkSelect').inputValue(),'IDR');
  assert.deepEqual(errors,[]);
  console.log('PASS: inflation, drawdown, share round-trip, localization, disabled states, reset, clipboard fallback, malformed link and responsive layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

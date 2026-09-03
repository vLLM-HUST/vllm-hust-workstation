// Playwright CLI run-code consumes this file as a function expression.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const base=page.url().split('/').slice(0,3).join('/');
  const prefix=base.includes('127.0.0.1')?'candidate':'after';
  const out='output/playwright/audit-20260903/';
  const results=[];
  await page.setViewportSize({width:390,height:844});
  for(const theme of ['light','dark']) {
    await page.unrouteAll({behavior:'ignoreErrors'});
    await page.route('**/api/**',r=>['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
    await page.goto(base);
    await page.getByRole('heading',{name:'推理工作区已就绪'}).waitFor();
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.getByRole('button',{name:/切换到.*主题/}).click();
    await page.getByRole('button',{name:theme==='light'?'切换到深色主题':'切换到浅色主题'}).waitFor();
    await page.waitForFunction(expected=>document.documentElement.dataset.theme===expected,theme);
    await page.route('**/api/hub/catalog',r=>r.fulfill({json:{catalog:[],modelsDir:'/audit/empty'}}));
    await page.getByRole('button',{name:'打开模型库',exact:true}).click();
    await page.getByRole('status').filter({hasText:'模型目录为空'}).waitFor();
    await page.screenshot({path:out+prefix+'-'+theme+'-empty.png'});
    await page.keyboard.press('Escape');
    await page.route('**/api/hub/catalog',r=>r.fulfill({status:503,body:'Audit: upstream unavailable'}));
    await page.getByRole('button',{name:'打开模型库',exact:true}).click();
    await page.getByText('HTTP 503',{exact:true}).waitFor();
    await page.screenshot({path:out+prefix+'-'+theme+'-catalog-error.png'});
    await page.keyboard.press('Escape');
    let finish;let intercepted=0;
    await page.route('**/api/chat',async r=>{intercepted++;await new Promise(resolve=>finish=resolve);await r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Audit-only unavailable'})});});
    await page.getByRole('textbox',{name:'输入消息…'}).fill('UI regression — intercepted, never sent to inference');
    await page.getByRole('button',{name:'发送消息',exact:true}).click();
    await page.getByRole('button',{name:'停止生成',exact:true}).waitFor();
    await page.screenshot({path:out+prefix+'-'+theme+'-loading.png'});
    if(!finish)throw new Error('chat interception missing');finish();
    await page.getByRole('button',{name:'发送消息',exact:true}).waitFor();
    await page.screenshot({path:out+prefix+'-'+theme+'-chat-error.png'});
    await page.route('**/api/models',r=>r.fulfill({json:{models:[],upstreamAvailable:false,liveModelSwitchSupported:false}}));
    await page.route('**/api/metrics',r=>r.fulfill({json:{gatewayAvailable:false,tokensPerSecond:0,pendingRequests:0,gpuUtilPct:0,gpuMemUsedGb:0,gpuMemTotalGb:0,uptimeSeconds:0,totalRequestsServed:0,avgLatencyMs:0,modelName:'unavailable',backendType:'unavailable'}}));
    await page.route('**/api/local-service',r=>r.abort());
    await page.route('**/api/versions',r=>r.fulfill({json:{available:false,source:'unavailable',reason:'测试凭据已过期；不代表当前运行状态',vllmHust:'unavailable',vllmAscendHust:'unavailable'}}));
    await page.reload();
    await page.getByRole('contentinfo').getByText('测试凭据已过期；不代表当前运行状态',{exact:false}).waitFor();
    await page.getByRole('button',{name:theme==='light'?'切换到深色主题':'切换到浅色主题'}).waitFor();
    await page.screenshot({path:out+prefix+'-'+theme+'-offline-stale.png'});
    results.push({theme,actualTheme:await page.evaluate(()=>document.documentElement.dataset.theme),intercepted,offline:await page.getByLabel('推理服务离线').count(),scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});
  }
  await page.unrouteAll({behavior:'ignoreErrors'});
  await page.goto(base);
  return {syntheticBrowserFixtures:true,inferenceRequestsForwarded:0,results};
}

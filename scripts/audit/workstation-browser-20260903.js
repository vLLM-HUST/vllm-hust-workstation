// Playwright CLI run-code consumes this file as a function expression.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const base = page.url().split('/').slice(0,3).join('/');
  const prefix = base.includes('127.0.0.1') ? 'candidate' : 'after';
  const output = 'output/playwright/audit-20260903/';
  const checks = [];
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.route('**/api/**', route => ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  const capture = async (name) => {
    await page.screenshot({path: output + prefix + '-' + name + '.png',animations:'disabled'});
    const state = await page.evaluate(() => {
      const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]');
      const dialog = document.querySelector('[role="dialog"]');
      const root = dialog || document;
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      const color = value => {ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);const p=[...ctx.getImageData(0,0,1,1).data];return [...p.slice(0,3),p[3]/255];};
      const over = (a,b) => [...[0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])),1];
      const lum = c => c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
      const items=[...root.querySelectorAll('p,span,h1,h2,h3,button,svg,select,input,textarea,summary,a')].filter(visible).filter(el=>el.tagName==='svg'||el.textContent.trim()||el.getAttribute('aria-label')).map(el=>{
        const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
        const bg=chain.reduce((b,p)=>over(color(getComputedStyle(p).backgroundColor),b),[255,255,255,1]);
        const s=getComputedStyle(el),r=el.getBoundingClientRect();
        const uncertain=chain.some(p=>getComputedStyle(p).backgroundImage!=='none'||getComputedStyle(p).opacity!=='1');
        return {tag:el.tagName,label:(el.getAttribute('aria-label')||el.textContent).trim().slice(0,70),foreground:s.color,background:bg.slice(0,3),ratio:+ratio(over(color(s.color),bg),bg).toFixed(2),gradientOrGroupOpacity:uncertain,disabled:el.disabled===true,inViewport:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth,bounds:{x:r.x,y:r.y,width:r.width,height:r.height},outline:s.outline,border:s.borderColor};
      });
      return {theme:document.documentElement.dataset.theme,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dialogWidth:dialog?.scrollWidth,dialogClient:dialog?.clientWidth,focus:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,40),items};
    });
    checks.push({name,...state});
    if (state.scrollWidth > state.width) throw new Error('horizontal overflow: '+name);
  };
  for (const [width,height,size] of [[1440,1000,'desktop'],[390,844,'mobile']]) {
    await page.setViewportSize({width,height});
    for (const theme of ['light','dark']) {
      await page.goto(base);
      await page.getByRole('button',{name:/切换到.*主题/}).waitFor();
      if (await page.evaluate(()=>document.documentElement.dataset.theme)!==theme) {
        await page.getByRole('button',{name:/切换到.*主题/}).focus();
        await page.keyboard.press('Enter');
      }
      await page.reload();
      await page.getByRole('heading',{name:'推理工作区已就绪'}).waitFor();
      await page.getByText('8× 910B2',{exact:true}).first().waitFor();
      await page.locator('aside[aria-label="运行状态"]').getByText('服务在线',{exact:true}).waitFor({state:'attached'});
      if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)throw new Error('theme did not persist');
      await page.getByRole('contentinfo').getByRole('link',{name:/^core/}).waitFor();
      await capture(size+'-'+theme);
      await page.getByRole('button',{name:'打开模型库',exact:true}).click();
      await page.getByRole('heading',{name:'Qwen 3 32B',exact:true}).waitFor();
      for(let i=0;i<12;i++)await page.keyboard.press('Tab');
      if(!await page.evaluate(()=>document.querySelector('[role="dialog"]').contains(document.activeElement)))throw new Error('model focus escaped');
      await capture(size+'-'+theme+'-models');
      await page.keyboard.press('Escape');
      if(await page.getByRole('dialog').count())throw new Error('Escape did not close');
      if(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label'))!=='打开模型库')throw new Error('focus not restored');
      await page.getByRole('button',{name:'打开 EvoScientist 任务与日志',exact:true}).click();
      await page.getByRole('button',{name:'启动研究任务',exact:true}).waitFor();
      await page.getByText('实际模型：zai-org/GLM-4-32B-0414',{exact:true}).waitFor();
      await capture(size+'-'+theme+'-tasks');
      await page.keyboard.press('Escape');
      if(size==='mobile') {
        await page.getByRole('button',{name:'打开运行状态',exact:true}).click();
        await capture(size+'-'+theme+'-monitor');
        await page.keyboard.press('Escape');
      }
      await page.locator('footer summary').click();
      await capture(size+'-'+theme+'-provenance');
      await page.locator('footer details > div').evaluate(el=>el.scrollTop=el.scrollHeight);
      await capture(size+'-'+theme+'-provenance-bottom');
    }
  }
  return {base,errors,checks};
}

// Playwright CLI run-code consumes this file as a function expression.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const base = page.url().split('/').slice(0, 3).join('/');
  const checks = [];
  const errors = [];
  let forwardedMutations = 0;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => {
    if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
    forwardedMutations++;
    return route.abort();
  });
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({width, height});
    for (const theme of ['light', 'dark']) {
      await page.goto(base);
      await page.getByRole('button', {name: /切换到.*主题/}).waitFor();
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.getByRole('button', {name: /切换到.*主题/}).click();
      await page.getByRole('button', {name: '打开模型库', exact: true}).click();
      await page.getByRole('heading', {name: 'Qwen 3 32B', exact: true}).waitFor();
      const dialog = page.getByRole('dialog', {name: '模型库', exact: true});
      if (/\/home\/|\/data\/|保存目录|设为当前/.test(await dialog.innerText())) throw new Error('Public path/activation leak');
      if (await dialog.getByRole('button', {name: /下载权重|取消/}).count()) throw new Error('Public mutation control');
      await dialog.getByRole('button', {name: '刷新列表', exact: true}).click();
      await dialog.getByRole('button', {name: '管理员登录', exact: true}).click();
      await dialog.getByLabel('管理员令牌', {exact: true}).fill('invalid-browser-fixture');
      await dialog.getByRole('button', {name: '验证令牌', exact: true}).click();
      await dialog.getByText('管理员令牌无效或已失效。', {exact: true}).waitFor();
      await page.screenshot({path: `output/playwright/model-hub-fix/${width}-${theme}-public.png`});
      const layout = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth}));
      if (layout.scrollWidth > width) throw new Error('Public horizontal overflow');
      await page.keyboard.press('Escape');
      if (await page.getByRole('dialog').count()) throw new Error('Escape failed');
      checks.push({width, theme, public: 'passed'});
    }
  }
  // Explicit browser-only administrator fixtures. No real token is used and
  // every download/cancel request is fulfilled here, never sent to the server.
  const catalogResponse = await page.request.get(base + '/api/hub/catalog');
  const original = await catalogResponse.json();
  let fixtureDownloading = false;
  const mockMethods = [];
  await page.route('**/api/hub/**', async route => {
    const request = route.request();
    if (request.method() !== 'GET') {
      if (!request.url().includes('/download/')) throw new Error('Unexpected fixture mutation');
      mockMethods.push(request.method());
      fixtureDownloading = request.method() === 'POST';
      return route.fulfill({status: 200, json: {ok: true, message: '浏览器模拟下载，未提交到服务端'}});
    }
    const administrator = request.headers()['x-workstation-admin-token'] === 'browser-fixture-token';
    const payload = {...original, permissions: {administrator, canDownload: administrator, canActivate: false}, storage: administrator ? {configured: true, available: true, path: '/data/fixture/models', freeBytes: 500e9, message: '浏览器模拟存储'} : original.storage};
    payload.catalog = original.catalog.map((item, i) => ({...item, download: {status: i === 0 && fixtureDownloading ? 'downloading' : 'idle', pct: 0}}));
    await route.fulfill({status: 200, json: payload});
  });
  await page.setViewportSize({width: 390, height: 844});
  for (const theme of ['light', 'dark']) {
    await page.goto(base);
    await page.getByRole('button', {name: /切换到.*主题/}).waitFor();
    if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.getByRole('button', {name: /切换到.*主题/}).click();
    await page.getByRole('button', {name: '打开模型库', exact: true}).click();
    await page.getByRole('button', {name: '管理员登录', exact: true}).click();
    await page.getByLabel('管理员令牌', {exact: true}).fill('browser-fixture-token');
    await page.getByRole('button', {name: '验证令牌', exact: true}).click();
    await page.getByText('模型存储：/data/fixture/models', {exact: true}).waitFor();
    await page.getByRole('button', {name: '下载权重', exact: true}).first().click();
    await page.getByRole('button', {name: '取消', exact: true}).click();
    await page.getByRole('button', {name: '下载权重', exact: true}).first().waitFor();
    await page.screenshot({path: `output/playwright/model-hub-fix/390-${theme}-admin-fixture.png`});
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Admin horizontal overflow');
    await page.keyboard.press('Escape');
    await page.getByRole('button', {name: '打开模型库', exact: true}).click();
    await page.getByText('只读浏览', {exact: true}).waitFor();
    if ((await page.getByRole('dialog').innerText()).includes('/data/fixture')) throw new Error('Credential survived close');
    await page.keyboard.press('Escape');
    checks.push({width: 390, theme, administratorFixture: 'passed'});
  }
  if (errors.length || forwardedMutations) throw new Error(JSON.stringify({errors, forwardedMutations}));
  return {checks, mockMethods, errors, forwardedMutations};
}

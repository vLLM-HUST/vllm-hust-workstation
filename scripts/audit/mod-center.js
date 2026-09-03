// Playwright CLI run-code function. Fixture mutations never reach the backend.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const base = page.url().split('/').slice(0, 3).join('/');
  const original = await (await page.request.get(base + '/api/mods')).json();
  const errors = [];
  const checks = [];
  const actions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    for (const theme of ['light', 'dark']) {
      await page.goto(base + '/mods');
      await page.getByRole('heading', {name: 'BidKV', exact: true}).waitFor();
      if (await page.getByRole('region', {name: '运行边界', exact: true}).count()) throw new Error('Internal implementation banner visible');
      if (/目标绑定、兼容性验收与重启审批|Sage Mate|Extension Manager 0\.2/.test(await page.locator('main').innerText())) throw new Error('Internal implementation copy visible');
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.getByRole('button', {name: /切换到.*主题/}).click();
      if (await page.getByRole('button', {name: '安装到 Mod 库', exact: true}).count()) throw new Error('Public mutation visible');
      await page.getByRole('combobox', {name: '筛选 Mod', exact: true}).selectOption('installed');
      await page.getByText('Mod 库中还没有已安装的扩展。', {exact: true}).waitFor();
      await page.getByRole('combobox', {name: '筛选 Mod', exact: true}).selectOption('all');
      await page.getByLabel('搜索 Mod', {exact: true}).fill('DiffSpec');
      if (await page.locator('article').count() !== 1) throw new Error('Search filter');
      await page.getByLabel('搜索 Mod', {exact: true}).fill('');
      await page.screenshot({path: `output/playwright/mod-center/${width}-${theme}-public.png`, fullPage: true});
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Overflow');
      const contrast = await page.evaluate(() => {
        const luminance = value => {
          const channels = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
          return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
        };
        const card = document.querySelector('article');
        const bg = luminance(getComputedStyle(card).backgroundColor);
        const ratio = element => {const fg = luminance(getComputedStyle(element).color); return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05);};
        return {primary: ratio(card.querySelector('h2')), secondary: ratio(card.querySelector('.app-text-secondary')), muted: ratio(card.querySelector('.app-text-muted'))};
      });
      if (Object.values(contrast).some(value => value < 4.5)) throw new Error('Text contrast failure');
      await page.getByRole('button', {name: '管理员登录', exact: true}).click();
      await page.getByLabel('管理员密码', {exact: true}).fill('invalid-fixture-password');
      await page.getByRole('button', {name: '进入管理员模式', exact: true}).click();
      await page.getByRole('alert').filter({hasText: '管理员密码无效'}).waitFor();
      checks.push({width, theme, public: 'passed', contrast});
    }
  }
  let state = {installed: false, configured: false, enabled: false};
  await page.route('**/api/mods', async route => {
    const request = route.request();
    const administrator = request.headers()['x-workstation-admin-token'] === 'browser-fixture';
    if (request.method() === 'POST') {
      if (!administrator) throw new Error('Missing admin header');
      const {action} = request.postDataJSON(); actions.push(action);
      if (action === 'install') state = {...state, installed: true, version: 'fixture'};
      if (action === 'configure') state.configured = true;
      if (action === 'enable') state.enabled = true;
      if (action === 'disable') state.enabled = false;
      if (action === 'uninstall') state = {installed: false, configured: false, enabled: false};
      return route.fulfill({status: 202, json: {id: 'fixture', status: 'queued'}});
    }
    return route.fulfill({json: {...original, administrator, storageReady: true, catalog: original.catalog.map((mod, index) => index === 0 ? {...mod, state} : mod), tasks: []}});
  });
  for (const theme of ['light', 'dark']) {
    await page.goto(base + '/mods');
    await page.getByRole('heading', {name: 'BidKV', exact: true}).waitFor();
    if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.getByRole('button', {name: /切换到.*主题/}).click();
    await page.getByRole('button', {name: '管理员登录', exact: true}).click();
    await page.getByLabel('管理员密码', {exact: true}).fill('browser-fixture');
    await page.getByRole('button', {name: '进入管理员模式', exact: true}).click();
    const card = page.locator('article').filter({has: page.getByRole('heading', {name: 'BidKV', exact: true})});
    await card.getByRole('button', {name: '安装到 Mod 库', exact: true}).click();
    await page.getByRole('dialog', {name: '操作确认'}).waitFor();
    await page.keyboard.press('Escape');
    if (await page.getByRole('dialog').count()) throw new Error('Escape failed');
    for (const label of ['安装到 Mod 库', '保存配置', '启用意图', '停用意图', '卸载']) {
      if (label === '保存配置') await card.locator('summary').click();
      await card.getByRole('button', {name: label, exact: true}).click();
      await page.getByRole('dialog').getByRole('button', {name: '确认操作', exact: true}).click();
      await page.getByRole('dialog').waitFor({state: 'detached'});
    }
    if (!await card.getByRole('button', {name: '运行 · 暂未开放', exact: true}).isDisabled()) throw new Error('Unsafe run');
    await page.screenshot({path: `output/playwright/mod-center/390-${theme}-admin-fixture.png`, fullPage: true});
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Admin overflow');
    await page.reload();
    await page.getByText('只读浏览', {exact: true}).waitFor();
    checks.push({theme, adminFixture: 'passed'});
  }
  await page.route('**/api/mods', route => route.fulfill({status: 503, json: {error: '验收模拟：服务暂不可用'}}));
  await page.getByRole('button', {name: '刷新', exact: true}).click();
  await page.getByRole('alert').filter({hasText: '验收模拟'}).waitFor();
  if (await page.locator('article').count()) throw new Error('Stale actions after failure');
  await page.screenshot({path: 'output/playwright/mod-center/error-fixture.png'});
  if (errors.length) throw new Error(JSON.stringify(errors));
  return {checks, actions, errors, runtime: 'not exercised; disabled gate checked'};
}

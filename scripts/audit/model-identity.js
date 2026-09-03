// Playwright CLI read-only browser regression. No inference requests or mutations.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  await page.unrouteAll({behavior: 'wait'});
  const base = page.url().split('/').slice(0, 3).join('/');
  const site = base.includes('127.0.0.1') ? 'local' : 'public';
  const modelResponse = await page.request.get(base + '/api/models');
  const metricsResponse = await page.request.get(base + '/api/metrics');
  const models = await modelResponse.json();
  const metrics = await metricsResponse.json();
  const expected = models.data.map(item => item.id).join(' · ');
  if (!models.engineReady || metrics.modelName !== expected) throw new Error('Live model identity differs between APIs');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  const checks = [];
  for (const width of [1440, 390]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : 1000});
    for (const theme of ['light', 'dark']) {
      await page.goto(base);
      const label = page.locator('aside').getByText('模型', {exact: true}).locator('..').locator('span').last();
      await label.filter({hasText: expected}).waitFor({state: 'attached'});
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== theme) await page.getByRole('button', {name: /切换到.*主题/}).click();
      if (width === 390) await page.getByRole('button', {name: /查看模型、监控与运行来源/}).click();
      await label.scrollIntoViewIfNeeded();
      const styles = await label.evaluate(element => {
        const style = getComputedStyle(element);
        return {text: element.textContent, title: element.title, whiteSpace: style.whiteSpace, textOverflow: style.textOverflow, clipped: element.scrollWidth > element.clientWidth};
      });
      if (styles.text !== expected || styles.title !== expected || styles.clipped || styles.whiteSpace === 'nowrap') throw new Error('Model label is stale or truncated');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Horizontal overflow');
      await page.screenshot({path: `output/playwright/model-sidebar-${site}-${width}-${theme}.png`});
      checks.push({width, theme, ...styles});
    }
  }
  await page.route('**/api/metrics', route => route.fulfill({json: {...metrics, modelName: '未核验', gatewayAvailable: false}}));
  await page.locator('aside').getByText('模型', {exact: true}).locator('..').getByText('未核验', {exact: true}).waitFor({timeout: 15000});
  if (errors.length) throw new Error(errors.join('; '));
  return {site, expected, checks, unknownFixture: 'passed', errors};
}

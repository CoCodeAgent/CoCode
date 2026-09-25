import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

// 仅测试本地隔离 Worker；请求由 Playwright 转发，绝不修改线上数据。
const workerBase = process.env.POLL_TEST_BASE || 'http://127.0.0.1:8792';
const createdTitles = [];
const siteRoot = resolve('website');
const site = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const filepath = resolve(siteRoot, '.' + (pathname === '/' ? '/admin.html' : pathname));
  if (!filepath.startsWith(siteRoot + '/')) { response.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(filepath);
    response.writeHead(200, { 'content-type': filepath.endsWith('.js') ? 'application/javascript' : 'text/html' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolveListening => site.listen(0, '127.0.0.1', resolveListening));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let simulateInitialPages = true;
  let failNextPollLoad = false;
  let failNextSettingsSave = false;
  let initialAdminPolls;
  await page.route('https://cocode.ohfun.online/**', async route => {
    const source = route.request();
    const url = new URL(source.url());
    if (url.pathname === '/admin/polls/settings' && source.method() === 'PATCH' && failNextSettingsSave) {
      failNextSettingsSave = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '模拟设置保存失败' }), headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    if (url.pathname === '/admin/polls' && source.method() === 'GET') {
      const fulfill = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
      if (failNextPollLoad) {
        failNextPollLoad = false;
        await new Promise(resolve => setTimeout(resolve, 450));
        await fulfill(503, { detail: '模拟管理端投票加载失败' });
        return;
      }
      if (simulateInitialPages) {
        if (!initialAdminPolls) {
          const response = await fetch(workerBase + '/admin/polls', { headers: source.headers() });
          initialAdminPolls = (await response.json()).polls;
        }
        if (url.searchParams.get('offset') === '0') { await fulfill(200, { polls: initialAdminPolls.slice(0, 1), nextOffset: 300 }); return; }
        if (url.searchParams.get('offset') === '300') {
          await new Promise(resolve => setTimeout(resolve, 1400));
          simulateInitialPages = false;
          await fulfill(200, { polls: initialAdminPolls.slice(1), nextOffset: null });
          return;
        }
      }
    }
    const response = await fetch(workerBase + url.pathname + url.search, {
      method: source.method(), headers: source.headers(),
      ...(source.postDataBuffer() ? { body: source.postDataBuffer() } : {}),
    });
    await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', body: Buffer.from(await response.arrayBuffer()), headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto(`http://127.0.0.1:${site.address().port}/admin.html`);
  const secondPageRequest = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/admin/polls' && url.searchParams.get('offset') === '300';
  });
  await page.locator('#key').fill('local-test-admin');
  await page.locator('#loginForm button').click();
  await secondPageRequest;
  await page.locator('#pollList').getByText('正在加载投票中').waitFor();
  assert.equal(await page.locator('#pollList .poll-item').count(), 0);
  await page.locator('#pollList').getByText('正在加载投票中').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#pollsAdmin').isVisible(), true, JSON.stringify({ status: await page.locator('#status').textContent(), errors }));
  assert.equal(await page.locator('#pollEntryVisible').isChecked(), true);
  await page.locator('#pollEntryVisible').uncheck();
  failNextSettingsSave = true;
  await page.locator('#savePollSettings').click();
  await page.locator('#pollSettingsStatus').getByText('保存失败：模拟设置保存失败').waitFor();
  assert.equal(await page.locator('#pollEntryVisible').isChecked(), false);
  assert.equal(await page.locator('#savePollSettings').isEnabled(), true);
  await page.locator('#savePollSettings').click();
  await page.locator('#pollSettingsStatus').getByText('已保存：用户端投票入口已隐藏').waitFor();
  assert.equal((await (await fetch(workerBase + '/polls/config', { headers: { authorization: 'Bearer local-user-one' } })).json()).entryVisible, false);
  await page.locator('#pollEntryVisible').check();
  await page.locator('#savePollSettings').click();
  await page.locator('#pollSettingsStatus').getByText('已保存：用户端投票入口已显示').waitFor();
  await page.locator('#pollEditorTitle').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#pollOptions > *').count(), 2);
  assert.equal(await page.locator('#users').getByText('ID 900001').count(), 1);
  failNextPollLoad = true;
  await page.locator('#loadPolls').click();
  await page.locator('#pollList').getByText('正在加载投票中').waitFor();
  assert.equal(await page.locator('#pollList .poll-item').count(), 0);
  await page.locator('#pollList').getByRole('button', { name: '重试' }).click();
  await page.locator('#pollList').getByText('正在加载投票中').waitFor({ state: 'hidden' });
  await page.locator('#toggleBulkOptions').click();
  assert.equal(await page.locator('#toggleBulkOptions').getAttribute('aria-expanded'), 'true');
  await page.locator('#pollBulkInput').fill('支持\t支持说明\n反对\n\n弃权');
  await page.locator('#applyBulkOptions').click();
  assert.equal(await page.locator('#pollOptions .option-row').count(), 3);
  assert.deepEqual(await page.locator('#pollOptions .option-row > input:first-child').evaluateAll(inputs => inputs.map(input => input.value)), ['支持', '反对', '弃权']);
  assert.equal(await page.locator('#pollOptions .option-row').first().locator('input').nth(1).inputValue(), '支持说明');
  await page.locator('#pollBulkInput').fill('支持\n新选项');
  await page.locator('#applyBulkOptions').click();
  await page.locator('#pollBulkStatus').getByText('第 1 行的「支持」与已有选项重复').waitFor();
  assert.equal(await page.locator('#pollOptions .option-row').count(), 3);
  await page.locator('#pollBulkInput').fill(Array.from({ length: 18 }, (_, index) => '超限选项 ' + index).join('\n'));
  await page.locator('#applyBulkOptions').click();
  await page.locator('#pollBulkStatus').getByText('每个投票最多 20 个选项，请减少本次添加数量').waitFor();
  assert.equal(await page.locator('#pollOptions .option-row').count(), 3);
  await page.locator('#pollBulkInput').fill('新增选项');
  await page.locator('#applyBulkOptions').click();
  assert.equal(await page.locator('#pollOptions .option-row').count(), 4);
  await page.locator('#cancelBulkOptions').click();
  assert.equal(await page.locator('#toggleBulkOptions').getAttribute('aria-expanded'), 'false');
  const title = '管理页发布验证 ' + crypto.randomUUID().slice(0, 8);
  createdTitles.push(title);
  await page.locator('#pollTitle').fill(title);
  await page.locator('#publishPoll').click();
  await page.getByRole('status').getByText('投票已发布').waitFor();
  assert.equal(await page.locator('#pollList').getByText(title).count(), 1);
  await page.locator('#pollList .poll-item').filter({ hasText: title }).getByRole('button', { name: '编辑' }).click();
  await page.locator('#pollEditorTitle').getByText('编辑：'+title).waitFor();
  assert.equal(await page.locator('#pollOptions .option-row').count(), 4);
  assert.equal(await page.locator('#pollOptions .option-row').first().locator('input').nth(1).inputValue(), '支持说明');
  assert.equal(await page.locator('#toggleBulkOptions').isDisabled(), true);
  await page.locator('#resetPollEditor').click();
  const draftTitle = '草稿发布验证 ' + crypto.randomUUID().slice(0, 8);
  createdTitles.push(draftTitle);
  await page.locator('#pollTitle').fill(draftTitle);
  await page.locator('#pollOptions .option-row').nth(0).locator('input').first().fill('同意');
  await page.locator('#pollOptions .option-row').nth(1).locator('input').first().fill('不同意');
  await page.locator('#savePollDraft').click();
  await page.getByRole('status').getByText('投票已保存').waitFor();
  const draftRow = page.locator('#pollList .poll-item').filter({ hasText: draftTitle });
  await draftRow.getByRole('button', { name: '编辑' }).click();
  await page.locator('#publishPoll').click();
  await page.getByRole('status').getByText('投票已发布').waitFor();
  await draftRow.getByRole('button', { name: '下架' }).waitFor();
  assert.match(await draftRow.textContent(), /未开始|进行中/);
  const keyboardTitle = '回车发布验证 ' + crypto.randomUUID().slice(0, 8);
  createdTitles.push(keyboardTitle);
  await page.locator('#pollTitle').fill(keyboardTitle);
  await page.locator('#pollOptions .option-row').nth(0).locator('input').first().fill('甲');
  await page.locator('#pollOptions .option-row').nth(1).locator('input').first().fill('乙');
  await page.locator('#pollTitle').press('Enter');
  await page.locator('#pollList .poll-item').filter({ hasText: keyboardTitle }).getByRole('button', { name: '下架' }).waitFor();
  await page.locator('#publishPoll').click();
  await page.waitForFunction(() => document.getElementById('pollFormStatus')?.textContent?.includes('请填写投票标题'));
  await page.locator('#pollTitle').fill('缺少选项验证');
  await page.locator('#publishPoll').click();
  await page.waitForFunction(() => document.getElementById('pollFormStatus')?.textContent?.includes('发布前请填写至少两个不同的选项名称'));
  const countdownTitle = '管理端倒计时验证 ' + crypto.randomUUID().slice(0, 8);
  createdTitles.push(countdownTitle);
  const countdownResponse = await fetch(workerBase + '/admin/polls', {
    method: 'POST', headers: { authorization: 'Bearer local-test-admin', 'content-type': 'application/json' },
    body: JSON.stringify({
      title: countdownTitle, startAt: new Date(Date.now() + 8000).toISOString(), endAt: new Date(Date.now() + 3600000).toISOString(),
      type: 'single', maxSelections: 1, audience: 'all', frequency: 'once', resultVisibility: 'live',
      showVoterCount: true, showDetails: true, options: [{ label: '是' }, { label: '否' }], publish: true,
    }),
  });
  assert.equal(countdownResponse.status, 201);
  await page.locator('#loadPolls').click();
  const countdownRow = page.locator('#pollList .poll-item').filter({ hasText: countdownTitle });
  await countdownRow.getByRole('timer').waitFor();
  assert.match(await countdownRow.getByRole('timer').textContent(), /^距开始 \d\d:\d\d:\d\d$/);
  await countdownRow.getByText('进行中').waitFor({ timeout: 20000 });
  assert.equal(await countdownRow.getByRole('timer').count(), 0);
  assert.deepEqual(errors.filter(message => !message.includes('503 (Service Unavailable)')), []);
  await page.screenshot({ path: '/private/tmp/cocode-polls-admin-ui.png', fullPage: true });
  console.log('通过：分页加载期间仅显示提示、失败可重试、批量添加、倒计时与投票发布回归。');
} finally {
  try { await fetch(workerBase + '/admin/polls/settings', { method: 'PATCH', headers: { authorization: 'Bearer local-test-admin', 'content-type': 'application/json' }, body: JSON.stringify({ entryVisible: true }) }); } catch { /* 本地服务已关闭时跳过 */ }
  for (const title of createdTitles) {
    try {
      const response = await fetch(workerBase + '/admin/polls?q=' + encodeURIComponent(title), { headers: { authorization: 'Bearer local-test-admin' } });
      if (!response.ok) continue;
      const data = await response.json();
      for (const poll of data.polls || []) if (poll.title === title) await fetch(workerBase + '/admin/polls/' + poll.id, { method: 'DELETE', headers: { authorization: 'Bearer local-test-admin' } });
    } catch { /* 隔离测试服务关闭时跳过清理；不触及线上。 */ }
  }
  await browser.close();
  site.close();
}

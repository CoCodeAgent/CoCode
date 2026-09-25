import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';

// 只连接本地 Wrangler fixture；finally 确保测试账户恢复为未封禁。
const workerBase = process.env.ADMIN_TEST_BASE || 'http://127.0.0.1:8792';
const siteRoot = resolve('website');
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  const filepath = resolve(siteRoot, '.' + (pathname === '/' ? '/admin.html' : pathname));
  if (!filepath.startsWith(siteRoot + '/')) { response.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(filepath);
    response.writeHead(200, { 'content-type': filepath.endsWith('.js') ? 'application/javascript' : 'text/html' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 820 }, colorScheme: 'dark' });
  const errors = [];
  let failBanOnce = true;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://cocode.ohfun.online/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (failBanOnce && url.pathname === '/admin/users/900001/ban' && request.method() === 'POST') {
      failBanOnce = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '模拟服务暂时不可用' }), headers: { 'access-control-allow-origin': '*' } });
      return;
    }
    const response = await fetch(workerBase + url.pathname + url.search, {
      method: request.method(), headers: request.headers(),
      ...(request.postDataBuffer() ? { body: request.postDataBuffer() } : {}),
    });
    await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/json', body: Buffer.from(await response.arrayBuffer()), headers: { 'access-control-allow-origin': '*' } });
  });
  const account = async () => {
    const response = await fetch(workerBase + '/auth/me', { headers: { authorization: 'Bearer local-user-one' } });
    assert.equal(response.status, 200);
    return response.json();
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
  await page.locator('#key').fill('local-test-admin');
  await page.locator('#loginForm button').click();
  const row = page.locator('#users tr').filter({ hasText: 'ID 900001' });
  await row.getByRole('button', { name: '封禁' }).click();
  const dialog = page.getByRole('dialog', { name: '封禁账户' });
  await dialog.waitFor();
  await dialog.locator('#banReason').fill('本地界面测试');
  await dialog.getByRole('button', { name: '确认封禁' }).click();
  await dialog.getByRole('alert').getByText('模拟服务暂时不可用').waitFor();
  assert.equal((await account()).banned, false);
  await dialog.getByRole('button', { name: '确认封禁' }).click();
  await row.getByText('已封禁').waitFor();
  assert.equal((await account()).banned, true);
  await row.getByRole('button', { name: '解封' }).click();
  const unbanDialog = page.getByRole('dialog', { name: '解除封禁' });
  await unbanDialog.getByRole('button', { name: '确认解封' }).click();
  await row.getByText('正常').waitFor();
  assert.equal((await account()).banned, false);
  assert.deepEqual(errors, []);
  console.log('通过：页面内封禁/解封确认、Worker 状态变更、账户状态即时生效。');
} finally {
  await fetch(workerBase + '/admin/users/900001/ban', {
    method: 'POST', headers: { authorization: 'Bearer local-test-admin', 'content-type': 'application/json' },
    body: JSON.stringify({ banned: false }),
  }).catch(() => {});
  await browser.close();
  server.close();
}

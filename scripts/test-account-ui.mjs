// 配合隔离的 Wrangler 本地测试服务（8791）与 admin-fixture.sql 运行。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
process.env.COCODE_HOME = mkdtempSync(join(tmpdir(), 'cocode-account-ui-'));
const { startASAPIServer, setDesktopAccessBlocked } = await import('../packages/core/src/asapi/server.js');
const server = await startASAPIServer({ port: 0 });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [];
const admin = async (path, body) => {
  const response = await fetch('http://127.0.0.1:8791' + path, { method: 'POST', headers: { authorization: 'Bearer local-test-admin', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); return response.json();
};
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN' });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ base }) => {
    localStorage.setItem('server_url', base);
    localStorage.setItem('username', 'cocode');
    localStorage.setItem('cocode_auth_api', 'http://127.0.0.1:8791');
    localStorage.setItem('cocode_auth_token', 'local-user-one');
    localStorage.setItem('cocode_auth_username', '管理测试一');
    localStorage.setItem('cocode_cn_notice_agreed_v1', '1');
    localStorage.setItem('cocode_language_preference', 'zh');
  }, { base });
  await page.goto(base);
  await page.locator('textarea:visible').first().waitFor();
  const stamp = '界面测试 ' + Date.now();
  await admin('/admin/messages', { userId: 900001, title: stamp, body: '这是一条消息。\n<script>alert(1)</script>' });
  await page.getByRole('button', { name: /管理测试一/ }).click();
  await page.getByRole('menuitem', { name: /消息/ }).click();
  await page.getByRole('button', { name: new RegExp(stamp) }).click();
  await page.getByRole('heading', { name: stamp }).waitFor();
  assert.ok(await page.getByText('<script>alert(1)</script>', { exact: false }).isVisible());
  await page.screenshot({ path: '/private/tmp/cocode-messages-ui.png' });
  console.log('通过：账户菜单、消息列表、正文、安全文本渲染');
  await page.keyboard.press('Escape');
  const banStart = Date.now();
  await admin('/admin/users/900001/ban', { banned: true, reason: '界面封禁测试' });
  await page.getByRole('heading', { name: '账户已被封禁' }).waitFor({ timeout: 4000 });
  assert.equal(await page.locator('textarea').count(), 0);
  console.log('通过：封禁工作区，耗时 ' + (Date.now() - banStart) + ' ms');
  await admin('/admin/users/900001/ban', { banned: false });
  await page.locator('textarea:visible').first().waitFor({ timeout: 4000 });
  console.log('通过：实时解封恢复工作区');

  const panel = await browser.newPage();
  panel.on('pageerror', e => errors.push(e.message));
  // 页面来自 Pages，接口仍指向 Worker；本地测试只代理到隔离数据库。
  await panel.route('https://ohfun.online/admin', route => route.fulfill({ contentType: 'text/html', body: readFileSync(new URL('../website/admin.html', import.meta.url), 'utf8') }));
  await panel.route('https://ohfun.online/admin.js', route => route.fulfill({ contentType: 'application/javascript', body: readFileSync(new URL('../website/admin.js', import.meta.url), 'utf8') }));
  await panel.route('https://cocode.ohfun.online/admin/**', async route => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: 'http://127.0.0.1:8791' + url.pathname + url.search });
    await route.fulfill({ response });
  });
  await panel.goto('https://ohfun.online/admin');
  await panel.getByPlaceholder('管理密钥').fill('local-test-admin');
  await panel.getByRole('button', { name: '进入后台' }).click();
  await panel.getByPlaceholder('搜索用户名或邮箱').fill('管理测试一');
  await panel.getByRole('button', { name: '搜索', exact: true }).click();
  await panel.getByRole('button', { name: '发消息', exact: true }).first().click();
  await panel.getByLabel('标题', { exact: true }).fill('后台界面发送');
  await panel.getByLabel('正文', { exact: true }).fill('来自管理后台的消息');
  await panel.getByRole('button', { name: '发送消息', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: /已发送给 1 个账户/ }).waitFor();
  await panel.screenshot({ path: '/private/tmp/cocode-admin-ui.png' });
  console.log('通过：真实管理页面登录、搜索、发送');

  const update = await browser.newPage({ locale: 'zh-CN' });
  await update.addInitScript(() => {
    localStorage.setItem('cocode_language_preference', 'zh');
    window.updateActions = [];
    window.cocodeWindow = {
      getRequiredUpdate: () => ({ version: '9.0.0', platform: 'darwin', status: 'available' }),
      onRequiredUpdate: cb => { window.addEventListener('test-update', e => cb(e.detail)); return () => {}; },
      updateAction: async action => { window.updateActions.push(action); },
    };
  });
  await update.goto(base);
  await update.getByRole('heading', { name: '请更新 CoCode' }).waitFor();
  await update.keyboard.press('Escape');
  assert.equal(await update.locator('textarea').count(), 0);
  await update.getByRole('button', { name: '打开官网下载页' }).click();
  assert.deepEqual(await update.evaluate(() => window.updateActions), ['download']);
  await update.evaluate(() => window.dispatchEvent(new CustomEvent('test-update', { detail: { version: '9.0.0', platform: 'win32', status: 'downloading', percent: 42 } })));
  await update.getByText('正在下载更新… 42%').waitFor();
  await update.evaluate(() => window.dispatchEvent(new CustomEvent('test-update', { detail: { version: '9.0.0', platform: 'win32', status: 'ready', percent: 100 } })));
  await update.getByRole('button', { name: '重启并安装' }).click();
  assert.deepEqual(await update.evaluate(() => window.updateActions), ['download', 'install']);
  console.log('通过：强制更新不可跳过、macOS 下载、Windows 下载进度和安装操作');

  setDesktopAccessBlocked('test', '测试封禁');
  const denied = await fetch(base + '/admin/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);
  setDesktopAccessBlocked('test', '');
  assert.equal((await fetch(base + '/admin/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 200);
  assert.deepEqual(errors, []);
  console.log('通过：本地执行门槛、无页面脚本异常');
} finally {
  await admin('/admin/users/900001/ban', { banned: false });
  await browser.close(); server.close();
}

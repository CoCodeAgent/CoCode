// 固定隔离本地 Worker，绝不向线上群发或撤回消息。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const worker = 'http://127.0.0.1:8795';
async function request(path, token, body) {
  const r = await fetch(worker + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json() };
}
const admin = (path, body) => request(path, 'local-test-admin', body);
const user = (path, token = 'local-user-one') => request(path, token);
process.env.COCODE_HOME = mkdtempSync(join(tmpdir(), 'cocode-recall-ui-'));
const { startASAPIServer } = await import('../packages/core/src/asapi/server.js');
const server = await startASAPIServer({ port: 0 });
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const title = '撤回验收 ' + Date.now();
  const sent = await admin('/admin/messages', { userId: null, title, body: '测试正文 <script>不得执行</script>' });
  assert.equal(sent.status, 200); assert.equal(sent.data.recipients, 2);
  const dispatch = sent.data.dispatchId;
  const history = await admin('/admin/messages');
  assert.equal(history.data.messages.find(m => m.dispatch_id === dispatch).recipients, 2);
  const original = (await user('/account/messages')).data.messages.find(m => m.title === title);
  await admin('/admin/messages', { userId: 900001, title: '保留的消息', body: '不能受到其他消息撤回影响。' });
  assert.equal((await request(`/admin/messages/${dispatch}/recall`, 'local-user-one', {})).status, 401);
  assert.equal((await admin('/admin/messages/unknown/recall', {})).status, 404);

  const page = await browser.newPage({ locale: 'zh-CN' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ base, worker }) => {
    for (const [k,v] of Object.entries({ server_url: base, username: 'cocode', cocode_auth_api: worker, cocode_auth_token: 'local-user-one', cocode_auth_username: '管理测试一', cocode_cn_notice_agreed_v1: '1', cocode_language_preference: 'zh' })) localStorage.setItem(k,v);
  }, { base, worker });
  await page.goto(base);
  await page.getByRole('button', { name: /管理测试一/ }).click();
  await page.getByRole('menuitem', { name: /消息/ }).click();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await page.getByRole('heading', { name: title }).waitFor();

  const panel = await browser.newPage();
  panel.on('pageerror', e => errors.push(e.message));
  await panel.route('https://ohfun.online/admin', route => route.fulfill({ contentType: 'text/html', body: readFileSync('website/admin.html', 'utf8') }));
  await panel.route('https://ohfun.online/admin.js', route => route.fulfill({ contentType: 'application/javascript', body: readFileSync('website/admin.js', 'utf8') }));
  await panel.route('https://cocode.ohfun.online/**', async route => {
    const url = new URL(route.request().url());
    await route.fulfill({ response: await route.fetch({ url: worker + url.pathname + url.search }) });
  });
  await panel.goto('https://ohfun.online/admin');
  await panel.getByPlaceholder('管理密钥').fill('local-test-admin');
  await panel.getByRole('button', { name: '进入后台' }).click();
  const entry = panel.locator('#sentMessages article').filter({ has: panel.getByRole('heading', { name: title }) });
  await entry.getByRole('button', { name: '撤回消息' }).waitFor();
  panel.once('dialog', dialog => dialog.dismiss());
  await entry.getByRole('button', { name: '撤回消息' }).click();
  assert.ok((await user('/account/messages')).data.messages.some(m => m.id === original.id));
  panel.once('dialog', dialog => dialog.accept());
  const start = Date.now();
  await entry.getByRole('button', { name: '撤回消息' }).click();
  await page.getByRole('heading', { name: title }).waitFor({ state: 'hidden', timeout: 4000 });
  await page.getByRole('button', { name: /保留的消息/ }).waitFor();
  await entry.getByRole('button', { name: '已撤回' }).waitFor();
  assert.equal(await entry.getByRole('button', { name: '已撤回' }).isDisabled(), true);
  console.log('通过：后台历史、取消确认、群发整批撤回、打开的详情实时关闭，耗时 ' + (Date.now() - start) + ' ms');
  for (const token of ['local-user-one','local-user-two']) assert.ok(!(await user('/account/messages',token)).data.messages.some(m => m.title === title));
  assert.equal((await user('/account/messages/' + original.id)).status, 404);
  assert.equal((await request('/account/messages/translate','local-user-one',{id:original.id,targetLanguage:'en'})).status,404);
  assert.equal((await user('/account/messages','local-user-two')).data.unread,0);
  assert.equal((await admin(`/admin/messages/${dispatch}/recall`, {})).data.recalled,0);
  assert.deepEqual(errors, []);
  await panel.screenshot({ path: '/private/tmp/cocode-message-recall-admin.png', fullPage: true });
  console.log('通过：权限隔离、详情与翻译禁止访问、未读更新、其他消息保留、重复撤回幂等、无脚本错误。');
} finally { await browser.close(); server.close(); }

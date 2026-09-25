// 仅测试固定本地 Worker；使用隔离数据库和禁用的邮件密钥。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
const base = 'http://127.0.0.1:8795';
const persist = '/private/tmp/cocode-new-user-messages-20260922';
async function request(path, token, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, data: await r.json() };
}
const admin = (path, body) => request(path, 'local-test-admin', body);
async function register() {
  const name = 'new_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const email = name + '@example.invalid';
  execFileSync('npx', ['--offline','--yes','wrangler@4','d1','execute','cocode-auth','--local','--config','packages/auth-worker/wrangler.toml','--persist-to',persist,'--command',`INSERT INTO verification_codes(email,code,expires_at,sent_at,attempts) VALUES('${email}','123456',${Date.now()+600000},${Date.now()},0)`], { stdio: 'pipe' });
  const result = await request('/auth/register', '', { username: name, email, password: 'Local-test-only-4826', code: '123456' });
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal((await request('/auth/me',result.data.token)).data.email,email);
  return result.data.token;
}
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];page.on('pageerror', e => errors.push(e.message));
  await page.route('https://ohfun.online/admin', route => route.fulfill({ contentType: 'text/html', body: readFileSync('website/admin.html','utf8') }));
  await page.route('https://ohfun.online/admin.js', route => route.fulfill({ contentType: 'application/javascript', body: readFileSync('website/admin.js','utf8') }));
  await page.route('https://cocode.ohfun.online/**', async route => { const url=new URL(route.request().url());await route.fulfill({response:await route.fetch({url:base+url.pathname+url.search})}); });
  await page.goto('https://ohfun.online/admin');
  await page.getByPlaceholder('管理密钥').fill('local-test-admin');
  await page.getByRole('button',{name:'进入后台'}).click();
  const checkbox = page.getByRole('checkbox',{name:'新用户可收到消息'});
  await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false);
  await checkbox.check();await page.getByLabel('接收人').selectOption('900001');
  assert.equal(await checkbox.isDisabled(),true);assert.equal(await checkbox.isChecked(),false);
  await page.getByLabel('接收人').selectOption('all');await checkbox.check();
  const title = '欢迎新成员 ' + Date.now();
  await page.getByLabel('标题',{exact:true}).fill(title);
  await page.getByLabel('正文',{exact:true}).fill('之后注册也可以收到。');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'发送消息',exact:true}).click();
  const entry=page.locator('#sentMessages article').filter({has:page.getByRole('heading',{name:title})});
  await entry.getByText(/新用户可收到消息/).waitFor();
  assert.equal(await checkbox.isChecked(),false);
  await admin('/admin/messages',{userId:null,title:'只发当前用户',body:'不应补发',includeNewUsers:false});
  assert.equal((await admin('/admin/messages',{userId:900001,title:'私信',body:'不应允许',includeNewUsers:true})).status,422);
  assert.equal((await admin('/admin/messages',{userId:null,title:'错误类型',body:'不应允许',includeNewUsers:'true'})).status,422);
  const token=await register();
  for(let i=0;i<2;i++) {
    const inbox=await request('/account/messages',token);assert.equal(inbox.status,200);
    assert.equal(inbox.data.messages.filter(m=>m.title===title).length,1);
    assert.ok(!inbox.data.messages.some(m=>m.title==='只发当前用户'));
    assert.equal(inbox.data.unread,1);
  }
  page.once('dialog',dialog=>dialog.accept());await entry.getByRole('button',{name:'撤回消息'}).click();
  await entry.getByText(/新用户发放已停止/).waitFor();
  assert.equal((await request('/account/messages',token)).data.messages.length,0);
  const later=await register();assert.equal((await request('/account/messages',later)).data.messages.length,0);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/private/tmp/cocode-new-user-messages.png',fullPage:true});
  console.log('通过：勾选与定向禁用、真实注册立即收件、未勾选不补发、重复读取不重复投递、会话归属正确、撤回停止后续发放、历史状态。');
} finally { await browser.close(); }

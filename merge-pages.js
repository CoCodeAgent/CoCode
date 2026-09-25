// 把官网首页 + 三个协议整合成一个单文件 HTML（hash 路由切换视图）
import fs from 'fs';
import path from 'path';

const WEB = '/Users/zhenxun/CoCode/website';

const read = (f) => fs.readFileSync(path.join(WEB, f), 'utf8');

function extractStyle(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

function extractBodyInner(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  if (!m) return '';
  let body = m[1];
  body = body.replace(/<header[\s\S]*?<\/header>/i, '');
  body = body.replace(/<footer[\s\S]*?<\/footer>/i, '');
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  return body.trim();
}

function extractLegalBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  if (!m) return '';
  let body = m[1];
  body = body.replace(/<footer[\s\S]*?<\/footer>/i, '');
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  return body.trim();
}

function scopeCss(css, scopes) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const brace = src.indexOf('{', i);
    if (brace === -1) { out += src.slice(i); break; }
    const selector = src.slice(i, brace).trim();
    let depth = 1, j = brace + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(brace + 1, j - 1);
    if (selector.startsWith('@media')) {
      out += selector + '{' + scopeCss(body, scopes) + '}';
    } else if (selector.startsWith('@')) {
      out += src.slice(i, j);
    } else {
      const keep = [];
      const scoped = [];
      selector.split(',').map(s => s.trim()).filter(Boolean).forEach(sel => {
        if (sel.includes('[data-lang')) { keep.push(sel); return; }
        if (/^(html|body)([\s.{,:]|$)/.test(sel)) return;
        if (sel === ':root' || sel === '*') { keep.push(sel); return; }
        scopes.forEach(sc => scoped.push(sc + ' ' + sel));
      });
      if (keep.length) out += keep.join(',') + '{' + body + '}';
      if (scoped.length) out += scoped.join(',') + '{' + body + '}';
    }
    i = j;
  }
  return out;
}

const LEGAL_SCOPES = ['#view-terms', '#view-privacy', '#view-cross-border'];

const indexHtml = read('home.html');
const indexStyle = extractStyle(indexHtml);
const indexBody = extractBodyInner(indexHtml);

const termsHtml = read('terms.html');
const termsStyle = extractStyle(termsHtml);
const termsBody = extractLegalBody(termsHtml);

const privacyHtml = read('privacy.html');
const privacyBody = extractLegalBody(privacyHtml);

const crossHtml = read('cross-border.html');
const crossBody = extractLegalBody(crossHtml);

const combinedStyle = `${indexStyle}
/* ===== 协议页样式（已限定作用域） ===== */
${scopeCss(termsStyle, LEGAL_SCOPES)}
`;

const output = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>CoCode — 会干活的编程 Agent</title>
<meta name="description" id="meta-desc" content="CoCode Desktop：自接入模型的编程 Agent 桌面端零依赖核心，18 个内置工具，低 token 多干活，每轮可回滚">
<link rel="icon" type="image/png" href="logo.PNG">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
${combinedStyle}
/* ===== 视图切换 ===== */
.view{display:none}
.view.active{display:block}
.pill.active{background:var(--ink);color:#fff}
.lang-btn{border:none;background:transparent;padding:5px 14px;border-radius:999px;font-size:12.5px;font-weight:500;cursor:pointer;color:var(--faint);transition:.2s}
.lang-btn.active{background:var(--ink);color:#fff}
/* 行内双语：避免 data-lang 的块级规则破坏按钮/链接内的布局 */
html.en span[data-lang="en"],html.en a [data-lang="en"],html.en button [data-lang="en"]{display:inline}
/* ===== 汉堡菜单（移动端抽屉） ===== */
.burger{display:none;border:none;background:transparent;cursor:pointer;padding:10px 8px;margin-left:2px}
.burger span{display:block;width:20px;height:2px;border-radius:2px;background:var(--ink);transition:transform .25s var(--ease),opacity .2s}
.burger span+span{margin-top:5px}
.burger.open span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.burger.open span:nth-child(2){opacity:0}
.burger.open span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.drawer{display:none}
@media(max-width:820px){
  .burger{display:block}
  nav .hd-cta{display:none}
  .drawer{
    display:block;position:fixed;top:72px;left:0;right:0;z-index:59;
    background:rgba(255,255,255,.96);backdrop-filter:blur(18px);
    border-bottom:1px solid var(--line);
    padding:6px 28px 14px;
    opacity:0;transform:translateY(-10px);pointer-events:none;
    transition:opacity .22s var(--ease),transform .22s var(--ease);
  }
  .drawer.open{opacity:1;transform:none;pointer-events:auto}
  .drawer a{
    display:flex;align-items:center;justify-content:space-between;
    padding:13px 2px;border-bottom:1px solid var(--line);
    font-size:15px;color:var(--ink);
  }
  .drawer a:last-child{border-bottom:none}
  .drawer a.active{font-weight:600}
}
</style>
</head>
<body>

<header>
  <div class="wrap hd">
    <a class="brand" href="#home" data-route="home">
      <img src="logo.PNG" alt="CoCode logo" width="34" height="34"
        style="display:block;border-radius:9px;object-fit:cover;box-shadow:0 2px 8px -2px rgba(24,30,37,.25)">
      CoCode
    </a>
    <nav>
      <a class="pill" href="#home" data-route="home"><span data-lang="zh">首页</span><span data-lang="en">Home</span></a>
      <a class="pill" href="#features" data-scroll="features"><span data-lang="zh">功能</span><span data-lang="en">Features</span></a>
      <a class="pill" href="#versions" data-scroll="versions"><span data-lang="zh">双版本</span><span data-lang="en">Editions</span></a>
      <a class="pill" href="#download" data-scroll="download"><span data-lang="zh">下载</span><span data-lang="en">Download</span></a>
      <button class="lang-btn active" data-lng="zh" type="button">中文</button>
      <button class="lang-btn" data-lng="en" type="button">EN</button>
      <a class="hd-cta" href="https://github.com/CoCodeAgent/CoCode" target="_blank" rel="noopener">GitHub</a>
      <button class="burger" id="burger" type="button" aria-label="菜单" aria-expanded="false" aria-controls="drawer">
        <span></span><span></span><span></span>
      </button>
    </nav>
  </div>
  <div class="drawer" id="drawer">
    <a href="#home" data-route="home"><span data-lang="zh">首页</span><span data-lang="en">Home</span></a>
    <a href="#features" data-scroll="features"><span data-lang="zh">功能</span><span data-lang="en">Features</span></a>
    <a href="#versions" data-scroll="versions"><span data-lang="zh">双版本</span><span data-lang="en">Editions</span></a>
    <a href="#download" data-scroll="download"><span data-lang="zh">下载</span><span data-lang="en">Download</span></a>
    <a href="https://github.com/CoCodeAgent/CoCode" target="_blank" rel="noopener">GitHub</a>
  </div>
</header>

<!-- ============ 首页 ============ -->
<div id="view-home" class="view active">
${indexBody}
</div>

<!-- ============ 用户协议 ============ -->
<div id="view-terms" class="view">
${termsBody}
</div>

<!-- ============ 隐私政策 ============ -->
<div id="view-privacy" class="view">
${privacyBody}
</div>

<!-- ============ 跨境传输 ============ -->
<div id="view-cross-border" class="view">
${crossBody}
</div>

<footer>
  <div class="wrap ft">
    <div style="display:flex;flex-direction:column;gap:6px">
      <span class="en" style="font-weight:600;color:var(--ink)">CoCode</span>
      <span class="en">AGPL-3.0 LICENSED · RUNS LOCALLY · DATA NEVER LEAVES YOUR MACHINE</span>
    </div>
    <div style="display:flex;gap:18px;flex-wrap:wrap">
      <a class="en" href="#terms" data-route="terms" style="color:var(--faint);text-decoration:none">用户协议 / Terms</a>
      <a class="en" href="#privacy" data-route="privacy" style="color:var(--faint);text-decoration:none">隐私政策 / Privacy</a>
      <a class="en" href="#cross-border" data-route="cross-border" style="color:var(--faint);text-decoration:none">跨境传输 / Cross-Border</a>
    </div>
  </div>
</footer>

<script>
(function(){
  var VIEWS = ['home','terms','privacy','cross-border'];
  var SCROLL_IDS = ['features','versions','download'];

  var burger = document.getElementById('burger');
  var drawer = document.getElementById('drawer');
  function closeDrawer(){
    if(burger){ burger.classList.remove('open'); burger.setAttribute('aria-expanded','false'); }
    if(drawer){ drawer.classList.remove('open'); }
  }

  function showView(name){
    VIEWS.forEach(function(v){
      var el = document.getElementById('view-'+v);
      if(el) el.classList.toggle('active', v===name);
    });
    document.querySelectorAll('[data-route]').forEach(function(a){
      a.classList.toggle('active', a.getAttribute('data-route')===name);
    });
    window.scrollTo({top:0,behavior:'instant'});
    closeDrawer();
  }

  function handleRoute(){
    // 同时支持 pathname（/terms）和 hash（#terms）
    var pathPart = location.pathname.replace(/\\/+$/,'').replace(/\\.html$/,'').slice(1);
    var hashPart = location.hash.replace(/^#/,'');
    var name = VIEWS.indexOf(pathPart)>=0 ? pathPart : (hashPart || 'home');
    if(VIEWS.indexOf(name)>=0){
      showView(name);
    } else if(SCROLL_IDS.indexOf(name)>=0){
      showView('home');
      setTimeout(function(){
        var el = document.getElementById(name);
        if(el) el.scrollIntoView({behavior:'smooth'});
      },50);
    } else {
      showView('home');
    }
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[href^="#"]');
    if(!a) return;
    var target = a.getAttribute('href').slice(1);
    if(!target) return;
    if(VIEWS.indexOf(target)>=0 || SCROLL_IDS.indexOf(target)>=0){
      e.preventDefault();
      location.hash = target;
    }
  });

  function applyLang(lang){
    document.documentElement.classList.toggle('en', lang==='en');
    document.documentElement.lang = lang==='en' ? 'en' : 'zh-CN';
    document.title = lang==='en' ? 'CoCode — A Coding Agent That Gets Work Done' : 'CoCode — 会干活的编程 Agent';
    var metaDesc = document.getElementById('meta-desc');
    if(metaDesc){ metaDesc.setAttribute('content', lang==='en' ? 'CoCode Desktop — a coding Agent with bring-your-own-model support, a zero-dependency core, 18 built-in tools, token-efficient output, and revertible turns.' : 'CoCode Desktop：自接入模型的编程 Agent 桌面端零依赖核心，18 个内置工具，低 token 多干活，每轮可回滚'); }
    document.querySelectorAll('.lang-btn').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-lng')===lang);
    });
  }
  document.querySelectorAll('.lang-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var lang = btn.getAttribute('data-lng');
      try{ localStorage.setItem('lang', lang); }catch(err){}
      applyLang(lang);
    });
  });
  var savedLang = 'zh';
  try{ savedLang = localStorage.getItem('lang') || 'zh'; }catch(err){}
  applyLang(savedLang);

  if(burger && drawer){
    burger.addEventListener('click', function(){
      var open = !drawer.classList.contains('open');
      drawer.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    drawer.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', closeDrawer);
    });
    window.addEventListener('resize', function(){
      if(window.innerWidth > 820) closeDrawer();
    });
  }

  // reveal 动画：各源页面的 script 在合并时被剥离，这里统一恢复触发逻辑
  var rvs = document.querySelectorAll('.rv');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(en.isIntersecting){en.target.classList.add('on');io.unobserve(en.target);}
      });
    },{threshold:.1,rootMargin:'0px 0px -50px 0px'});
    rvs.forEach(function(e){io.observe(e);});
  } else {
    rvs.forEach(function(e){e.classList.add('on');});
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
})();
</script>

</body>
</html>
`;

fs.writeFileSync(path.join(WEB, 'index.html'), output, 'utf8');
console.log('done. size:', output.length, 'chars');

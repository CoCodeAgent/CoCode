// 把官网首页 + 定价 + 三个协议整合成一个单文件 HTML（hash 路由切换视图）
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

const pricingHtml = read('pricing.html');
const pricingStyle = extractStyle(pricingHtml);
const pricingBody = extractBodyInner(pricingHtml);

const termsHtml = read('terms.html');
const termsStyle = extractStyle(termsHtml);
const termsBody = extractLegalBody(termsHtml);

const privacyHtml = read('privacy.html');
const privacyBody = extractLegalBody(privacyHtml);

const crossHtml = read('cross-border.html');
const crossBody = extractLegalBody(crossHtml);

const combinedStyle = `${indexStyle}
/* ===== 定价页样式（已限定作用域） ===== */
${scopeCss(pricingStyle, ['#view-pricing'])}
/* ===== 协议页样式（已限定作用域） ===== */
${scopeCss(termsStyle, LEGAL_SCOPES)}
`;

const output = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>CoCode — 会干活的编程 Agent</title>
<meta name="description" content="CoCode Desktop：自接入模型的编程 Agent 桌面端零依赖核心，18 个内置工具，低 token 多干活，每轮可回滚">
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
      <a class="pill" href="#home" data-route="home">首页</a>
      <a class="pill" href="#features" data-scroll="features">功能</a>
      <a class="pill" href="#versions" data-scroll="versions">双版本</a>
      <a class="pill" href="#pricing" data-route="pricing">定价</a>
      <a class="pill" href="#download" data-scroll="download">下载</a>
      <a class="hd-cta" href="https://github.com/CoCodeAgent/CoCode" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </div>
</header>

<!-- ============ 首页 ============ -->
<div id="view-home" class="view active">
${indexBody}
</div>

<!-- ============ 定价 ============ -->
<div id="view-pricing" class="view">
${pricingBody}
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
  var VIEWS = ['home','pricing','terms','privacy','cross-border'];
  var SCROLL_IDS = ['features','versions','download'];

  function showView(name){
    VIEWS.forEach(function(v){
      var el = document.getElementById('view-'+v);
      if(el) el.classList.toggle('active', v===name);
    });
    document.querySelectorAll('[data-route]').forEach(function(a){
      a.classList.toggle('active', a.getAttribute('data-route')===name);
    });
    window.scrollTo({top:0,behavior:'instant'});
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

  document.querySelectorAll('.lang-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var lang = btn.getAttribute('data-lang');
      document.documentElement.classList.toggle('en', lang==='en');
      document.querySelectorAll('.lang-btn').forEach(function(b){
        b.classList.toggle('active', b===btn);
      });
    });
  });

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

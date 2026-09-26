// 将官网首页与协议页合成单文件。首页结构取自 home.html，避免预览获批后
// 生成器仍输出旧导航和旧卡片；协议正文从原文件逐字提取，不改动法律文案。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'website');
const read = name => fs.readFileSync(path.join(webDir, name), 'utf8');

function extractStyle(html) {
  return html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? '';
}

function extractLegalBody(html) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  if (!body) throw new Error('协议页缺少 body');
  return body
    .replace(/<header\b[\s\S]*?<\/header>/i, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/i, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .trim();
}

// 协议页原样保留内容，但把独立页面的 CSS 限定到对应视图，避免覆盖首页。
function scopeCss(css, scopes) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let output = '';
  let cursor = 0;
  while (cursor < source.length) {
    const brace = source.indexOf('{', cursor);
    if (brace < 0) break;
    const selector = source.slice(cursor, brace).trim();
    let depth = 1;
    let end = brace + 1;
    while (end < source.length && depth) {
      if (source[end] === '{') depth++;
      else if (source[end] === '}') depth--;
      end++;
    }
    const body = source.slice(brace + 1, end - 1);
    if (selector.startsWith('@media')) {
      output += `${selector}{${scopeCss(body, scopes)}}`;
    } else if (selector.startsWith('@')) {
      output += source.slice(cursor, end);
    } else {
      const scoped = selector.split(',').map(part => part.trim()).filter(Boolean)
        .filter(part => part !== ':root' && !/^(html|body)([\s.{,:]|$)/.test(part))
        .flatMap(part => scopes.map(scope => part === '*' ? `${scope} *` : `${scope} ${part}`));
      if (scoped.length) output += `${scoped.join(',')}{${body}}`;
    }
    cursor = end;
  }
  return output;
}

const home = read('home.html');
for (const required of ['<main id="view-home" class="site-view active">', '</main>', '</style>', '</body>']) {
  if (!home.includes(required)) throw new Error(`首页模板缺少 ${required}`);
}

const legalViews = [
  ['terms', read('terms.html')],
  ['privacy', read('privacy.html')],
  ['cross-border', read('cross-border.html')],
];
const legalScopes = legalViews.map(([name]) => `#view-${name}`);
const legalSections = legalViews.map(([name, html]) =>
  `<div id="view-${name}" class="site-view legal-view">\n${extractLegalBody(html)}\n</div>`
).join('\n\n');

const routingStyle = `
/* 单页官网保留现有协议入口与中英切换。 */
.site-view{display:none}
.site-view.active{display:block}
.legal-view{padding-top:10px}
.legal-view{--faint:var(--quiet);--paper:var(--surface)}
html[data-language="zh"] .legal-view [data-lang="en"],
html[data-language="en"] .legal-view [data-lang="zh"]{display:none!important}
html[data-language="zh"] .legal-view [data-lang="zh"],
html[data-language="en"] .legal-view [data-lang="en"]{display:revert!important}
@media (prefers-color-scheme:dark){
  #view-terms .legal p,#view-terms .legal li,#view-privacy .legal p,#view-privacy .legal li,#view-cross-border .legal p,#view-cross-border .legal li{color:var(--muted)}
  #view-terms .legal strong,#view-privacy .legal strong,#view-cross-border .legal strong{color:var(--ink)}
  #view-terms .legal .note,#view-privacy .legal .note,#view-cross-border .legal .note{background:var(--surface);border-left-color:var(--accent)}
  #view-terms .legal a,#view-privacy .legal a,#view-cross-border .legal a{color:var(--accent)}
}
`;

const routingScript = `<script>
(() => {
  const legalNames = ['terms', 'privacy', 'cross-border'];
  const sectionNames = ['features', 'versions', 'download'];
  const views = ['home', ...legalNames];

  function updateTitle(name) {
    const en = document.documentElement.dataset.language === 'en';
    const titles = {
      home: en ? 'CoCode - A Coding Agent That Gets Work Done' : 'CoCode - 会干活的编程 Agent',
      terms: en ? 'Terms of Service - CoCode' : '用户协议 - CoCode',
      privacy: en ? 'Privacy Policy - CoCode' : '隐私政策 - CoCode',
      'cross-border': en ? 'Cross-Border Data Transfer - CoCode' : '跨境传输 - CoCode',
    };
    document.title = titles[name] || titles.home;
  }

  function show(name, scrollTarget) {
    views.forEach(view => document.getElementById('view-' + view)?.classList.toggle('active', view === name));
    if (name === 'home' && scrollTarget) {
      requestAnimationFrame(() => document.getElementById(scrollTarget)?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      }));
    } else window.scrollTo(0, 0);
    updateTitle(name);
    const menu = document.getElementById('mobile-nav');
    const button = document.getElementById('menu-button');
    if (menu) menu.dataset.open = 'false';
    button?.setAttribute('aria-expanded', 'false');
  }

  function route() {
    const hash = decodeURIComponent(location.hash.slice(1));
    const pathName = location.pathname.replace(/\\/+$/, '').replace(/\\.html$/, '').split('/').pop();
    const target = hash || (legalNames.includes(pathName) ? pathName : 'home');
    if (legalNames.includes(target)) show(target);
    else if (sectionNames.includes(target)) show('home', target);
    else show('home');
  }

  addEventListener('hashchange', route);
  addEventListener('cocode:language-change', route);
  route();
})();
</script>`;

const output = home
  .replace('</style>', `${scopeCss(extractStyle(legalViews[0][1]), legalScopes)}\n${routingStyle}\n</style>`)
  .replace('</main>', `</main>\n${legalSections}`)
  .replace('</body>', `${routingScript}\n</body>`);

fs.writeFileSync(path.join(webDir, 'index.html'), output, 'utf8');
console.log('官网已合并：', output.length, '字符');

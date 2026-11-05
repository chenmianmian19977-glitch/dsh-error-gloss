// tools/gen-preview.mjs — 生成一个自包含的 HTML 预览页，用与 client.js 相同的
// 配色/字号/结构渲染注解行，方便在不动 DSH 的情况下看效果。
//
//   D:\node.exe D:\dsh-error-gloss\tools\gen-preview.mjs
//   → notes/preview-gloss.html
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const b64 = (rel) => {
  const f = join(ROOT, rel);
  if (!existsSync(f)) return '';
  return `data:image/webp;base64,${readFileSync(f).toString('base64')}`;
};
const icon64 = existsSync(join(ROOT, 'client/icon.png'))
  ? `data:image/png;base64,${readFileSync(join(ROOT, 'client/icon.png')).toString('base64')}`
  : '';

const A = {
  calm: b64('client/assets/mascot-calm.webp'),
  serious: b64('client/assets/mascot-serious.webp'),
  thinking: b64('client/assets/mascot-thinking.webp'),
  sorry: b64('client/assets/mascot-sorry.webp'),
};

const tail = (id) => `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex:none;display:block">
<defs><linearGradient id="${id}" x1="2" y1="15" x2="14" y2="3" gradientUnits="userSpaceOnUse">
<stop offset="0" stop-color="#7FD4F5"/><stop offset="1" stop-color="#9D7BF5"/></linearGradient></defs>
<path d="M8 15V8.4M8 8.4C5.4 8.4 3.2 6.4 3.2 3.4c3 .7 4.8 3 4.8 5 0-2 1.8-4.3 4.8-5 0 3-2.2 5-4.8 5Z" stroke="url(#${id})" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const row = ({ id, avatar, title, summary, action, open = false, detail = '', id2 }) => `
<div class="row">
  <div class="bar"></div>
  <img class="avatar${open ? ' big' : ''}" src="${avatar}" alt="">
  <div class="col">
    <div class="head">
      <span class="title">【${title}】</span>
      <span class="body">${summary}</span>
      ${action ? `<span class="body dim">· 建议：${action}</span>` : ''}
    </div>
    <button class="toggle">${tail(id2)}<span class="tlabel">${open ? '收起' : '展开详情'}</span></button>
    ${open ? `<pre class="detail">${detail}</pre>` : ''}
  </div>
</div>`;

const errRow = (msg, code) => `
<div class="errline"><span class="dot"></span><span class="errtitle">本轮运行失败</span><span class="errmsg">${msg}</span><span class="code">${code}</span></div>`;

const html = `<!doctype html><html lang="zh"><meta charset="utf-8">
<title>dsh-error-gloss 渲染预览</title>
<style>
:root{--bg:#17181c;--fg:#e6e7ea;--fg2:#C7D7EA;--mut:#8d9099;--line:#2a2c33}
*{box-sizing:border-box}
body{margin:0;background:#0f1013;color:var(--fg);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:40px 24px 64px}
h1{font-size:15px;font-weight:500;margin:0 0 4px;display:flex;align-items:center;gap:10px}
h1 img{width:32px;height:32px;border-radius:50%;object-fit:cover}
.sub{color:var(--mut);font-size:12.5px;margin:0 0 28px}
.card{background:var(--bg);border:0.5px solid var(--line);border-radius:12px;padding:18px 18px 14px;margin-bottom:18px}
.tag{font-size:11.5px;color:var(--mut);margin:0 0 10px}
.errline{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:2px 0 10px;flex-wrap:wrap}
.dot{width:7px;height:7px;border-radius:50%;background:#E24B4A;flex:none}
.errtitle{color:#f27d7c;font-weight:500}
.errmsg{color:var(--fg2)}
.code{color:#6e727c;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;margin-left:auto}
.row{display:flex;gap:10px;align-items:flex-start;padding:8px 12px 8px 0;border-radius:10px;
     background-image:linear-gradient(90deg,rgba(91,156,248,.10),rgba(29,158,117,.03));overflow:hidden}
.bar{width:2px;flex:none;align-self:stretch;border-radius:2px;background-image:linear-gradient(180deg,#5B9CF8,#1D9E75)}
.avatar{width:20px;height:20px;flex:none;border-radius:50%;object-fit:cover;margin-top:1px;transition:width .12s,height .12s}
.avatar.big{width:40px;height:40px;margin-top:0}
.col{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 8px}
.title,.tlabel{background-image:linear-gradient(90deg,#7FD4F5 0%,#5B9CF8 52%,#9D7BF5 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.title{font-size:12.5px;font-weight:500;line-height:1.5}
.tlabel{font-size:12px}
.body{font-size:12.5px;line-height:1.55;color:var(--fg2)}
.body.dim{opacity:.8}
.toggle{display:inline-flex;align-items:center;gap:5px;align-self:flex-start;padding:0;border:none;background:transparent;cursor:pointer}
.detail{white-space:pre-wrap;margin:0;font-size:12px;line-height:1.7;color:var(--fg2);opacity:.92;font-family:inherit}
.set{display:flex;align-items:center;gap:8px}
.set img{width:32px;height:32px;border-radius:50%;object-fit:cover}
.set span{font-size:14px;background-image:linear-gradient(90deg,#7FD4F5 0%,#5B9CF8 52%,#9D7BF5 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.iconrow{display:flex;align-items:center;gap:12px}
.iconrow img{width:48px;height:48px;border-radius:12px}
</style>
<div class="wrap">
<h1><img src="${A.calm}" alt="">dsh-error-gloss · 渲染预览</h1>
<p class="sub">与插件内 bundle 同一套样式与同一批内联资产。看到的就是装进 DSH 后的样子。</p>

<div class="card">
<p class="tag">① 收起态 · 20px 头像 · conditional（可能档）→ 思考</p>
${errRow('Anthropic stream ended without a stop reason', 'TRANSPORT')}
${row({ id: 'a', avatar: A.thinking, title: '模型流传输中断', summary: '响应流在结束前断开，客户端会自动退避重试。', action: '等待自动重试', id2: 't1' })}
</div>

<div class="card">
<p class="tag">② 展开态 · 40px 头像 · 四段信息</p>
${errRow('DeepSeek Messages transport failed', 'TRANSPORT')}
${row({
  id: 'b', avatar: A.thinking, open: true, id2: 't2',
  title: '模型流传输中断', summary: '响应流在结束前断开，客户端会自动退避重试。', action: '等待自动重试',
  detail: `原文：Anthropic stream ended without a stop reason
释义：响应流在结束前断开，客户端会自动退避重试。
原因（会话日志）：
  可能原因：网络或提供方流提前终止（需结合 provider.message、network.status 判断）
影响：本轮短暂延迟；重试次数用尽后失败。
你可以：
  1. [点按钮] 等待自动重试
  2. [改配置] 检查代理与 baseURL 连通性
本条依据：~/.dsh/sessions/**/session.v4.jsonl.zstd · 词典 transport.stream v0.1.0`,
})}
</div>

<div class="card">
<p class="tag">③ 确定档 → 认真 · 未验证档 → 抱歉</p>
${errRow('No API key configured for provider "magpie-anthropic"', 'MISSING_CREDENTIAL')}
${row({ id: 'c', avatar: A.serious, title: '没有配置密钥', summary: '这个 provider 没有可用的 API Key。', action: '在设置 → 模型里为该 provider 填 Key', id2: 't3' })}
<div style="height:10px"></div>
${errRow('upstream returned 500', 'SERVER')}
${row({ id: 'd', avatar: A.sorry, title: '原因未验证', summary: '这条文案来自服务端，本地词典只给出释义与建议。', action: '看原文里的 provider 字段', id2: 't4' })}
</div>

<div class="card">
<p class="tag">④ 设置页头部与插件图标</p>
<div class="set"><img src="${A.calm}" alt=""><span>报错中文注解</span></div>
<div style="height:16px"></div>
<div class="iconrow">${icon64 ? `<img src="${icon64}" alt="">` : ''}<span class="body dim">插件面板里的 48px 图标（icon.png）</span></div>
</div>
</div></html>`;

writeFileSync(join(ROOT, 'notes', 'preview-gloss.html'), html, 'utf8');
console.log('已生成 notes/preview-gloss.html');

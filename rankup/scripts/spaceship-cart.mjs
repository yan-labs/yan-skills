#!/usr/bin/env node
// 用途：在已登录 Chrome 的 Spaceship 账号里把域名加入购物车并回读（域名/年限/价格/附加项）。
// 绝不结账、不点「结账」、不填或改支付方式；只加购与读取。
// 用法：
//   node scripts/spaceship-cart.mjs add example.org other.org   # 先用 spaceship-api.mjs request GET /domains/<d>/available 确认可注册
//   node scripts/spaceship-cart.mjs read                         # 只读回读购物车
// 依赖：OpenCLI 已连接本机 Chrome，且 spaceship.com 已登录（页面语言为中文界面，选择器按文字匹配）。
// 优惠码见 references/cloudflare/domain-email.md §8.4（购物车里由用户填码，脚本不填）。
// 已知坑（2026-10-23 实测）：
//  - 搜索页顶部结果卡的「加入购物车」是第一个可见按钮；点完变成「查看购物车」，重复加购安全。
//  - 点购物车图标先弹「完善您的订单」推荐抽屉（Spacemail/托管等试用，默认不选），点「继续」才出真正购物车抽屉，抽屉底部「结账」不要点。
//  - 价格是人民币，首年有折扣，抽屉里「详情」展开后有「1 年 注册」「自动续费 开」。
//  - 会话用完要 close；脚本结束自动 close。
import { execFileSync } from 'node:child_process';

const session = process.env.SPACESHIP_SESSION || 'spaceship-cart';
const oc = (...args) => {
  try {
    return execFileSync('opencli', ['browser', session, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90000 });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const evalJs = js => {
  const out = oc('eval', js);
  return out.split('\n').filter(l => !/Update available|npm install|^\s*$/.test(l)).join('\n').trim();
};
const refOf = (name, nth = 0, onlyVisible = true) => {
  const out = oc('find', '--name', name);
  const json = out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1);
  const entries = JSON.parse(json).entries.filter(e => !onlyVisible || e.visible);
  return entries[nth]?.ref;
};

const [command, ...domains] = process.argv.slice(2);
if (!['add', 'read'].includes(command)) {
  console.error('Usage: spaceship-cart.mjs add <domain...> | read');
  process.exit(2);
}

async function add(domain) {
  oc('open', `https://www.spaceship.com/domain-search/?query=${encodeURIComponent(domain)}`, '--window', 'dedicated', '--keep-alive');
  await sleep(5000);
  const text = evalJs('document.body.innerText.slice(0,600)');
  if (!text.includes(domain)) return { domain, status: 'not-found-on-page' };
  if (/不可用|已被注册|已注册/.test(text.split(domain)[1]?.slice(0, 60) || '')) return { domain, status: 'unavailable' };
  const inCart = refOf('查看购物车');
  if (inCart && /查看购物车/.test(text.split(domain)[1]?.slice(0, 200) || '')) return { domain, status: 'already-in-cart' };
  const ref = refOf('加入购物车');
  if (!ref) return { domain, status: 'no-add-button' };
  oc('click', String(ref));
  await sleep(3000);
  return { domain, status: 'added' };
}

const findAll = (...flags) => {
  const out = oc('find', ...flags);
  const a = out.indexOf('{'), b = out.lastIndexOf('}');
  return a < 0 ? [] : (JSON.parse(out.slice(a, b + 1)).entries || []);
};

async function readDrawer() {
  oc('open', 'https://www.spaceship.com/domain-search/?query=cart-readback', '--window', 'dedicated', '--keep-alive');
  await sleep(5000);
  const cart = findAll('--css', '[data-zid=cartButton]')[0];
  if (!cart) return { error: 'cart button not found; is spaceship.com logged in?' };
  oc('click', String(cart.ref));
  await sleep(2500);
  // The recommendation drawer comes first; "继续" leads to the real cart drawer (never press 结账).
  const cont = findAll('--name', '继续').find(e => e.visible && e.role === 'button');
  if (cont) { oc('click', String(cont.ref)); await sleep(2500); }
  for (const e of findAll('--name', '详情').filter(e => e.visible && e.role === 'button')) { oc('click', String(e.ref)); await sleep(500); }
  await sleep(1200);
  // The drawer text is part of body.innerText: cut from the "N 件商品" header to the total.
  const text = evalJs('document.body.innerText');
  const i = text.search(/\d+\s*件商品/);
  return i < 0 ? text.slice(0, 1500) : text.slice(i, i + 1200);
}

try {
  if (command === 'add') {
    const results = [];
    for (const d of domains) results.push(await add(d));
    console.log(JSON.stringify(results, null, 2));
  }
  console.log(await readDrawer());
} finally {
  oc('close');
}

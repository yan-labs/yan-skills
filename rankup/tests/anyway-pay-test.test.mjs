import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/anyway/scripts/stg/pay-test.mjs', import.meta.url));
// Run the actual CLI including process.exit, with all browser/API calls intercepted.
const preload = `
import cp from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { syncBuiltinESMExports } from 'node:module';
const scenario = process.env.PAY_TEST_SCENARIO;
const baseTime = Date.parse('2026-10-25T15:40:00Z');
let now = baseTime;
Date.now = () => now;
globalThis.setTimeout = (fn, ms) => { now += ms; queueMicrotask(fn); };
let submits = 0;
let lookups = 0;
const order = {orderId:'ORD_MOCK',status:'PAID',amountCents:1990,currency:'USD',
  merchantReference:'mock-ref',paymentLinkId:'PL_MOCK',createdAt:'2026-10-25T15:40:10Z'};
if (scenario === 'unpaid') order.status = 'PENDING';
if (scenario === 'amount') order.amountCents = 1900;
if (scenario === 'currency') order.currency = 'EUR';
if (scenario === 'reference') order.merchantReference = 'other-ref';
if (scenario === 'old') order.createdAt = '2026-10-24T15:40:35Z';
if (scenario === 'future') order.createdAt = '2026-10-26T15:40:35Z';
if (scenario === 'link') order.paymentLinkId = 'PL_OTHER';
cp.execFileSync = (cmd, args) => {
  const json = x => JSON.stringify(x);
  if (cmd === 'node') {
    if (args.includes('products')) return args.includes('links') ? json(scenario === 'no-price' ? [] : [{linkId:'PL_MOCK',amount:19.9,currency:'USD'}]) : json({records:[{id:'PRODUCT_MOCK'}]});
    assertReadOnly(args);
    lookups++;
    if (scenario === 'api-error') throw new Error('API offline');
    const current = {...order, status: ['delayed','delayed-capture'].includes(scenario) && lookups < 3 ? 'PENDING' : order.status};
    if (scenario === 'readback-change' && args.includes('get')) current.status = 'PENDING';
    return args.includes('list') ? json({records:scenario === 'delayed-capture' ? [] : scenario === 'ambiguous' ? [current,{...current,orderId:'ORD_SECOND'}] : [current]}) : json(current);
  }
  if (cmd !== 'opencli') throw new Error('Unexpected external command');
  if (args[0] === 'doctor') return '[OK] Daemon\\n[OK] Extension';
  if (args.includes('close')) {
    console.error('MOCK_RECEIPT '+json({submits,lookups}));
    return '{}';
  }
  if (args.includes('click') && args.includes('[data-testid=hosted-payment-submit-button]')) {
    submits++;
    if (submits > 1) throw new Error('Duplicate payment submission');
    if (scenario === 'click-timeout') throw new Error('Click acknowledgement timed out');
    return '{}';
  }
  if (args.includes('get')) return submits && scenario !== 'no-navigation' ?
    'https://shop.invalid/success'+(scenario === 'url' ? '?anyway_order_id=ORD_MOCK' : '') : 'https://buy.stripe.com/mock';
  if (args.includes('network')) return json({entries: scenario === 'network' || scenario === 'delayed-capture' || scenario === 'stale-network' ? [{url:'https://shop.invalid/success?anyway_order_id='+ (scenario !== 'stale-network' ? 'ORD_MOCK' : 'ORD_STALE')}] : []});
  if (args.includes('eval')) {
    const js = args.at(-1);
    if (js.includes('CurrencyOptionButton')) return json({found:true,alreadyActive:true,text:'US$19.90'});
    if (js.includes('elementFromPoint')) return json({ready:true,waitedMs:0});
    const element = scenario === 'dom' ? {href:'https://shop.invalid/?anyway_order_id=ORD_MOCK'} :
      scenario === 'input' ? {value:'ORD_MOCK',dataset:{}} :
      scenario === 'data' ? {dataset:{anywayOrderId:'ORD_MOCK'}} : null;
    return runInNewContext(js, {
      location:{href:'https://shop.invalid/success'},
      performance:{getEntriesByType: type => scenario === 'performance' && type === 'navigation' ? [{name:'https://shop.invalid/success?anyway_order_id=ORD_MOCK'}] : []},
      document:{querySelectorAll:() => element ? [element] : []},
    });
  }
  if (args.includes('fill') || args.includes('select')) return json({filled:true,selected:true});
  return '{}';
};
function assertReadOnly(args) {
  if (!args.includes('orders') || !(args.includes('get') || args.includes('list'))) throw new Error('Unexpected API mutation');
  if (args.includes('list') && (!args.includes('--merchant-ref') || !args.includes('--from') || !args.includes('--to') || !args.includes('--all'))) throw new Error('Missing lookup guards');
}
syncBuiltinESMExports();
`;

function run(scenario, automaticPrice = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paytest-orderid-'));
  try {
    const hook = path.join(dir, 'mock.mjs');
    fs.writeFileSync(hook, preload);
    return spawnSync(process.execPath, ['--import', hook, script,
      '--link', 'https://stg.anyway.sh/pay/PL_MOCK', '--ref', 'mock-ref', '--email', 'test@example.invalid',
      '--timeout', '1', '--evidence-dir', dir,
      ...(automaticPrice ? [] : ['--amount-cents', '1990', '--currency', 'USD'])], {
      env: {...process.env, PAY_TEST_SCENARIO:scenario}, encoding:'utf8', timeout:10_000,
    });
  } finally { fs.rmSync(dir, {recursive:true,force:true}); }
}

for (const scenario of ['url','network','dom','input','data','performance','fallback','no-navigation','click-timeout','stale-network','delayed','delayed-capture']) {
  test(`payment resolves with ${scenario}, exits 0 and submits once`, () => {
    const result = run(scenario);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {orderId:'ORD_MOCK',status:'PAID',amountCents:1990,currency:'USD',merchantReference:'mock-ref'});
    assert.match(result.stderr, /MOCK_RECEIPT \{"submits":1,/);
    if (['url','network','dom','input','data','performance'].includes(scenario)) assert.match(result.stderr, /captured return order is PAID/);
    if (['fallback','no-navigation','click-timeout'].includes(scenario)) assert.match(result.stderr, /return URL parameter absent, recovered via Merchant API/);
  });
}
test('existing invocation resolves expected price before checkout', () => {
  const result = run('fallback', true);
  assert.equal(result.status, 0, result.stderr);
});
for (const scenario of ['unpaid','amount','currency','reference','old','future','link','ambiguous','api-error','readback-change']) {
  test(`payment rejects ${scenario} without resubmission`, () => {
    const result = run(scenario);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /MOCK_RECEIPT \{"submits":1,/);
    assert.match(result.stderr, /Payment not verified PAID|Ambiguous payment|Order changed/);
  });
}

test('unknown expected price stops before submitting payment', () => {
  const result = run('no-price', true);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Cannot resolve payment link price/);
  assert.match(result.stderr, /MOCK_RECEIPT \{"submits":0,/);
});

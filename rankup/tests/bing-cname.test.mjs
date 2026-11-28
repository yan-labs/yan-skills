import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCname, verificationBranch, ensureCname } from '../scripts/bing-cname-lib.mjs'

test('解析 Bing CNAME 且拒绝不完整文本', () => {
  const token = '0123456789abcdef0123456789abcdef'
  assert.deepEqual(parseCname(`name ${token} and value verify.bing.com.`, 'example.org'), { name: `${token}.example.org`, content: 'verify.bing.com', type: 'CNAME', proxied: false, ttl: 1 })
  assert.equal(parseCname('name abc and value verify.bing.com.', 'example.org'), null)
})
test('只在指定模式或 Google 敏感挑战时转 CNAME', () => {
  assert.equal(verificationBranch('cname'), 'cname')
  assert.equal(verificationBranch('gsc', {url:'https://accounts.google.com/signin/challenge/pk', text:''}), 'cname')
  assert.equal(verificationBranch('gsc', {url:'https://accounts.google.com/signin', password:true, text:''}), 'cname')
  assert.equal(verificationBranch('gsc', {url:'https://accounts.google.com/signin', text:'验证码'}), 'cname')
  assert.equal(verificationBranch('gsc', {url:'https://accounts.google.com/consent', text:''}), 'gsc')
})
test('Cloudflare 已有不匹配记录时不覆盖', async () => {
  const oldFetch = globalThis.fetch, oldEmail = process.env.CLOUDFLARE_EMAIL, oldKey = process.env.CLOUDFLARE_API_KEY
  process.env.CLOUDFLARE_EMAIL = 'fake@example.org'; process.env.CLOUDFLARE_API_KEY = 'fake'
  let calls = 0
  globalThis.fetch = async (url, opts) => { calls++; assert.notEqual(opts.method, 'POST'); return {ok:true, json:async()=>({success:true,result:url.includes('/zones?') ? [{name:'example.org', id:'fake'}] : [{type:'TXT'}]})} }
  try { await assert.rejects(ensureCname('example.org', {name:'abc.example.org',content:'verify.bing.com'}), /不匹配/); assert.equal(calls,2) }
  finally { globalThis.fetch = oldFetch; if (oldEmail === undefined) delete process.env.CLOUDFLARE_EMAIL; else process.env.CLOUDFLARE_EMAIL = oldEmail; if (oldKey === undefined) delete process.env.CLOUDFLARE_API_KEY; else process.env.CLOUDFLARE_API_KEY = oldKey }
})

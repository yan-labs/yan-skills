import test from "node:test";
import assert from "node:assert/strict";
import { extractCfBeaconTokens, extractCfBeaconEvidence, diagnoseCfWebAnalytics, fetchHtmlEvidence, formatSiteStatus, formatVerification } from "../scripts/cf-analytics-setup.mjs";

const TOKEN_A = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
const TOKEN_B = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";

test("extractCfBeaconTokens 从静态属性(单引号或双引号)里都能抠出 token", () => {
  const single = `<script data-cf-beacon='{"token":"${TOKEN_A}"}'></script>`;
  const double = `<script data-cf-beacon="{&quot;token&quot;: &quot;${TOKEN_A}&quot;}"></script>`;
  assert.deepEqual(extractCfBeaconTokens(single), [TOKEN_A]);
  assert.deepEqual(extractCfBeaconTokens(double), [TOKEN_A]);
});

// 回归(2026-09-13,真实项目复盘):早期版本只认 `data-cf-beacon="..."` 的静态属性
// 赋值,认不出统一延迟加载器里常见的 `setAttribute('data-cf-beacon', '{"token":...}')`
// 动态注入写法——两者字符串里都有 data-cf-beacon,但一个后面跟 `=`,一个跟函数调用的
// 逗号,旧正则匹配不上,会对这类项目误判"线上找不到任何手嵌 beacon"。
test("extractCfBeaconTokens 认得 setAttribute() 动态注入的 token", () => {
  const html = `<script>s.setAttribute('data-cf-beacon', '{"token":"${TOKEN_A}"}');document.head.appendChild(s)</script>`;
  assert.deepEqual(extractCfBeaconTokens(html), [TOKEN_A]);
});

test("extractCfBeaconTokens 认得 setAttribute() 用双引号包裹参数的写法", () => {
  const html = `s.setAttribute("data-cf-beacon", "{\\"token\\": \\"${TOKEN_A}\\"}")`;
  assert.deepEqual(extractCfBeaconTokens(html), [TOKEN_A]);
});

// 判据不关心具体语法,只认"data-cf-beacon 出现之后到下一个语法收尾符号之间
// 有没有一个 32 位十六进制串"——字符串拼接拼出来的 token 同样能抠到。
test("extractCfBeaconTokens 认得字符串拼接里的 token", () => {
  const html = `el.setAttribute('data-cf-beacon', '{"token":"' + "${TOKEN_A}" + '"}')`;
  assert.deepEqual(extractCfBeaconTokens(html), [TOKEN_A]);
});

test("extractCfBeaconTokens 找不到属性时返回空数组，不是 null/undefined", () => {
  assert.deepEqual(extractCfBeaconTokens("<html><body>no beacon here</body></html>"), []);
  assert.deepEqual(extractCfBeaconTokens(""), []);
});

test("extractCfBeaconTokens 窗口内没有十六进制 token 时记脱敏标记而不是静默丢弃", () => {
  const broken = `<script data-cf-beacon='{not a real token here}'></script>`;
  const tokens = extractCfBeaconTokens(broken);
  assert.equal(tokens.length, 1);
  assert.match(tokens[0], /^UNPARSED:/);
});

test("extractCfBeaconTokens 两次注入(重复)时返回两个 token", () => {
  const html = `
    <script data-cf-beacon='{"token":"${TOKEN_A}"}'></script>
    <script data-cf-beacon='{"token":"${TOKEN_B}"}'></script>
  `;
  assert.deepEqual(extractCfBeaconTokens(html), [TOKEN_A, TOKEN_B]);
});

test("extractCfBeaconTokens 对 token 大小写归一化为小写", () => {
  const html = `<script data-cf-beacon='{"token":"${TOKEN_A.toUpperCase()}"}'></script>`;
  assert.deepEqual(extractCfBeaconTokens(html), [TOKEN_A.toLowerCase()]);
});

test("diagnoseCfWebAnalytics: token 一致、无重复、有 beacon 时判 ok", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: TOKEN_A,
    autoInstall: false,
    tokensInHtml: [TOKEN_A], evidence: {staticAuto:0,staticManual:1,dynamicInitializers:0},
  });
  assert.equal(diag.ok, true);
  assert.equal(diag.tokenMismatch, false);
  assert.equal(diag.duplicateInjection, false);
  assert.equal(diag.noBeaconFound, false);
});

test("diagnoseCfWebAnalytics: token 比对大小写不敏感", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: TOKEN_A.toUpperCase(),
    autoInstall: false,
    tokensInHtml: [TOKEN_A], evidence: {staticAuto:0,staticManual:1,dynamicInitializers:0},
  });
  assert.equal(diag.tokenMismatch, false);
});

// 回归:代码里手嵌的 token 与后台 site_token 对不上——beacon 照样 200 加载,
// 数据流进了别的 site,这是真实项目复盘出来的坑,不能被 count>0 掩盖。
test("diagnoseCfWebAnalytics: token 不一致时判 tokenMismatch", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: TOKEN_A,
    autoInstall: false,
    tokensInHtml: [TOKEN_B], evidence: {staticAuto:0,staticManual:1,dynamicInitializers:0},
  });
  assert.equal(diag.ok, false);
  assert.equal(diag.tokenMismatch, true);
});

// API 配置不是实际注入证据；只有一条声明不能推断页面有两份脚本。
test("diagnoseCfWebAnalytics: auto_install 开启单份声明是策略冲突，不伪报重复", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: TOKEN_A,
    autoInstall: true,
    tokensInHtml: [TOKEN_A], evidence: {staticAuto:0,staticManual:1,dynamicInitializers:0},
  });
  assert.equal(diag.ok, false);
  assert.equal(diag.duplicateInjection, false);
  assert.equal(diag.configurationConflict, true);
});

test("diagnoseCfWebAnalytics: auto_install=false 且线上没有任何 beacon 时判 noBeaconFound", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: TOKEN_A,
    autoInstall: false,
    tokensInHtml: [], evidence: {staticAuto:0,staticManual:0,dynamicInitializers:0},
  });
  assert.equal(diag.ok, false);
  assert.equal(diag.noBeaconFound, true);
});

test("diagnoseCfWebAnalytics: API 没返回 site_token 时不误判 mismatch，只标 tokenKnown=false", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: null,
    autoInstall: false,
    tokensInHtml: [TOKEN_A], evidence: {staticAuto:0,staticManual:1,dynamicInitializers:0},
  });
  assert.equal(diag.tokenKnown, false);
  assert.equal(diag.tokenMismatch, false);
  // 未知不是不一致，但不能把未比对记为通过。
  assert.equal(diag.incomplete, true);
  assert.equal(diag.ok, false);
});

test("diagnoseCfWebAnalytics: UNPARSED 片段不计入有效 token 比对", () => {
  const diag = diagnoseCfWebAnalytics({
    siteToken: TOKEN_A,
    autoInstall: false,
    tokensInHtml: ["UNPARSED:garbage"], evidence: {staticAuto:0,staticManual:1,dynamicInitializers:0},
  });
  // 解析不出来的片段既不能证明 token 一致,也不能证明 beacon 缺失——
  // 它证明的是"抓到了但读不出内容",noBeaconFound 只在数组本身为空时才成立。
  assert.equal(diag.noBeaconFound, false);
  assert.equal(diag.validTokens.length, 0);
});

const automatic = `<script src="https://static.cloudflareinsights.com/beacon.min.js/v1" data-cf-beacon='{ "version":"2024.11.0", "token":"${TOKEN_A}" }'></script>`;
const manual = `<script>s.setAttribute('data-cf-beacon', '{"token":"${TOKEN_A}"}');document.head.appendChild(s);</script>`;

function diagnoseHtml(html, autoInstall = false) {
  const evidence = extractCfBeaconEvidence(html);
  return { evidence, diag: diagnoseCfWebAnalytics({siteToken: TOKEN_A, autoInstall, tokensInHtml: evidence.tokens, evidence}) };
}

test("API false 仍实际自动+手动两路径，必须失败", () => {
  const {evidence, diag} = diagnoseHtml(automatic + manual);
  assert.equal(evidence.staticAuto, 1);
  assert.equal(evidence.dynamicInitializers, 1);
  assert.equal(diag.duplicateInjection, true);
  assert.equal(diag.ok, false);
});

test("API true、只有自动脚本，不凭开关捏造手动重复", () => {
  const {evidence, diag} = diagnoseHtml(automatic, true);
  assert.equal(evidence.dynamicInitializers, 0);
  assert.equal(diag.duplicateInjection, false);
  assert.equal(diag.configurationConflict, true);
});

test("API false 单一手动路径通过 HTML 核验；注释里的旧声明忽略", () => {
  const {evidence, diag} = diagnoseHtml(manual + `<!-- ${automatic} -->` + `<script>// s.setAttribute('data-cf-beacon', '{"token":"${TOKEN_A}"}');\n/* data-cf-beacon ${TOKEN_B} */</script>`);
  assert.equal(evidence.staticAuto, 0);
  assert.equal(evidence.dynamicInitializers, 1);
  assert.equal(diag.ok, true);
});

test("两份 token 有一份匹配也不能掩盖另一份错误", () => {
  const diag = diagnoseCfWebAnalytics({siteToken:TOKEN_A, autoInstall:false, tokensInHtml:[TOKEN_A,TOKEN_B], evidence:{staticAuto:0,staticManual:2,dynamicInitializers:0}});
  assert.equal(diag.tokenMismatch, true);
  assert.equal(diag.duplicateInjection, true);
});

test("verify 请求显式采用 HTML Accept，拒绝错误状态和非 HTML", async () => {
  const result = await fetchHtmlEvidence('https://example.test/', async (url, init) => {
    assert.equal(init.headers.Accept, 'text/html');
    assert.equal(init.redirect, 'follow');
    return new Response(manual, {status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  });
  assert.equal(result.status, 200);
  for (const response of [new Response('no',{status:404}),new Response('{}',{headers:{'content-type':'application/json'}})]) {
    await assert.rejects(fetchHtmlEvidence('https://example.test/', async () => response), /没有返回成功 HTML/);
  }
});

test("status/verify 输出全脱敏，未知解析不回显原始片段", () => {
  const {evidence, diag} = diagnoseHtml(automatic + manual);
  const output = formatSiteStatus({site_token:TOKEN_A,snippet:automatic,auto_install:false}) + formatVerification({autoInstall:false,evidence,diag,status:200,contentType:'text/html',count:null});
  for (const secret of [TOKEN_A,TOKEN_B,automatic]) assert.equal(output.includes(secret),false);
  assert.match(output,/REDACTED/);
  assert.match(output,/不可用/);
  assert.equal(extractCfBeaconTokens('<script data-cf-beacon="private-value-not-hex"></script>')[0],'UNPARSED:[REDACTED]');
});

test("序列化 hydration 中的 script/初始化器字符串不是第二条可执行路径", () => {
  const serialized = JSON.stringify(`s.setAttribute('data-cf-beacon', '{"token":"${TOKEN_A}"}')`);
  const {evidence,diag} = diagnoseHtml(manual + `<script>window.payload=${serialized};</script>` + `<script type="application/json">${serialized}</script>`);
  assert.equal(evidence.dynamicInitializers,1);
  assert.equal(diag.duplicateInjection,false);
  assert.equal(diag.ok,true);
});

test("只有 token 个数不足以判断重复；复杂 HTML 注入交浏览器验证", () => {
  const unknown = diagnoseCfWebAnalytics({siteToken:TOKEN_A,autoInstall:false,tokensInHtml:[TOKEN_A,TOKEN_A]});
  assert.equal(unknown.duplicateInjection,null);
  assert.equal(unknown.ok,false);
  const {evidence,diag} = diagnoseHtml(`<script>document.head.insertAdjacentHTML('beforeend', 'data-cf-beacon');</script>`);
  assert.equal(evidence.unclassified,1);
  assert.equal(diag.incomplete,true);
});

test("脚本正文序列化的 HTML 标记和其他属性里的同名文本不当成实际标签", () => {
  const markup = JSON.stringify(automatic).replaceAll('</script>', '<\\/script>');
  const {evidence,diag} = diagnoseHtml(manual + `<script>window.html=${markup};</script>` + `<script data-example='data-cf-beacon="${TOKEN_A}"'></script>`);
  assert.equal(evidence.staticAuto,0);
  assert.equal(evidence.staticManual,0);
  assert.equal(evidence.dynamicInitializers,1);
  assert.equal(diag.ok,true);
});

test("API 安装状态缺失时保持未完成", () => {
  const evidence = extractCfBeaconEvidence(manual);
  const diag = diagnoseCfWebAnalytics({siteToken:TOKEN_A,tokensInHtml:evidence.tokens,evidence});
  assert.equal(diag.status,'needs-verification');
});

test("未支持的 beacon 配置形态记未完成，不伪报无脚本", () => {
  const {diag} = diagnoseHtml(`<script src="https://static.cloudflareinsights.com/beacon.min.js?token=${TOKEN_A}"></script>`);
  assert.equal(diag.noBeaconFound,null);
  assert.equal(diag.status,'needs-verification');
});

test("单脚本的 version 只证明特征，不证明来自边缘自动注入", () => {
  const {evidence,diag} = diagnoseHtml(automatic,false);
  assert.equal(diag.automaticBeaconObserved,true);
  assert.equal(diag.duplicateInjection,false);
  assert.equal(diag.configurationConflict,false);
  assert.equal(diag.status,'needs-verification');
  const text = formatVerification({autoInstall:false,evidence,diag,status:200,contentType:'text/html',count:null});
  assert.match(text,/来源待核/);
  assert.doesNotMatch(text,/需处理/);
});

test("JSON 数据 script 即使带 beacon 属性也不算可执行声明", () => {
  const data = automatic.replace('<script ','<script type="application/json" ');
  const {evidence,diag} = diagnoseHtml(data+manual);
  assert.equal(evidence.staticAuto,0);
  assert.equal(evidence.dynamicInitializers,1);
  assert.equal(diag.status,'pass');
});

test("格式化未知声明状态不能打印存在", () => {
  const {evidence,diag} = diagnoseHtml(`<script src="https://static.cloudflareinsights.com/beacon.min.js?token=${TOKEN_A}"></script>`);
  const text = formatVerification({autoInstall:false,evidence,diag,status:200,contentType:'text/html',count:null});
  assert.match(text,/beacon 声明：未知/);
  assert.doesNotMatch(text,/beacon 声明：存在/);
});

/**
 * similarweb-direction-and-scope.test.mjs — 2026-09-13 审计三项修复的回归测试。
 *
 * 审计报告：/private/tmp/.../scratchpad/similarweb-audit.md（本次会话产出，未提交
 * 到仓库；以下测试直接照抄审计里记录的真实 DOM 形态构造夹具，不从散文/摘要反推——
 * 这个文件自己的历史教训是「夹具照散文写、不是从真实 DOM dump 复制」曾经让同一个
 * bug漏了五次，这里的夹具全部标注了对应的审计小节）。
 *
 * 覆盖三件事：
 *   1. 涨跌方向：真实 DOM 里「变动」列的方向由 SVG 图标 + 颜色承载，
 *      innerText 只有纯数字（审计 三.核心新发现）。parseSignedPercentCell /
 *      resolveDirection 必须在没有方向信号时返回 null + directionUnknown，
 *      绝不能默认当正数。
 *   2. 时间窗口证据：deriveScopeEvidence / compareWindowToRequest 必须能把
 *      「页面实际显示的窗口 vs 请求的窗口」这件事说清楚，且读不到时是
 *      unverified，不是猜一个真假出来（审计 二.4 / 三.加载完成判定风险表）。
 *   3. 截断证据：deriveGeoRows 的 rowsExpected/rowsCaptured/truncated，以及
 *      deriveSiteKeywordRows 现在会把 partialLossColumns 真的返回出去
 *      （旧版计算了但漏在返回对象外，调用方拿到的永远是 undefined）。
 *
 * 2026-09-13 第二轮更新：用 Claude in Chrome 对 howolddoyoulook.com 实测后，
 * 上一轮标为「推断」的方向判据已经证实是**两套不同的真实机制**，不是同一套
 * 的两种写法——夹具已经按实测形态重写，不再用旧的 `{dataIcon, color}` 猜测
 * 形状（那是套在错误机制上的猜测）：
 *   - 机制 A（.swReactTable-column 系表格：audience-geo 地理/受众兴趣 PoP变化/
 *     channels 明细表，三处结构相同）：wrapper class 直接带 positive/negative，
 *     提取器判成 `hint.direction`，没有 SVG，也没有 data-icon。
 *   - 机制 B（Ant Design 行渲染表：site-keywords 唯一实测到的这一种）：
 *     `data-automation-value`（精确带符号原始比值）> `data-automation-icon-name`
 *     （"arrow-up"/"arrow-down"，fill 分别是 #4FBF40/#FF442D，两个颜色都已
 *     实测确认，上一轮"绿=升"还只是对称假设）> 颜色兜底，也统一成 hint.direction；
 *     另有特殊值 "NEW"（新词，没有上一期数据可比）用 `hint.special === 'new'`。
 * 仍待实测：国家/设备选择器已经找到稳定 class
 *（`.CountryFilter-dropdownButton-text`/`.WebSourceFilter-dropdownButton-text`），
 * 但脚本目前仍用弱文本匹配（升级为选择器读取留给下一轮）；site-keywords 主表格
 * 本身是否有独立于内容之外的加载指示器未测到确定结论。见
 * `/private/tmp/.../scratchpad/similarweb-live-dom.md` 的完整记录。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareWindowToRequest,
  deriveAudienceDemographicsSignal,
  deriveAudienceInterestsRows,
  deriveAudienceInterestsSupplemental,
  deriveAudienceOverlapDetailRows,
  deriveAudienceOverlapMetrics,
  deriveChannelDetailRows,
  deriveGeoRows,
  deriveOverviewSupplementalBlocks,
  deriveScopeEvidence,
  deriveSiteKeywordRows,
  deriveSiteKeywordStatCards,
  deriveTrendGraph,
  findTrendGraphNetworkEntry,
  findWindowLabel,
  parseNumber,
  parseSignedPercentCell,
  parseWindowLabelAmount,
  parseWindowSegment,
} from '../scripts/lib-similarweb.mjs';

/* ------------------------------------------------------------------ *
 * 1a. parseSignedPercentCell / resolveDirection —— 涨跌方向
 * ------------------------------------------------------------------ */

test('parseSignedPercentCell: 文本箭头/符号是最高优先级，无 hint 也能解析', () => {
  assert.deepEqual(parseSignedPercentCell('↑25%'), { value: 25, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('↓63%'), { value: -63, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('+6'), { value: 6, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('-1.23%'), { value: -1.23, directionUnknown: false });
});

test('parseSignedPercentCell: 占位符与空值一律 { value: null, directionUnknown: false }，不是「方向未知」', () => {
  for (const v of ['-', '—', 'N/A', '不可用', '', null, undefined]) {
    assert.deepEqual(parseSignedPercentCell(v), { value: null, directionUnknown: false }, `value=${JSON.stringify(v)}`);
  }
});

test('parseSignedPercentCell: 审计核心发现——真实 DOM 的纯数字文本(无箭头)+无 hint，必须 null+directionUnknown，绝不能默认当正数', () => {
  // 审计原文（三.核心新发现）：`cell.innerText === "63%"`，svg 数量为 1，
  // 但文本里没有任何 ↑/↓ 字符。旧代码 `isDown = /↓/.test(text) || /^-/.test(text)`
  // 在这种输入上恒为 false，于是把 63 当成正数输出——这正是这条测试要防的回归。
  const result = parseSignedPercentCell('63%');
  assert.equal(result.value, null, '不能默认当正数（旧 bug：会输出 63）');
  assert.equal(result.directionUnknown, true);
});

test('parseSignedPercentCell: hint.direction 已经由提取器判好时直接信任（机制 A/B 共用同一个统一形状）', () => {
  assert.deepEqual(parseSignedPercentCell('63%', { direction: 'down' }), { value: -63, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('7.12%', { direction: 'up' }), { value: 7.12, directionUnknown: false });
});

test('parseSignedPercentCell: 颜色 hue 是提取器判不出 direction 时的兜底——2026-09-13 实测 site-keywords 图标 fill 恰好是这两个十六进制值', () => {
  // 实测：下降图标 fill="#FF442D"，上升图标 fill="#4FBF40"（两个方向都已实测确认，
  // 不再是"只有红色下降实测过"的半套假设）。
  assert.deepEqual(parseSignedPercentCell('63%', { direction: null, fill: '#FF442D' }), { value: -63, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('7.12%', { direction: null, fill: '#4FBF40' }), { value: 7.12, directionUnknown: false });
  // rgb(...) 形式（机制 A 的 computed style 兜底）同样要认。
  assert.deepEqual(parseSignedPercentCell('63%', { direction: null, fill: 'rgb(207, 19, 34)' }), { value: -63, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('7.12%', { direction: null, fill: 'rgb(56, 158, 13)' }), { value: 7.12, directionUnknown: false });
  // 颜色不够「明显偏向某一通道」（灰色系）时不能瞎猜。
  assert.deepEqual(parseSignedPercentCell('7.12%', { direction: null, fill: 'rgb(120, 120, 120)' }), { value: null, directionUnknown: true });
});

test('parseSignedPercentCell: hint 给了但 direction 是 null、颜色也不明确——null + directionUnknown，不猜', () => {
  const result = parseSignedPercentCell('7.12%', { direction: null, fill: 'rgb(1,2,3)' });
  assert.deepEqual(result, { value: null, directionUnknown: true });
});

test('parseSignedPercentCell: 文本符号与 hint 冲突时文本赢（不能让 hint 覆盖已经明确写出来的符号）', () => {
  const result = parseSignedPercentCell('↓7.12%', { direction: 'up' });
  assert.deepEqual(result, { value: -7.12, directionUnknown: false });
});

test('parseSignedPercentCell: hint.special === "new"（site-keywords 实测的 "NEW"，新词无上一期数据可比）—— null，且不是 directionUnknown', () => {
  const result = parseSignedPercentCell('NEW', { direction: null, special: 'new' });
  assert.deepEqual(result, { value: null, directionUnknown: false });
});

test('parseSignedPercentCell: "LOST"（2026-09-13 第二轮实跑 howolddoyoulook.com 实测到的第二个特殊值，词丢失了排名/点击数据）—— 直接查文本就能识别，不依赖 hint 打没打标签', () => {
  // 实跑当场抓到过一次真实回归：这个值原来只在 hint.special 里认，
  // dirHintOf 从来没打过 'lost' 标签，8/23 行的 "LOST" 被 partialLossColumns
  // 当成解析失败报了出去——这条测试锁住"查文本本身"这条不依赖 hint 的路径。
  assert.deepEqual(parseSignedPercentCell('LOST'), { value: null, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('LOST', null), { value: null, directionUnknown: false });
  assert.deepEqual(parseSignedPercentCell('lost', { direction: 'up' }), { value: null, directionUnknown: false }, '"LOST" 即便 hint 给了方向也不该被当成一个数字');
  assert.deepEqual(parseSignedPercentCell('LOST', { direction: null, special: 'lost' }), { value: null, directionUnknown: false });
});

/* ------------------------------------------------------------------ *
 * 1b. deriveGeoRows —— 方向信号在整表流水线里的接线
 * ------------------------------------------------------------------ */

const GEO_HEADERS = ['国家/地区 (3)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'];
const geoRow = (country, share, change) => [country, share, change, '10%', '#5', '00:01:00', '2'];

test('deriveGeoRows: 无 dirHints 的纯数字变动列——null+directionUnknown，且在 directionUnknownColumns 里汇总', () => {
  const result = deriveGeoRows({ headers: GEO_HEADERS, rows: [geoRow('US', '20%', '7.12%')] });
  assert.equal(result.rows[0].changePercent, null);
  assert.equal(result.rows[0].changePercentDirectionUnknown, true);
  assert.deepEqual(result.directionUnknownColumns, [{ column: '变动', count: 1, of: 1 }]);
  // 这一类 null 不该被 suspectColumns/partialLossColumns 重复计一次——
  // 那两个信号是「格式解析不出来」，跟「方向读不出来」是不同性质的问题。
  assert.equal(result.suspectColumns.includes('变动'), false);
  assert.equal(result.partialLossColumns.some((c) => c.column === '变动'), false);
});

test('deriveGeoRows: dirHints 跟 rows 按下标对齐，方向能正确解析', () => {
  const result = deriveGeoRows({
    headers: GEO_HEADERS,
    rows: [geoRow('US', '20%', '7.12%'), geoRow('JP', '10%', '3%')],
    dirHints: [
      [null, null, { direction: 'up' }, null, null, null, null],
      [null, null, { direction: 'down' }, null, null, null, null],
    ],
  });
  assert.equal(result.rows[0].changePercent, 7.12);
  assert.equal(result.rows[0].changePercentDirectionUnknown, false);
  assert.equal(result.rows[1].changePercent, -3);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveGeoRows: 格式本身解析不出来(非占位符、非数字) 仍然走 suspectColumns/partialLossColumns，不跟 directionUnknown 混淆', () => {
  const result = deriveGeoRows({ headers: GEO_HEADERS, rows: [geoRow('US', '20%', 'garbage')] });
  assert.equal(result.rows[0].changePercent, null);
  assert.equal(result.rows[0].changePercentDirectionUnknown, false); // 不是方向问题，是数值本身解析不出来
  assert.ok(result.partialLossColumns.some((c) => c.column === '变动') || result.suspectColumns.includes('变动'));
});

test('deriveGeoRows: 占位符「-」不算方向未知，也不计入 realCount', () => {
  const result = deriveGeoRows({ headers: GEO_HEADERS, rows: [geoRow('US', '20%', '-')] });
  assert.equal(result.rows[0].changePercent, null);
  assert.equal(result.rows[0].changePercentDirectionUnknown, false);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveGeoRows: rowsExpected/rowsCaptured/truncated 跟 totalRowsOnPage/rowsRead 是同一对数字，只是审计要求的命名', () => {
  const result = deriveGeoRows({ headers: GEO_HEADERS, rows: [geoRow('US', '20%', '-')] });
  assert.equal(result.rowsExpected, 3);
  assert.equal(result.rowsCaptured, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.totalRowsOnPage, result.rowsExpected);
  assert.equal(result.rowsRead, result.rowsCaptured);
});

test('deriveGeoRows: 读满时 truncated 是 false，不是 null 或 truthy', () => {
  const rows = [geoRow('US', '33%', '-'), geoRow('JP', '33%', '-'), geoRow('DE', '34%', '-')];
  const result = deriveGeoRows({ headers: GEO_HEADERS, rows });
  assert.equal(result.rowsCaptured, 3);
  assert.equal(result.truncated, false);
});

test('deriveGeoRows: 表头总数读不到时 truncated 是 null（不知道），不是 false（不能假装「确认没截断」）', () => {
  const headersNoTotal = ['国家/地区', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'];
  const result = deriveGeoRows({ headers: headersNoTotal, rows: [geoRow('US', '20%', '-')] });
  assert.equal(result.rowsExpected, null);
  assert.equal(result.truncated, null);
});

/* ------------------------------------------------------------------ *
 * 1c. deriveSiteKeywordRows —— 方向信号 + partialLossColumns 回归
 * ------------------------------------------------------------------ */

// 表头顺序照 similarweb-query.mjs 自测夹具抄（来自真实 DOM dump，见该文件注释）：
// … 比较 | 排位 | 变动 | 热门网址 | #URL
const KW_HEADERS = ['#', '关键词 (1)', '点击量', '变动', 'KD', '意图', '规模', '平均体量', 'CPC', '零点击', '比较', '排位', '变动', '热门网址', '#URL'];
const kwRow = (clicksChange, rankChange) =>
  ['1', 'facebook', '9.9M\n0.32%', clicksChange, '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', rankChange, 'en.wikipedia.org/wiki/Facebook', '79'];

test('deriveSiteKeywordRows: 审计核心发现的直接回归——两个「变动」列都没有箭头/符号时必须 null+directionUnknown', () => {
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('25%', '6')] });
  assert.equal(result.rows[0].clicksChangePercent, null, '不能默认当正数（旧 bug：会输出 25）');
  assert.equal(result.rows[0].clicksChangePercentDirectionUnknown, true);
  assert.equal(result.rows[0].rankChangePercent, null, '不能默认当正数（旧 bug：会输出 6）');
  assert.equal(result.rows[0].rankChangePercentDirectionUnknown, true);
  const columns = result.directionUnknownColumns.map((c) => c.column).sort();
  assert.deepEqual(columns, ['排位变动', '点击量变动']);
});

test('deriveSiteKeywordRows: 有 dirHints 时两列各自独立解析方向', () => {
  const dirHints = Array(KW_HEADERS.length).fill(null);
  const changeIdxs = KW_HEADERS.reduce((acc, h, i) => (h === '变动' ? [...acc, i] : acc), []);
  dirHints[changeIdxs[0]] = { direction: 'down' }; // 点击量变动
  dirHints[changeIdxs[1]] = { direction: 'up' }; // 排位变动
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('25%', '6')], dirHints: [dirHints] });
  assert.equal(result.rows[0].clicksChangePercent, -25);
  assert.equal(result.rows[0].rankChangePercent, 6);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveSiteKeywordRows: 文本已带箭头/符号时（旧夹具形态）不受影响，直接解析', () => {
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('↑25%', '+6')] });
  assert.equal(result.rows[0].clicksChangePercent, 25);
  assert.equal(result.rows[0].rankChangePercent, 6);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveSiteKeywordRows: "NEW"（2026-09-13 实测的新词特殊值）不是丢数据，也不是 directionUnknown', () => {
  const changeIdxs = KW_HEADERS.reduce((acc, h, i) => (h === '变动' ? [...acc, i] : acc), []);
  const dirHints = Array(KW_HEADERS.length).fill(null);
  dirHints[changeIdxs[0]] = { direction: null, special: 'new' };
  dirHints[changeIdxs[1]] = { direction: 'up' };
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('NEW', '6')], dirHints: [dirHints] });
  assert.equal(result.rows[0].clicksChangePercent, null);
  assert.equal(result.rows[0].clicksChangePercentDirectionUnknown, false, '"NEW" 是一个独立状态，不是"方向读不出来"');
  assert.equal(result.directionUnknownColumns.some((c) => c.column === '点击量变动'), false);
  assert.equal(result.partialLossColumns.some((c) => c.column === '点击量变动'), false, '"NEW" 不该被当成解析失败计入丢失统计');
  assert.equal(result.suspectColumns.includes('点击量变动'), false);
});

test('deriveSiteKeywordRows: 回归——"LOST" 混在多行真实数据里时不会被 partialLossColumns 计入丢失（2026-09-13 实跑 howolddoyoulook.com 抓到的真实 bug：8/23 行的 "LOST" 被误报成解析失败）', () => {
  // 5 行：3 行正常有方向、2 行是 "LOST"（不带 hint，模拟提取器没打上 special 标签
  // 的情况——这正是实跑当时的真实状态）。
  const rows = [
    kwRow('↑10%', '+1'),
    kwRow('LOST', '+1'),
    kwRow('↓5%', '+1'),
    kwRow('LOST', '+1'),
    kwRow('↑3%', '+1'),
  ];
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows });
  assert.equal(result.rows[1].clicksChangePercent, null);
  assert.equal(result.rows[1].clicksChangePercentDirectionUnknown, false);
  assert.equal(result.partialLossColumns.some((c) => c.column === '点击量变动'), false, '"LOST" 不该被 partialLossColumns 当成解析失败');
  assert.equal(result.suspectColumns.includes('点击量变动'), false);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveSiteKeywordRows: 回归——suspectColumns:["点击量"] 的根因("< 0.01%" 份额)已修复（2026-09-13 第三轮离线排查，实跑 howolddoyoulook.com 75 行里超过一半是这个形态）', () => {
  // 真实形态："< 50\n< 0.01%"——点击量和份额都用"低于下限"写法，旧正则的份额
  // 分组只认纯数字，"<" 前缀让整行匹配失败，退到把原始多行文本整段扔给
  // swCell()（必然解析不出来），点击量整列被判 suspectColumns。
  const belowBoundRow = (clicksChange, rankChange) =>
    ['1', 'facebook', '< 50\n< 0.01%', clicksChange, '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', rankChange, 'en.wikipedia.org/wiki/Facebook', '79'];
  const rows = [belowBoundRow('↑1%', '+1'), belowBoundRow('↑1%', '+1'), belowBoundRow('↑1%', '+1')];
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows });
  assert.equal(result.rows[0].clicks, 50, '"< 50" 应该取下限值本身，不是 null');
  assert.equal(result.rows[0].clicksSharePercent, 0.01, '"< 0.01%" 应该取下限值本身，不是 null');
  assert.equal(result.suspectColumns.includes('点击量'), false, '不该再把这种合法的低于下限写法判成整列可疑');
  assert.equal(result.partialLossColumns.some((c) => c.column === '点击量'), false);
});

test('deriveSiteKeywordRows: 回归——partialLossColumns 现在真的被返回了（旧版计算了但漏在返回对象外）', () => {
  // 5 行，KD 列 3 行是解析不出来的格式（非占位符），2 行正常——超过一半，落 suspectColumns；
  // 这里改成只 1/5 行坏，落 partialLossColumns 且必须真的出现在返回值里。
  const rows = [
    kwRow('↑1%', '+1'), kwRow('↑1%', '+1'), kwRow('↑1%', '+1'), kwRow('↑1%', '+1'),
    kwRow('↑1%', '+1'),
  ];
  rows[4][4] = 'bad-kd-format'; // KD 列（下标 4）
  const result = deriveSiteKeywordRows({ headers: KW_HEADERS, rows });
  assert.ok(Array.isArray(result.partialLossColumns), 'partialLossColumns 必须存在于返回对象里');
  assert.ok(result.partialLossColumns.some((c) => c.column === 'KD'), 'KD 的部分丢失必须能在 partialLossColumns 里查到');
});

test('deriveSiteKeywordRows: rowsExpected 恒为 null（分页表没有单次读数的总行数概念），truncated 跟 morePagesAvailable 一致', () => {
  const noNext = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('↑1%', '+1')], pagination: { hasNext: false, pagerTitle: null } });
  assert.equal(noNext.rowsExpected, null);
  assert.equal(noNext.truncated, false);
  assert.equal(noNext.rowsCaptured, 1);

  const hasNext = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('↑1%', '+1')], pagination: { hasNext: true, pagerTitle: '1/5' } });
  assert.equal(hasNext.truncated, true);

  const noPagination = deriveSiteKeywordRows({ headers: KW_HEADERS, rows: [kwRow('↑1%', '+1')] });
  assert.equal(noPagination.truncated, null, '没有分页控件时是「不知道」，不是「确认没有下一页」');
});

// 2026-09-13 第六轮用 canva.com 的 paid 子 tab 实测确认的真实表头——**没有
// KD，也没有"排位"/第二个"变动"列**（付费广告没有自然排名这个概念）。
// 跟 KW_HEADERS（total/organic 子 tab，两个"变动"+KD 都有）刻意不同。
const KW_PAID_HEADERS = ['#', '关键词 (1)', '点击量', '变动', '比较', '意图', '规模', '平均体量', 'CPC', '零点击', '热门网址', '#URL'];
const kwPaidRow = (clicksChange) =>
  ['1', 'canva', '495.6K\n7.40%', clicksChange, '-', 'NAV', '72.9M', '83.6M', '$0.93', '15.29%', 'canva.com', '132'];

test('deriveSiteKeywordRows: 回归——paid 子 tab 结构性没有 KD/排位变动，不能报进 missingColumns（2026-09-13 第六轮用 canva.com 实测确认；此前会像 AdSense 条件列一样被误判成"解析失败"）', () => {
  const result = deriveSiteKeywordRows({ headers: KW_PAID_HEADERS, rows: [kwPaidRow('↑40%')] });
  assert.equal(result.missingColumns.includes('KD'), false, 'KD 是 total/organic 才有的条件列，paid 子 tab 没有不算缺');
  assert.equal(result.missingColumns.includes('排位变动'), false, '只有 1 个"变动"列时，压根没有"第二个变动"这回事，不算缺');
  assert.deepEqual(result.missingColumns, [], 'paid 子 tab 表头本来就是这个形状，不该报出任何缺失列');
  assert.equal(result.rows[0].kd, null, 'KD 列不存在，字段值是 null，不是解析失败');
  assert.equal(result.rows[0].clicksChangePercent, 40);
  assert.equal(result.rows[0].rankChangePercent, null, '这个 tab 没有排位变动这个概念');
  assert.equal(result.rows[0].rankChangePercentDirectionUnknown, false, 'rankChangeIdx 压根不存在，不能报"方向未知"，那是在暗示"有这一列但读不出方向"');
});

test('deriveSiteKeywordRows: 回归——表头里明明有"排位"这一列、但配对的"变动"被剥离时，"排位变动"仍然要报 missingColumns（不能因为放宽了 paid 子 tab 就连这条真实的抽取残缺也放过）', () => {
  // 判据是「排位」这个表头存在不存在，不是数"变动"出现几次——2026-09-13
  // 第六轮一开始按"变动"计数(>=2)实现，结果把这条本来就该报的旧回归测试
  // （模拟"排位"列还在、配对的"变动"被意外砍掉）冲掉了，改成认"排位"本身。
  const brokenHeaders = ['#', '关键词 (1)', '点击量', '变动', 'KD', '意图', '规模', '平均体量', 'CPC', '零点击', '比较', '排位', '热门网址', '#URL'];
  const result = deriveSiteKeywordRows({ headers: brokenHeaders, rows: [['1', 'facebook', '9.9M\n0.32%', '25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', 'x', '79']] });
  assert.equal(result.missingColumns.includes('排位变动'), true, '表头里明明有"排位"这一列，配对的"变动"却被剥离了——这是真实的抽取残缺，不是 paid 子 tab 那种"压根没有排位这个概念"');
});

/* ------------------------------------------------------------------ *
 * 2. 时间窗口证据：parseWindowSegment / parseWindowLabelAmount /
 *    compareWindowToRequest / deriveScopeEvidence
 * ------------------------------------------------------------------ */

test('parseWindowSegment: 拆请求 URL 里的窗口段', () => {
  assert.deepEqual(parseWindowSegment('28d'), { amount: 28, unit: 'd', raw: '28d' });
  assert.deepEqual(parseWindowSegment('6m'), { amount: 6, unit: 'm', raw: '6m' });
  assert.equal(parseWindowSegment('999'), null, '999 是国家位置参数，不是窗口，不能被误认');
  assert.equal(parseWindowSegment('*'), null);
});

test('parseWindowLabelAmount: 拆页面渲染出的两种已知窗口文案形态', () => {
  assert.deepEqual(parseWindowLabelAmount('最后 28 天数 (As of Sep 09)'), { amount: 28, unit: 'd', raw: '最后 28 天数 (As of Sep 09)' });
  assert.deepEqual(parseWindowLabelAmount('Mar 2026 - Aug 2026 (6 月)'), { amount: 6, unit: 'm', raw: 'Mar 2026 - Aug 2026 (6 月)' });
  assert.equal(parseWindowLabelAmount(null), null);
  assert.equal(parseWindowLabelAmount('随便一段不认识的文案'), null);
});

test('findWindowLabel: 四个报表实测过的窗口文案都能识别（审计二.1~二.4逐一实测过的原文）', () => {
  assert.equal(findWindowLabel(['总访问量', '最后 28 天数 (As of Sep 09)', '所有流量']), '最后 28 天数 (As of Sep 09)');
  assert.equal(findWindowLabel(['受众群体份额', 'Mar 2026 - Aug 2026 (6 月)', '所有流量']), 'Mar 2026 - Aug 2026 (6 月)');
  assert.equal(findWindowLabel(['点击量', 'Aug 2026 - Aug 2026 (1 月)', 'PoP', '全球']), 'Aug 2026 - Aug 2026 (1 月)');
  assert.equal(findWindowLabel(['一行也没有窗口文案', '另一行']), null);
});

test('compareWindowToRequest: 一致、不一致（窗口污染）、读不到，三种情形分开', () => {
  assert.equal(compareWindowToRequest('最后 28 天数 (As of Sep 09)', '28d').matches, true);
  // 审计实测的窗口污染形状：请求 1m，落地却是 6m。
  assert.equal(compareWindowToRequest('Mar 2026 - Aug 2026 (6 月)', '1m').matches, false);
  assert.equal(compareWindowToRequest(null, '28d').matches, null, '页面读不到窗口文案时是「不知道」');
  assert.equal(compareWindowToRequest('最后 28 天数 (As of Sep 09)', null).matches, null, '没有请求窗口段可比对时同样是「不知道」');
  // 单位不同(天 vs 月)本身就是不一致，即便凑巧数字一样。
  assert.equal(compareWindowToRequest('最后 6 天数 (As of Sep 09)', '6m').matches, false);
});

test('deriveScopeEvidence: 综合证据对象——一致/不一致/unverified 三态，country 不适用时不算 unverified', () => {
  const matching = deriveScopeEvidence(['总访问量', '最后 28 天数 (As of Sep 09)', '所有流量', '全球'], { requestedWindowSeg: '28d', countryApplicable: true });
  assert.equal(matching.windowMatchesRequest, true);
  assert.equal(matching.windowUnverified, false);
  assert.equal(matching.countryUnverified, false);
  assert.equal(matching.deviceUnverified, false);

  const polluted = deriveScopeEvidence(['点击量', 'Mar 2026 - Aug 2026 (6 月)', '所有流量'], { requestedWindowSeg: '1m', countryApplicable: true });
  assert.equal(polluted.windowMatchesRequest, false);
  assert.equal(polluted.windowUnverified, false, '能读到、且明确不一致——这不是 unverified，是「读到了、而且不一致」');

  const noWindowText = deriveScopeEvidence(['受众群体份额', '所有流量'], { requestedWindowSeg: '6m', countryApplicable: false });
  assert.equal(noWindowText.windowLabel, null);
  assert.equal(noWindowText.windowMatchesRequest, null);
  assert.equal(noWindowText.windowUnverified, true);
  // audience-geo 这个 tab 没有国家筛选器：countryApplicable=false 时不是 unverified，
  // 是「这个问题对这张报表没有意义」——两者不能用同一个信号表达。
  assert.equal(noWindowText.countryApplicable, false);
  assert.equal(noWindowText.countryLabelObserved, null);
  assert.equal(noWindowText.countryUnverified, false);
});

test('deriveScopeEvidence: 设备/国家文本读不到时明确 unverified，不默认「口径没变」', () => {
  const evidence = deriveScopeEvidence(['总访问量', '最后 28 天数 (As of Sep 09)'], { requestedWindowSeg: '28d', countryApplicable: true });
  assert.equal(evidence.deviceLabelObserved, false);
  assert.equal(evidence.deviceUnverified, true);
  assert.equal(evidence.countryLabelObserved, false);
  assert.equal(evidence.countryUnverified, true);
});

/* ------------------------------------------------------------------ *
 * 4. deriveChannelDetailRows —— channels 报表新补的流量来源明细表
 *    （2026-09-13 第二轮实测：跟 audience-geo 同一套 .swReactTable-column 框架）
 * ------------------------------------------------------------------ */

// 表头/行形态照实测抄：（隐式排名）/ 流量来源(N) / 流量份额 / 变动 / 来源类型 / 全球排名。
const CHANNEL_DETAIL_HEADERS = ['', '流量来源 (2)', '流量份额', '变动', '来源类型', '全球排名'];
const channelRow = (source, share, change, sourceType, rank) => ['', source, share, change, sourceType, rank];

test('deriveChannelDetailRows: 实测形态——方向走机制 A（wrapper class positive/negative），无 hint 时 null+directionUnknown', () => {
  const result = deriveChannelDetailRows({
    headers: CHANNEL_DETAIL_HEADERS,
    rows: [channelRow('Direct', '28.53%', '28.53%', 'Direct', '#500')],
  });
  assert.equal(result.rows[0].source, 'Direct');
  assert.equal(result.rows[0].trafficSharePercent, 28.53);
  assert.equal(result.rows[0].changePercent, null, '没有 hint 时不能默认当正数');
  assert.equal(result.rows[0].changePercentDirectionUnknown, true);
  assert.equal(result.rows[0].sourceType, 'Direct');
  assert.equal(result.rows[0].globalRank, 500);
});

test('deriveChannelDetailRows: 有 dirHints 时方向正确解析（实测 up/down 两个真实样本）', () => {
  const result = deriveChannelDetailRows({
    headers: CHANNEL_DETAIL_HEADERS,
    rows: [channelRow('Direct', '28.53%', '28.53%', 'Direct', '#500'), channelRow('Search', '7.37%', '49.50%', 'Search - Organic', '#12')],
    dirHints: [
      [null, null, null, { direction: 'up' }, null, null],
      [null, null, null, { direction: 'down' }, null, null],
    ],
  });
  assert.equal(result.rows[0].changePercent, 28.53);
  assert.equal(result.rows[1].changePercent, -49.5);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveChannelDetailRows: rowsExpected/rowsCaptured/truncated 跟表头总数对齐', () => {
  const result = deriveChannelDetailRows({ headers: CHANNEL_DETAIL_HEADERS, rows: [channelRow('Direct', '28.53%', '-', 'Direct', '#500')] });
  assert.equal(result.rowsExpected, 2);
  assert.equal(result.rowsCaptured, 1);
  assert.equal(result.truncated, true);
});

test('deriveChannelDetailRows: 空/缺失 cells 走安全默认，不是抛异常', () => {
  const result = deriveChannelDetailRows(null);
  assert.deepEqual(result.rows, []);
  assert.equal(result.rowsExpected, null);
  assert.equal(result.truncated, null);
});

/* ------------------------------------------------------------------ *
 * 5. deriveSiteKeywordStatCards —— site-keywords 报表新补的 5 个统计卡
 *    （2026-09-13 第二轮实测：[data-automation="preset-content"] + 祖先节点
 *    的 data-automation-button-loading 属性）
 * ------------------------------------------------------------------ */

const makeCard = (label, value, unit, loading) => ({ label, value, unit, loading });

test('deriveSiteKeywordStatCards: 5 张卡都找到、loading 都是 "false" —— 不 unverified', () => {
  const data = {
    cards: [
      makeCard('Cannibalization', '0', '关键词', 'false'),
      makeCard('长尾机会。', '34', '关键词', 'false'), // 实测部分标签带全角句号
      makeCard('SERP 充满机会。', '0', '关键词', 'false'),
      makeCard('高流量机会。', '0', '关键词', 'false'),
      makeCard('低潜力关键词', '0', '关键词', 'false'),
    ],
  };
  const result = deriveSiteKeywordStatCards(data);
  assert.equal(result.loadingUnverified, false);
  assert.equal(result.anyCardLoading, false);
  assert.equal(result.cards.longTailOpportunity.count, 34);
  // 存的是匹配用的规范标签（不带句号），不是页面原文——原文的句号只是拿来
  // 匹配前需要 normalize 掉的噪音，不是这个字段该保留的信息。
  assert.equal(result.cards.longTailOpportunity.label, '长尾机会');
  assert.deepEqual(result.missingCards, []);
});

test('deriveSiteKeywordStatCards: 少一张卡——missingCards 报出来，loadingUnverified 必须 true', () => {
  const data = { cards: [makeCard('Cannibalization', '0', '关键词', 'false')] };
  const result = deriveSiteKeywordStatCards(data);
  assert.ok(result.missingCards.length === 4);
  assert.equal(result.loadingUnverified, true);
});

test('deriveSiteKeywordStatCards: loading 属性读到 "true" —— anyCardLoading 为 true，不能假装已就绪', () => {
  const data = {
    cards: [
      makeCard('Cannibalization', '0', '关键词', 'true'),
      makeCard('长尾机会。', '34', '关键词', 'false'),
      makeCard('SERP 充满机会。', '0', '关键词', 'false'),
      makeCard('高流量机会。', '0', '关键词', 'false'),
      makeCard('低潜力关键词', '0', '关键词', 'false'),
    ],
  };
  const result = deriveSiteKeywordStatCards(data);
  assert.equal(result.anyCardLoading, true);
  assert.equal(result.cards.cannibalization.loading, true);
});

test('deriveSiteKeywordStatCards: loading 属性读不到值(null)——不能默认当 false，必须 unverified', () => {
  const data = {
    cards: [
      makeCard('Cannibalization', '0', '关键词', null),
      makeCard('长尾机会。', '34', '关键词', 'false'),
      makeCard('SERP 充满机会。', '0', '关键词', 'false'),
      makeCard('高流量机会。', '0', '关键词', 'false'),
      makeCard('低潜力关键词', '0', '关键词', 'false'),
    ],
  };
  const result = deriveSiteKeywordStatCards(data);
  assert.equal(result.cards.cannibalization.loading, null);
  assert.equal(result.loadingUnverified, true);
});

test('deriveSiteKeywordStatCards: 没有 statCards 数据(null/空)——全部 missing，unverified', () => {
  const result = deriveSiteKeywordStatCards(null);
  assert.equal(result.missingCards.length, 5);
  assert.equal(result.loadingUnverified, true);
});

/* ------------------------------------------------------------------ *
 * 6. deriveAudienceInterestsRows —— 受众兴趣 tab 的"交叉访问网站"表
 *    （2026-09-13 第三轮离线新增：跟 geography/channels 明细表同一套
 *    .swReactTable-column 框架 + 机制 A 方向判据）
 * ------------------------------------------------------------------ */

// 2026-09-13 第三轮用一个数据更丰富的对照域名只读实测确认（只读查看一次，
// 未落盘该域名到仓库）：crossVisit 是百分比（如 "86.51%"），AdSense 列不是
// 每个站点都有（大站点常常没有这一列）。
const INTERESTS_HEADERS = ['域 (2)', '行业', '全球排名', '相关性评分', '交叉访问', 'PoP变化', 'AdSense'];
const INTERESTS_HEADERS_NO_ADSENSE = ['域 (2)', '行业', '全球排名', '相关性评分', '交叉访问', 'PoP变化'];
const interestsRow = (domain, industry, rank, relevance, crossVisit, change, adsense) =>
  [domain, industry, rank, relevance, crossVisit, change, adsense];

test('deriveAudienceInterestsRows: 实测形态解析（crossVisit 是百分比）+ 方向机制 A（无 hint 时 null+directionUnknown）', () => {
  const result = deriveAudienceInterestsRows({
    headers: INTERESTS_HEADERS,
    rows: [interestsRow('youtube.com', '计算机电子技术', '#1', '85', '86.51%', '5.2%', '-')],
  });
  assert.equal(result.rows[0].domain, 'youtube.com');
  assert.equal(result.rows[0].globalRank, 1);
  assert.equal(result.rows[0].crossVisit, 86.51, 'crossVisit 实测是百分比，不是普通数字');
  assert.equal(result.rows[0].changePercent, null, '没有 hint 时不能默认当正数');
  assert.equal(result.rows[0].changePercentDirectionUnknown, true);
  assert.equal(result.rows[0].adsense, null, '"-" 占位符应该是 null');
});

test('deriveAudienceInterestsRows: 有 dirHints 时方向正确解析', () => {
  const result = deriveAudienceInterestsRows({
    headers: INTERESTS_HEADERS,
    rows: [interestsRow('youtube.com', '计算机电子技术', '#1', '85', '86.51%', '5.2%', '-')],
    dirHints: [[null, null, null, null, null, { direction: 'up' }, null]],
  });
  assert.equal(result.rows[0].changePercent, 5.2);
  assert.deepEqual(result.directionUnknownColumns, []);
});

test('deriveAudienceInterestsRows: 回归——AdSense 列不存在(大站点实测形态)时不计入 missingColumns，adsense 字段是 null', () => {
  const result = deriveAudienceInterestsRows({
    headers: INTERESTS_HEADERS_NO_ADSENSE,
    rows: [['example-portal.test', '参考资料', '#1', '90', '23.43%', '-']],
  });
  assert.equal(result.rows[0].adsense, null);
  assert.equal(result.missingColumns.includes('AdSense'), false, 'AdSense 是条件列，不是"结构变了"');
  assert.equal(result.missingColumns.length, 0);
});

test('deriveAudienceInterestsRows: 空/缺失 cells 走安全默认', () => {
  const result = deriveAudienceInterestsRows(null);
  assert.deepEqual(result.rows, []);
  assert.equal(result.totalRowsOnPage, null);
});

/* ------------------------------------------------------------------ *
 * 7. deriveAudienceOverlapMetrics —— 受众重叠 tab（文本区块，不是表格）
 *    2026-09-13 第二轮实测原文（已脱敏）："平均独立访客数" 后跟域名/数字交替对，
 *    直到 "独立受众总数" 标签 + 紧跟的总数。
 * ------------------------------------------------------------------ */

test('deriveAudienceOverlapMetrics: 实测原文形态——确认有数据', () => {
  const lines = ['受众', '平均独立访客数', 'site-a.example', '51,025', 'site-b.example', '462,211', 'site-c.example', '62,062', '独立受众总数', '564,238', '用户指南'];
  const result = deriveAudienceOverlapMetrics(lines);
  assert.equal(result.dataConfirmed, true);
  assert.equal(result.perSiteAvgVisitors.length, 3);
  assert.deepEqual(result.perSiteAvgVisitors[0], { domain: 'site-a.example', avgVisitors: 51025 });
  assert.equal(result.totalUniqueAudience, 564238);
  assert.equal(result.emptyStateObserved, false);
});

test('deriveAudienceOverlapMetrics: 两个锚点都读不到——既不是确认有数据，也不是默认确认空', () => {
  const result = deriveAudienceOverlapMetrics(['受众', 'Mar 2026 - Aug 2026 (6 月)', '所有流量']);
  assert.equal(result.dataConfirmed, false);
  assert.deepEqual(result.perSiteAvgVisitors, []);
  assert.equal(result.totalUniqueAudience, null);
});

test('deriveAudienceOverlapMetrics: 页面正面写了空态文案——emptyStateObserved 为 true', () => {
  const result = deriveAudienceOverlapMetrics(['受众', '抱歉，未找到与该搜索匹配的内容。']);
  assert.equal(result.emptyStateObserved, true);
  assert.equal(result.dataConfirmed, false);
});

/* ------------------------------------------------------------------ *
 * 7b. deriveAudienceOverlapDetailRows —— 受众重叠 tab 下方的独占/重合明细表
 *     （`.swReactTable-column` + `.swReactTable-unResizeColumn` 按列渲染）。
 *     2026-09-14 用 canva.com（2 个自动配对比站：adobe.com/figma.com）实测，
 *     下面的表头/数值逐字照抄真实 DOM 提取结果（真实域名，公开可查的基准站，
 *     不是脱敏占位）。
 * ------------------------------------------------------------------ */

test('deriveAudienceOverlapDetailRows: 实测原文形态——3 行（1 个合并对比 + 2 个两两对比），跟 knownDomains 反查全称域名', () => {
  const cells = {
    headers: ['所选网站', 'Shared audience', '共同独立访客数', '主要网站的专属独立访客', '未获取的潜在访客'],
    rows: [
      ['canva\nadobe\nfigma', '0.9%', '1.875M', '176.3M', '166.9M'],
      ['canva\nadobe', '16.8%', '36.23M', '179.0M', '158.3M'],
      ['canva\nfigma', '2.1%', '4.507M', '210.7M', '10.83M'],
      ['', '', '', '', ''], // 尾行占位（某一列比其它列多渲染一格）
    ],
    columnDepthMismatch: true,
  };
  const result = deriveAudienceOverlapDetailRows(cells, { knownDomains: ['canva.com', 'adobe.com', 'figma.com'] });
  assert.equal(result.status, 'data');
  assert.equal(result.rows.length, 3, '尾行占位应该被跳过，不当成第 4 行');
  assert.deepEqual(result.rows[0], {
    sites: ['canva.com', 'adobe.com', 'figma.com'],
    comparisonType: 'combined',
    sharedAudiencePercent: 0.9,
    sharedUniqueVisitors: 1875000,
    primaryExclusiveVisitors: 176300000,
    unrealizedPotentialVisitors: 166900000,
  });
  assert.deepEqual(result.rows[1], {
    sites: ['canva.com', 'adobe.com'],
    comparisonType: 'pairwise',
    sharedAudiencePercent: 16.8,
    sharedUniqueVisitors: 36230000,
    primaryExclusiveVisitors: 179000000,
    unrealizedPotentialVisitors: 158300000,
  });
  assert.deepEqual(result.rows[2], {
    sites: ['canva.com', 'figma.com'],
    comparisonType: 'pairwise',
    sharedAudiencePercent: 2.1,
    sharedUniqueVisitors: 4507000,
    primaryExclusiveVisitors: 210700000,
    unrealizedPotentialVisitors: 10830000,
  });
  assert.equal(result.unresolvedSiteTokens, null);
  // 算术交叉核对（跟真实实测时用 perSiteAvgVisitors 做的核对是同一个逻辑）：
  // canva-adobe 行专属+共同 ≈ canva 独立访客(215.2M)，canva-figma 行同理 ≈ 215.2M；
  // 两行的共同+未获取分别 ≈ adobe(194.6M)/figma(15.33M) 独立访客。
  assert.ok(Math.abs((result.rows[1].primaryExclusiveVisitors + result.rows[1].sharedUniqueVisitors) - 215_200_000) < 50_000);
  assert.ok(Math.abs((result.rows[2].primaryExclusiveVisitors + result.rows[2].sharedUniqueVisitors) - 215_200_000) < 50_000);
});

test('deriveAudienceOverlapDetailRows: 表格没找到——emptyStateObserved 决定是 legit-empty 还是 unresolved', () => {
  assert.equal(deriveAudienceOverlapDetailRows(null, { emptyStateObserved: true }).status, 'legit-empty');
  assert.equal(deriveAudienceOverlapDetailRows(null, { emptyStateObserved: false }).status, 'unresolved');
  assert.equal(deriveAudienceOverlapDetailRows(undefined).status, 'unresolved');
});

test('deriveAudienceOverlapDetailRows: 表头找到了但列名不认识——unresolved，不猜列', () => {
  const cells = { headers: ['域', '份额'], rows: [['canva', '1%']] };
  const result = deriveAudienceOverlapDetailRows(cells, { knownDomains: ['canva.com'] });
  assert.equal(result.status, 'unresolved');
  assert.equal(result.reason, 'headers-not-recognized');
});

test('deriveAudienceOverlapDetailRows: 短名反查不到 knownDomains——原样保留 + 计入 unresolvedSiteTokens，不悄悄丢弃', () => {
  const cells = {
    headers: ['所选网站', 'Shared audience', '共同独立访客数', '主要网站的专属独立访客', '未获取的潜在访客'],
    rows: [['canva\nunknownsite', '5%', '1M', '2M', '3M']],
  };
  const result = deriveAudienceOverlapDetailRows(cells, { knownDomains: ['canva.com'] });
  assert.equal(result.status, 'data');
  assert.deepEqual(result.rows[0].sites, ['canva.com', 'unknownsite']);
  assert.deepEqual(result.unresolvedSiteTokens, ['unknownsite']);
});

/* ------------------------------------------------------------------ *
 * 7c. deriveTrendGraph / findTrendGraphNetworkEntry —— 「随着时间的访问」
 *     趋势折线图，数据不在 DOM 里，来自独立 XHR：
 *     GET .../widgetApi/WebsiteOverview/EngagementVisits/Graph
 *     2026-09-14 用 canva.com 实测（数值已按真实响应体抄录，公开基准站数据）。
 * ------------------------------------------------------------------ */

test('findTrendGraphNetworkEntry: 从一批网络捕获里挑出趋势图那一条，不认无关的条目', () => {
  const entries = [
    { key: 'GET sim.3ue.co/api/WebsiteOverview/retailIntelligenceUpsell', url: 'https://sim.3ue.co/api/WebsiteOverview/retailIntelligenceUpsell?domain=canva.com' },
    { key: 'GET sim.3ue.co/widgetApi/WebsiteOverview/EngagementVisits/Graph#2', url: 'https://sim.3ue.co/widgetApi/WebsiteOverview/EngagementVisits/Graph?keys=canva.com,adobe.com&latest=28d', body: { Data: {} } },
  ];
  const found = findTrendGraphNetworkEntry(entries);
  assert.ok(found);
  assert.equal(found.key, 'GET sim.3ue.co/widgetApi/WebsiteOverview/EngagementVisits/Graph#2');
  assert.equal(findTrendGraphNetworkEntry([]), null);
  assert.equal(findTrendGraphNetworkEntry(null), null);
});

test('deriveTrendGraph: 实测响应体形态——逐日 {Key,Value}，求和跟页面图例的期间总访问量一致（在这条测试里核对内部自洽：totalsByDomain 就是 series 求和）', () => {
  const entry = {
    url: 'https://sim.3ue.co/widgetApi/WebsiteOverview/EngagementVisits/Graph?keys=canva.com,adobe.com&latest=28d',
    body: {
      Data: {
        'canva.com': { Total: [[{ Key: '2026-08-15', Value: 19689933.217545487 }, { Key: '2026-08-16', Value: 22654117.29636067 }]] },
        'adobe.com': { Total: [[{ Key: '2026-08-15', Value: 10000000.4 }, { Key: '2026-08-16', Value: 11000000.6 }]] },
      },
      KeysDataVerification: { 'canva.com': false, 'adobe.com': false },
    },
  };
  const result = deriveTrendGraph(entry, { primaryDomain: 'canva.com' });
  assert.equal(result.status, 'data');
  assert.deepEqual(result.domains.sort(), ['adobe.com', 'canva.com']);
  assert.equal(result.primaryDomain, 'canva.com');
  assert.deepEqual(result.comparedDomains, ['adobe.com']);
  assert.deepEqual(result.series['canva.com'], [
    { date: '2026-08-15', visits: 19689933 },
    { date: '2026-08-16', visits: 22654117 },
  ]);
  assert.equal(result.totalsByDomain['canva.com'], 19689933 + 22654117);
  assert.equal(result.totalsByDomain['adobe.com'], 10000000 + 11000001); // Math.round(10000000.4)=10000000, Math.round(11000000.6)=11000001
});

test('deriveTrendGraph: body 是原始 JSON 字符串也能解析（opencli network --raw 有时给字符串）', () => {
  const entry = { url: 'x', body: JSON.stringify({ Data: { 'canva.com': { Total: [[{ Key: '2026-08-15', Value: 100 }]] } } }) };
  const result = deriveTrendGraph(entry);
  assert.equal(result.status, 'data');
  assert.equal(result.series['canva.com'][0].visits, 100);
});

test('deriveTrendGraph: 网络条目没找到 / 响应体结构不认识——unresolved + 具体 reason，不猜数字', () => {
  assert.deepEqual(deriveTrendGraph(null), { status: 'unresolved', reason: 'network-entry-not-found', domains: null, series: null });
  assert.equal(deriveTrendGraph({ body: 'not json{' }).reason, 'body-not-json');
  assert.equal(deriveTrendGraph({ body: { NotData: {} } }).reason, 'no-data-field');
  assert.equal(deriveTrendGraph({ body: { Data: { 'canva.com': { Total: [] } } } }).reason, 'empty-series');
});

/* ------------------------------------------------------------------ *
 * 8. deriveAudienceDemographicsSignal —— 受众人口特征 tab
 *    （2026-09-13 第二轮实测样本数据不全，本函数只实现粗粒度三态信号，
 *    不是完整提取器——见函数顶部注释）
 * ------------------------------------------------------------------ */

test('deriveAudienceDemographicsSignal: 实测原文形态（样本数据不全）—— 章节标题找到了，但既非确认有数据也非确认空', () => {
  const lines = ['受众', '各受众群体的流量和参与度', '女性', '18-24岁', '抱歉，未找到与该搜索匹配的内容。'];
  const result = deriveAudienceDemographicsSignal(lines);
  assert.equal(result.sectionAnchorFound, true);
  // 注意：这条原文其实同时包含了空态文案，NO_DATA 类正则应该认得出来。
  assert.equal(result.emptyStateObserved, true);
  assert.equal(result.hasGenderSplit, false, '"女性" 后面没有紧跟百分比，粗糙的启发式正则认不出来——这是已知局限，不是 bug');
});

test('deriveAudienceDemographicsSignal: 命中性别分布启发式——确认有部分数据', () => {
  const lines = ['受众', '各受众群体的流量和参与度', '女性', '45%', '男性', '55%'];
  const result = deriveAudienceDemographicsSignal(lines);
  assert.equal(result.hasGenderSplit, true);
  assert.equal(result.genderFemalePercent, 45);
  assert.equal(result.dataConfirmed, true);
});

test('deriveAudienceDemographicsSignal: 回归——2026-09-13 第三轮实测确认的完整真实结构（性别英文标签/年龄分布/分段表），已脱敏域名和数字', () => {
  // 原文结构逐行照抄真实实测（只读对照站点，未落盘到仓库），域名和数字换成
  // 占位值——性别标签实测是英文 "Male"/"Female"（面板整体中文 UI 也不翻译）。
  const lines = [
    '受众', 'Mar 2026 - Aug 2026 (6 月)', '所有流量', '反馈', '地理', '受众人口特征', '受众兴趣', '受众重叠',
    'Male', '59.59%', 'Female', '40.41%',
    '20.46%​20.46%', '25.74%​25.74%', '18.65%​18.65%', '15.17%​15.17%', '11.47%​11.47%', '8.52%​8.52%',
    '18-24', '25-34', '35-44', '45-54', '55-64', '65+',
    '各受众群体的流量和参与度', '女性', '18-24岁',
    '域', '竞争对手份额', '受众群体份额', '访问持续时间', '页面数/访问', '跳出率',
    'example-site.test', '100%', '7.2%', '00:03:08', '3.2', '54.72%',
    '用户指南',
  ];
  const result = deriveAudienceDemographicsSignal(lines);
  assert.equal(result.sectionAnchorFound, true);
  assert.equal(result.dataConfirmed, true);
  assert.equal(result.genderMalePercent, 59.59);
  assert.equal(result.genderFemalePercentConfirmed, 40.41);
  assert.ok(result.ageDistribution, '年龄分布应该解析出来，不是 null');
  assert.deepEqual(result.ageDistribution, [
    { bracket: '18-24', percent: 20.46 },
    { bracket: '25-34', percent: 25.74 },
    { bracket: '35-44', percent: 18.65 },
    { bracket: '45-54', percent: 15.17 },
    { bracket: '55-64', percent: 11.47 },
    { bracket: '65+', percent: 8.52 },
  ]);
  assert.ok(result.segment, '分段表应该解析出来，不是 null');
  assert.equal(result.segment.genderFilter, '女性');
  assert.equal(result.segment.ageFilter, '18-24岁');
  assert.equal(result.segment.domain, 'example-site.test');
  assert.equal(result.segment.competitorSharePercent, 100);
  assert.equal(result.segment.audienceSharePercent, 7.2);
  assert.equal(result.segment.visitDurationSeconds, 188);
  assert.equal(result.segment.pagesPerVisit, 3.2);
  assert.equal(result.segment.bounceRatePercent, 54.72);
});

test('deriveAudienceDemographicsSignal: 年龄分布/分段表结构对不上时安全返回 null，不猜', () => {
  const result = deriveAudienceDemographicsSignal(['各受众群体的流量和参与度', 'Male', '50%', 'Female', '50%']);
  assert.equal(result.ageDistribution, null);
  assert.equal(result.segment, null);
  assert.equal(result.dataConfirmed, true, '性别数据本身还是解析出来了');
});

test('deriveAudienceDemographicsSignal: 章节标题都没读到——三态里的"未加载/结构不认识"', () => {
  const result = deriveAudienceDemographicsSignal(['受众', 'Mar 2026 - Aug 2026 (6 月)']);
  assert.equal(result.sectionAnchorFound, false);
  assert.equal(result.emptyStateObserved, false);
  assert.equal(result.dataConfirmed, false);
});

/* ------------------------------------------------------------------ *
 * 8. deriveOverviewSupplementalBlocks / deriveAudienceInterestsSupplemental
 *    —— 2026-09-13 第五轮离线补抓（不许开浏览器）："网站表现"页 + 受众兴趣
 *    tab 里此前记在 NOT_COVERED 里的区块，全部用本轮之前实跑
 *    howolddoyoulook.com 时已经拿到的真实 rawText 片段还原。每个区块四态之一：
 *    data / legit-empty / locked / confirmed-absent / unresolved（找到锚点
 *    但形状对不上任何已知态时如实报，不猜）。
 * ------------------------------------------------------------------ */

// 下面这段是 howolddoyoulook.com 网站表现页 2026-09-13 实跑抓到的真实 rawText
// （按 \n+ 切分、trim、filter(Boolean) 之后的形态，跟 similarweb-query.mjs
// 实际喂给这些函数的输入一致）——不是编的，是从会话记录里原样复制的。
const PERF_LINES = `快速搜索
CTRL+K
网站分析
流量与互动
流量来源渠道
受众
显示广告
社交
howolddoyoulook.com
添加要比较的网站
网站表现
PDF
最后 28 天数 (As of Sep 09)
全球
所有流量
Include Subdomains
反馈
总访问量
Aug 2026 - Sep 2026
全球
74,190
设备分发
Aug 2026 - Sep 2026
全球
Desktop
20.30%
Mobile Web
79.70%
全球排名
#282,277
地理
热门国家/地区
Last 28 days (As of Sep 09)
所有流量
国家/地区
美国
印度
英国
爱尔兰
加拿大
流量来源
24.45%
19.12%
11.72%
9.77%
8.14%
变动
-
-
-
-
-
查看更多国家/地区
流量来源渠道
Last 28 days (As of Sep 09)
全球
所有流量
直接
自然搜索
付费搜索
外链
自然社媒
付费社交媒体
生成式 AI
0%
20%
40%
60%
26.62%
44.39%
N/A
27.46%
0.89%
N/A
0.64%
查看完整概况
自然搜索
自然搜索构成网站流量的 44.39%
品牌 vs.非品牌
Aug 2026
全球
所有流量
品牌
0%
非品牌
100%
查看搜索概况
热门自然非品牌搜索词
Aug 2026
全球
所有流量
how old do i lookAds
age guesserAds
how old am i photoAds
whats my age pictureAds
how handsome am i photo analyser for ageAds
52.30%
12.97%
4.95%
3.01%
2.59%
10.60%
494.59%
154.55%
-
-
查看更多搜索词
付费搜索
付费搜索构成网站流量的 <1%
热门付费非品牌搜索词
没有结果
尝试扩大您的参数量或搜索其他内容。
外链
外链流量构成网站流量的 27.46%
热门外链网站
Last 28 days (As of Sep 09)
全球
所有流量
域
Referral
共享
100%
变动
-
See more referrals
热门外链行业
Last 28 days (As of Sep 09)
全球
所有流量
没有结果
尝试其他网站、日期范围或国家/地区
出站流量
热门链接目的地
Last 28 days (As of Sep 09)
全球
所有流量
没有结果
尝试其他网站、日期范围或国家/地区
导出广告
领先广告主
Last 28 days (As of Sep 09)
全球
所有流量
域
adobe.com
akakce.com
booking.com
dell.com
delltechnologies.com
共享
0%
0%
0%
0%
0%
变动
-
-
-
-
-
查看更多发布商数据
社交
社交流量构成网站流量的 <1%
Last 28 days (As of Sep 09)
全球
所有流量
抱歉，未找到与该搜索匹配的内容。
选择其他过滤器，获取更多结果。
查看完整概况
显示广告
展示型广告构成网站流量的 <1%
热门媒体
Last 28 days (As of Sep 09)
全球
所有流量
没有结果
尝试其他网站、日期范围或国家/地区
用户指南`
  .split(/\n+/).map((l) => l.trim()).filter(Boolean);

test('deriveOverviewSupplementalBlocks: 回归——2026-09-13 第五轮实测确认的"网站表现"页完整真实结构', () => {
  const r = deriveOverviewSupplementalBlocks(PERF_LINES);

  assert.equal(r.deviceSplit.status, 'data');
  assert.deepEqual(r.deviceSplit.devices, [
    { label: 'Desktop', percent: 20.3 },
    { label: 'Mobile Web', percent: 79.7 },
  ]);

  assert.equal(r.brandVsNonBrand.status, 'data');
  assert.equal(r.brandVsNonBrand.brandPercent, 0);
  assert.equal(r.brandVsNonBrand.nonBrandPercent, 100);

  assert.equal(r.topOrganicKeywords.status, 'data');
  assert.equal(r.topOrganicKeywords.keywords.length, 5);
  assert.equal(r.topOrganicKeywords.keywords[0].keyword, 'how old do i look', 'Ads 后缀应该被剥掉');
  assert.equal(r.topOrganicKeywords.keywords[0].sharePercent, 52.3);
  assert.equal(r.topOrganicKeywords.keywords[0].changePercent, 10.6);
  assert.equal(r.topOrganicKeywords.keywords[0].changePercentDirectionUnknown, true, '文本卡片没有配色/箭头证据，不能默认当正数');
  assert.equal(r.topOrganicKeywords.keywords[3].changePercent, null, '"-" 表示无可比数据');
  assert.equal(r.topOrganicKeywords.keywords[3].changePercentDirectionUnknown, false);

  assert.equal(r.topPaidKeywords.status, 'legit-empty', '"没有结果"+引导语是页面正面的空态文案');

  assert.equal(r.referralSites.status, 'data');
  assert.deepEqual(r.referralSites.rows, [{ label: 'Referral', sharePercent: 100, changePercent: null, changePercentDirectionUnknown: false, changeIsNew: null }]);

  assert.equal(r.referralIndustries.status, 'legit-empty');
  assert.equal(r.outboundDestinations.status, 'legit-empty');
  assert.equal(r.socialBreakdown.status, 'legit-empty');

  assert.equal(r.displayAdvertisers.status, 'data');
  assert.equal(r.displayAdvertisers.rows.length, 5);
  assert.deepEqual(r.displayAdvertisers.rows.map((row) => row.label), ['adobe.com', 'akakce.com', 'booking.com', 'dell.com', 'delltechnologies.com']);
  assert.ok(r.displayAdvertisers.rows.every((row) => row.sharePercent === 0 && row.changePercent === null));

  assert.equal(r.geoTop5.status, 'data');
  assert.equal(r.geoTop5.rows.length, 5);
  assert.equal(r.geoTop5.rows[0].label, '美国');
  assert.equal(r.geoTop5.rows[0].sharePercent, 24.45);

  assert.equal(r.channelSummary.status, 'data');
  assert.deepEqual(r.channelSummary.channels, [
    { label: '直接', sharePercent: 26.62 },
    { label: '自然搜索', sharePercent: 44.39 },
    { label: '付费搜索', sharePercent: null },
    { label: '外链', sharePercent: 27.46 },
    { label: '自然社媒', sharePercent: 0.89 },
    { label: '付费社交媒体', sharePercent: null },
    { label: '生成式 AI', sharePercent: 0.64 },
  ], '坐标轴刻度数量不固定，但取"停止锚点前最后 n 个值"这条规则跟已知渠道名个数对齐，能正确跳过坐标轴噪声');

  assert.deepEqual(r.channelShareOverall, {
    organicSearch: 44.39, paidSearch: 1, referral: 27.46, social: 1, display: 1,
  });
});

test('deriveOverviewSupplementalBlocks: 锚点完全没出现——confirmed-absent，不是 unresolved', () => {
  const r = deriveOverviewSupplementalBlocks(['网站表现', '总访问量', '74,190']);
  assert.equal(r.deviceSplit.status, 'confirmed-absent');
  assert.equal(r.brandVsNonBrand.status, 'confirmed-absent');
  assert.equal(r.topOrganicKeywords.status, 'confirmed-absent');
  assert.equal(r.referralSites.status, 'confirmed-absent');
  assert.equal(r.channelSummary.status, 'confirmed-absent');
});

test('deriveOverviewSupplementalBlocks: 锚点找到了，但形状不认识——unresolved，不猜结构凑覆盖率', () => {
  const lines = ['设备分发', '这是一段没见过的新文案', '全球排名'];
  const r = deriveOverviewSupplementalBlocks(lines);
  assert.equal(r.deviceSplit.status, 'unresolved');

  const brandLines = ['品牌 vs.非品牌', '改版后的新布局，找不到"品牌"/"非品牌"这两个词', '查看搜索概况'];
  assert.equal(deriveOverviewSupplementalBlocks(brandLines).brandVsNonBrand.status, 'unresolved');

  // 域/共享/变动三个表头都在，但行数对不齐（份额只给了 2 行，域名给了 3 行）——
  // 不能瞎凑，报 unresolved。
  const advLines = ['领先广告主', '域', 'a.com', 'b.com', 'c.com', '共享', '0%', '0%', '变动', '-', '-', '查看更多发布商数据'];
  assert.equal(deriveOverviewSupplementalBlocks(advLines).displayAdvertisers.status, 'unresolved');
});

test('deriveOverviewSupplementalBlocks: 命中解锁/付费墙提示——locked（本轮真实样本没遇到过，但检测逻辑要在，不能被误判成别的态）', () => {
  const lines = ['设备分发', '解锁长达 15 个月 的历史数据', '全球排名'];
  assert.equal(deriveOverviewSupplementalBlocks(lines).deviceSplit.status, 'locked');
});

// 受众兴趣 tab 的行业分布/话题词云——同样是 2026-09-13 第五轮实测确认的真实
// rawText（脱敏说明见 deriveAudienceDemographicsSignal 旁边的历史注释：这次
// 用的是本站自己的域名 howolddoyoulook.com，不是对照域名，不需要脱敏）。
const INTERESTS_SUPPLEMENTAL_LINES = `受众
Mar 2026 - Aug 2026 (6 月)
全球
所有流量
地理
受众人口特征
受众兴趣
受众重叠
howolddoyoulook.com的访问者的浏览习惯
所有行业
行业分布
计算机电子技术 > 社交网络和在线社区
计算机电子技术 > 搜索引擎
艺术与娱乐 > 电视、电影和流媒体
计算机电子技术 > 电子邮件
AI Chatbots and Tools
其它
howolddoyoulook.com
30.70%
18.43%
14.53%
12.09%
10.99%
13.26%
话题分布
share
social
social media
video
youtube videos
youtube
videos
news
news aggregators
reddit
instagram
iphone
photo
sharing
beautiful
fast
feed
facebook
people
friends
article
导出 Excel
0 已选择
添加到列表`
  .split(/\n+/).map((l) => l.trim()).filter(Boolean);

test('deriveAudienceInterestsSupplemental: 回归——行业分布(带 domain 精确定位)+ 话题词云', () => {
  const r = deriveAudienceInterestsSupplemental(INTERESTS_SUPPLEMENTAL_LINES, { domain: 'howolddoyoulook.com' });
  assert.equal(r.industryDistribution.status, 'data');
  assert.deepEqual(r.industryDistribution.industries, [
    { category: '计算机电子技术 > 社交网络和在线社区', percent: 30.7 },
    { category: '计算机电子技术 > 搜索引擎', percent: 18.43 },
    { category: '艺术与娱乐 > 电视、电影和流媒体', percent: 14.53 },
    { category: '计算机电子技术 > 电子邮件', percent: 12.09 },
    { category: 'AI Chatbots and Tools', percent: 10.99 },
    { category: '其它', percent: 13.26 },
  ]);
  assert.equal(r.topicCloud.status, 'data');
  assert.equal(r.topicCloud.topics.length, 21);
  assert.equal(r.topicCloud.topics[0], 'share');
  assert.equal(r.topicCloud.topics.at(-1), 'article');
  assert.equal(r.topicCloud.topicsOrderConfidence, 'dom-order-not-confirmed-as-rank', '词云没有可读权重，不假装是排好序的排行榜');
});

test('deriveAudienceInterestsSupplemental: 不传 domain 时走位置退化路径，跟带 domain 的结果一致', () => {
  const withDomain = deriveAudienceInterestsSupplemental(INTERESTS_SUPPLEMENTAL_LINES, { domain: 'howolddoyoulook.com' });
  const withoutDomain = deriveAudienceInterestsSupplemental(INTERESTS_SUPPLEMENTAL_LINES);
  assert.deepEqual(withoutDomain.industryDistribution, withDomain.industryDistribution);
});

test('deriveAudienceInterestsSupplemental: 锚点缺失——confirmed-absent', () => {
  const r = deriveAudienceInterestsSupplemental(['受众', '受众兴趣']);
  assert.equal(r.industryDistribution.status, 'confirmed-absent');
  assert.equal(r.topicCloud.status, 'confirmed-absent');
});

/* ------------------------------------------------------------------ *
 * 9. 2026-09-13 第六轮：用数据丰富的 canva.com 实测，补上"网站表现"页
 *    此前只见过空态样本、结构一直没看清的三个区块（热门外链行业/出站流量
 *    热门链接目的地/社交细分），新发现并补实现了一个完全漏抓的区块
 *    （显示广告→热门媒体），以及 parseNumber 的负数支持。
 * ------------------------------------------------------------------ */

test('parseNumber: 回归——负数是真实值，不是占位符（canva.com 实测"热门媒体"变动列 "-96%"）', () => {
  assert.equal(parseNumber('-96'), -96);
  assert.equal(parseNumber('-1.5'), -1.5);
  assert.equal(parseNumber('-'), null, '"-" 独占整个字符串仍然是占位符，不是负数');
  assert.equal(parseNumber('5'), 5, '正数不受影响');
});

test('deriveOverviewSupplementalBlocks: 回归——2026-09-13 第六轮用 canva.com 实测确认的三个此前只见过空态的区块 + 新发现的"热门媒体"', () => {
  const lines = [
    '社交',
    '社交流量构成网站流量的 6.13%',
    'Mar 2026 - Aug 2026', '全球', '所有流量',
    'Youtube', 'Facebook', 'Facebook Messenger', 'Linkedin', 'Pinterest', 'Other',
    '0%', '50%', '100%',
    '55.46%', '31.35%', '3.26%', '2.20%', '2.03%', '5.70%',
    '查看完整概况',
    '显示广告',
    '展示型广告构成网站流量的 <1%',
    '热门媒体',
    'Mar 2026 - Aug 2026', '全球', '所有流量',
    '发布商',
    'microsoft.com', 'crazygames.com', 'teams.cloud.microsoft', 'userstyles.org', 'ecosia.org',
    '共享',
    '7.62%', '7.53%', '3.25%', '3.07%', '2.91%',
    '变动',
    '51%', '739%', '46%', '新', '-96%',
    '查看更多媒体',
    '热门外链行业',
    'Mar 2026 - Aug 2026', '全球', '所有流量',
    '网站类别',
    'Education', 'Graphics Multimedia and Web Design', 'Photography',
    '流量份额',
    '14.57%', '14.14%', '5.66%',
    '查看更多外链行业',
    '出站流量',
    '热门链接目的地',
    'Mar 2026 - Aug 2026', '全球', '所有流量',
    'Domain',
    'google.com', 'youtube.com', 'chatgpt.com',
    '共享',
    '45.39%', '6.39%', '4.39%',
    '变动',
    '9.94%', '15.62%', '-',
    '查看更多导出链接',
  ];
  const r = deriveOverviewSupplementalBlocks(lines);

  assert.equal(r.socialBreakdown.status, 'data');
  assert.deepEqual(r.socialBreakdown.platforms, [
    { label: 'Youtube', sharePercent: 55.46 },
    { label: 'Facebook', sharePercent: 31.35 },
    { label: 'Facebook Messenger', sharePercent: 3.26 },
    { label: 'Linkedin', sharePercent: 2.2 },
    { label: 'Pinterest', sharePercent: 2.03 },
    { label: 'Other', sharePercent: 5.7 },
  ], '平台名是开放词表（两次实测遇到过不同的平台组合），不能靠固定名单，"构成网站流量的"那句噪声也必须被滤掉，不能被当成第一个标签');

  assert.equal(r.topMediaPublishers.status, 'data', '此前完全没实现过——"显示广告→热门媒体"跟"导出广告→领先广告主"是页面上两个不同的区块，第五轮把两者搞混了');
  assert.equal(r.topMediaPublishers.rows.length, 5);
  assert.equal(r.topMediaPublishers.rows[0].changePercent, 51);
  assert.equal(r.topMediaPublishers.rows[3].changeIsNew, true, '"新"是"上一期没有可比数据"的第三态，不是"没有变动"');
  assert.equal(r.topMediaPublishers.rows[3].changePercent, null);
  assert.equal(r.topMediaPublishers.rows[4].changePercent, -96, '负数变动必须解析出真实值，不能因为带负号就被当成占位符');

  assert.equal(r.referralIndustries.status, 'data', '第五轮只见过这个区块的空态，误以为跟 3 列组件同构；实测确认只有 2 列');
  assert.deepEqual(r.referralIndustries.rows, [
    { label: 'Education', sharePercent: 14.57 },
    { label: 'Graphics Multimedia and Web Design', sharePercent: 14.14 },
    { label: 'Photography', sharePercent: 5.66 },
  ]);

  assert.equal(r.outboundDestinations.status, 'data', '第五轮只见过空态；实测确认是 3 列，但列头是英文 "Domain" 不是"域"');
  assert.equal(r.outboundDestinations.rows[0].label, 'google.com');
  assert.equal(r.outboundDestinations.rows[2].changePercent, null, '"-" 仍然是占位符');
});

test('deriveOverviewSupplementalBlocks: 「显示广告→热门媒体」缺列头文字时——不把「导出广告→领先广告主」误当成同一个区块', () => {
  const lines = ['导出广告', '领先广告主', '域', 'adobe.com', '共享', '10%', '变动', '-', '查看更多发布商数据'];
  const r = deriveOverviewSupplementalBlocks(lines);
  assert.equal(r.displayAdvertisers.status, 'data');
  assert.equal(r.topMediaPublishers.status, 'confirmed-absent', '这份样本压根没有"热门媒体"这个区块，不能因为"领先广告主"抓到了就当热门媒体也确认过');
});

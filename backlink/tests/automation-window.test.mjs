/**
 * lib-automation-window.mjs 的离线测试（2026-09-14）。
 *
 * 钉住的行为：
 *   - 虚拟屏幕检测：按名称匹配、只认非主屏（孤单一块屏时例外）、Cocoa 坐标换算按
 *     全局原点 (0,0) 定主屏，不依赖数组下标；
 *   - 检测不到 / 配置关闭 ⇒ fallback，且不对 Chrome 做任何写操作；
 *   - 窗口不在虚拟屏上 ⇒ 移一次，目标矩形落在虚拟屏内；
 *   - 窗口里有非 opencli 标签页（用户窗口）⇒ 绝不 set bounds；
 *   - hidden 恢复有上限；运行中虚拟屏幕断开 ⇒ 降级为 fallback；
 *   - 窗口策略解析：默认 virtual-display、显式四档原样透传；
 *   - dedicated：支持+找到匹配屏 ⇒ 走 dedicated（从不 setWindowBounds/closeSession）；
 *     旧 CLI/旧扩展/不支持/无匹配屏 ⇒ 与接入前完全一致的 JXA+osascript 调用序列；
 *     dedicated 下 hidden ⇒ windowEnsure 重新摆放 + tab select；displayFound=false ⇒ fallback；
 *   - 源码级守卫：本模块不含任何会把 Chrome 抬到前台的指令。
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DISPLAY_MATCH, VIRTUAL_DISPLAY_WINDOW,
  chooseTabTarget, classifyWindowTabs, createAutomationWindow, createFrontmostSampler, detectDedicatedSupport,
  fallbackHint, findSessionEntry, pickAutomationDisplay, pickDedicatedDisplay, plainAutomationSummary,
  resolveDisplayMatcher, resolveWindowStrategy, sanitizeSlot, targetWindowBounds, toGlobalTopLeft, windowCenterInDisplay,
} from '../scripts/lib-automation-window.mjs';

const PRIMARY = { name: 'Built-in Display', x: 0, y: 0, w: 1512, h: 982 };
const VIRTUAL = { name: '虚拟 16:9', x: -2560, y: 982, w: 2560, h: 1440 };
const SESSION = 'tool-nav';

/* ---------------- 纯函数 ---------------- */

test('toGlobalTopLeft: Cocoa bottom-left frames become global top-left rects (primary height is the pivot)', () => {
  const [p, v] = toGlobalTopLeft([PRIMARY, VIRTUAL]);
  assert.equal(p.primary, true);
  assert.deepEqual(p.bounds, { x: 0, y: 0, width: 1512, height: 982 });
  assert.equal(v.primary, false);
  assert.deepEqual(v.bounds, { x: -2560, y: -1440, width: 2560, height: 1440 });
});

test('pickAutomationDisplay: matches a non-primary screen by name; the primary is excluded whenever a second screen exists', () => {
  const screens = toGlobalTopLeft([{ ...PRIMARY, name: 'Virtual main' }, VIRTUAL]);
  assert.equal(pickAutomationDisplay(screens, DEFAULT_DISPLAY_MATCH).name, '虚拟 16:9');
  assert.equal(pickAutomationDisplay(toGlobalTopLeft([PRIMARY, { name: 'DELL U2720Q', x: 1512, y: 0, w: 2560, h: 1440 }]), DEFAULT_DISPLAY_MATCH), null);
  assert.equal(pickAutomationDisplay(toGlobalTopLeft([PRIMARY, { name: 'Virtual Display', x: 1512, y: 0, w: 1920, h: 1080 }]), DEFAULT_DISPLAY_MATCH).name, 'Virtual Display');
});

// 2026-09-14 复核实测：物理主屏熄屏/锁屏后 NSScreen.screens 可能只剩配置好的虚拟屏，
// 它会顶替占据全局原点、被 toGlobalTopLeft 标成 primary:true——这不代表它是用户真正
// 在用的主屏，只是恰好独占了原点。只有这一块屏时应当照用，不能因为 primary 就拒绝；
// 但只要还有第二块屏在（不管它叫什么名字），主屏永远不会被选中——上面那条测试钉住的
// 就是这条线没有因为这次例外而松动。
test('pickAutomationDisplay: exception — a sole surviving screen may be used even though it reads as primary', () => {
  const soleVirtual = toGlobalTopLeft([{ ...PRIMARY, name: '虚拟 16:9' }]);
  assert.equal(soleVirtual[0].primary, true, 'the only screen always occupies the global origin');
  assert.equal(pickAutomationDisplay(soleVirtual, DEFAULT_DISPLAY_MATCH).name, '虚拟 16:9');
  // 名字不匹配的孤单主屏——真正的、唯一的用户屏幕——仍然不会被选中。
  assert.equal(pickAutomationDisplay(toGlobalTopLeft([PRIMARY]), DEFAULT_DISPLAY_MATCH), null);
});

// 2026-09-14 复核实测：多屏重连后 NSScreen.screens 的下标顺序可能变化，虚拟屏排到
// index 0、真主屏排到 index 1 都发生过。换算基准和"谁是主屏"必须按 Cocoa 的全局原点
// (0,0) 判定，不能依赖数组下标——否则会把虚拟屏错判成主屏（被排除），把真主屏错判成
// 非主屏（可能被当成自动化屏移动，正是这套模块最不能犯的错）。
test('toGlobalTopLeft / pickAutomationDisplay: array order does not decide which screen is primary', () => {
  const reordered = toGlobalTopLeft([VIRTUAL, PRIMARY]); // 虚拟屏在 index 0，真主屏在 index 1
  const [v, p] = reordered;
  assert.equal(p.primary, true, 'the screen at the Cocoa origin (0,0) is primary regardless of array index');
  assert.equal(v.primary, false);
  assert.deepEqual(p.bounds, { x: 0, y: 0, width: 1512, height: 982 }, 'flip pivot still uses the real primary height');
  assert.deepEqual(v.bounds, { x: -2560, y: -1440, width: 2560, height: 1440 });
  assert.equal(pickAutomationDisplay(reordered, DEFAULT_DISPLAY_MATCH).name, '虚拟 16:9');
});

test('resolveDisplayMatcher: flag > env > default; off disables; /re/ is a regex; plain text is a case-insensitive substring', () => {
  assert.equal(resolveDisplayMatcher({ env: {} }).source, 'default');
  assert.equal(resolveDisplayMatcher({ env: { BACKLINK_AUTOMATION_DISPLAY: 'off' } }).disabled, true);
  const env = resolveDisplayMatcher({ env: { BACKLINK_AUTOMATION_DISPLAY: 'dummy' } });
  assert.equal(env.source, 'env');
  assert.ok(env.matcher.test('HDMI Dummy Plug'));
  const flag = resolveDisplayMatcher({ flag: '/^side\\s/i', env: { BACKLINK_AUTOMATION_DISPLAY: 'dummy' } });
  assert.equal(flag.source, 'flag');
  assert.ok(flag.matcher.test('Side panel'));
  assert.ok(!flag.matcher.test('HDMI Dummy Plug'));
  assert.ok(resolveDisplayMatcher({ flag: 'a.b', env: {} }).matcher.test('A.B screen'), 'substring is escaped');
  assert.ok(!resolveDisplayMatcher({ flag: 'a.b', env: {} }).matcher.test('axb'));
});

test('windowCenterInDisplay / targetWindowBounds: target rect lies inside the display and reads as on-display', () => {
  const [, display] = toGlobalTopLeft([PRIMARY, VIRTUAL]);
  const target = targetWindowBounds(display);
  assert.ok(target.left >= display.bounds.x && target.right <= display.bounds.x + display.bounds.width);
  assert.ok(target.top >= display.bounds.y && target.bottom <= display.bounds.y + display.bounds.height);
  assert.equal(windowCenterInDisplay(target, display), true);
  assert.equal(windowCenterInDisplay({ left: 100, top: 100, right: 1380, bottom: 1000 }, display), false);
  const tiny = { name: 'v', bounds: { x: -800, y: -600, width: 800, height: 600 } };
  const t2 = targetWindowBounds(tiny);
  assert.ok(t2.right <= 0 && t2.bottom <= 0 && t2.left >= -800 && t2.top >= -600, 'clamped into a small display');
});

test('classifyWindowTabs: a single unknown non-blank tab makes the window untouchable', () => {
  assert.equal(classifyWindowTabs({ tabs: [{ id: 1, blank: false }, { id: 2, blank: true }], knownTabIds: [1] }).safe, true);
  const user = classifyWindowTabs({ tabs: [{ id: 1, blank: false }, { id: 9, blank: false }], knownTabIds: [1] });
  assert.equal(user.safe, false);
  assert.equal(user.reason, 'window-has-foreign-tabs');
  assert.equal(classifyWindowTabs({ tabs: [], knownTabIds: [] }).safe, false);
});

test('findSessionEntry / chooseTabTarget', () => {
  const sessions = [{ session: 'other', windowId: 5, tabId: 50 }, { session: SESSION, surface: 'browser', windowId: 7, tabId: 70 }];
  assert.equal(findSessionEntry(sessions, SESSION).windowId, 7);
  assert.equal(findSessionEntry(sessions, 'missing'), null);
  assert.equal(chooseTabTarget([{ page: 'A', url: 'about:blank' }]), 'A');
  assert.equal(chooseTabTarget([{ page: 'A', url: 'about:blank' }, { page: 'B', url: 'https://x.test/' }]), 'B');
  assert.equal(chooseTabTarget([]), null);
});

test('detectDedicatedSupport: only a parsed object with supported===true and the dedicated-window capability counts', () => {
  assert.equal(detectDedicatedSupport(null).supported, false);
  assert.equal(detectDedicatedSupport(null).reason, 'unavailable');
  // 旧扩展答任何未知 sessions op 都是纯会话数组——这是 feature-detection 的判据本身。
  assert.equal(detectDedicatedSupport([{ session: 'x' }]).supported, false);
  assert.equal(detectDedicatedSupport([{ session: 'x' }]).reason, 'extension-too-old');
  assert.equal(detectDedicatedSupport({ supported: false, reason: 'bridge-unavailable' }).supported, false);
  assert.equal(detectDedicatedSupport({ supported: false, reason: 'bridge-unavailable' }).reason, 'bridge-unavailable');
  assert.equal(detectDedicatedSupport({ supported: true, capabilities: ['window-slots'] }).supported, false, 'missing the dedicated-window capability itself');
  assert.equal(detectDedicatedSupport({ supported: true, capabilities: ['window-slots'] }).reason, 'missing-capability');
  const ok = detectDedicatedSupport({ supported: true, capabilities: ['dedicated-window', 'window-slots'] });
  assert.equal(ok.supported, true);
  assert.equal(ok.reason, null);
  assert.deepEqual(ok.capabilities, ['dedicated-window', 'window-slots']);
});

test('pickDedicatedDisplay: same non-primary-first / sole-primary-exception rule as pickAutomationDisplay, on the extension\'s own display shape', () => {
  const virtual = { id: '2', name: '虚拟 16:9', primary: false, bounds: { left: -2560, top: -1440, width: 2560, height: 1440 } };
  const primary = { id: '1', name: 'Built-in Display', primary: true, bounds: { left: 0, top: 0, width: 1512, height: 982 } };
  assert.equal(pickDedicatedDisplay([primary, virtual], DEFAULT_DISPLAY_MATCH).name, '虚拟 16:9');
  assert.equal(pickDedicatedDisplay([primary], DEFAULT_DISPLAY_MATCH), null, 'no match, no exception');
  const soleVirtualPrimary = { ...virtual, primary: true, bounds: { left: 0, top: 0, width: 2560, height: 1440 } };
  assert.equal(pickDedicatedDisplay([soleVirtualPrimary], DEFAULT_DISPLAY_MATCH).name, '虚拟 16:9', 'sole surviving display may be used even though it reports primary:true');
  assert.equal(pickDedicatedDisplay(null, DEFAULT_DISPLAY_MATCH), null);
  assert.equal(pickDedicatedDisplay([primary, virtual], null), null);
});

test('sanitizeSlot: session name cleaned to the contract\'s slot regex, capped at 40 chars', () => {
  assert.equal(sanitizeSlot('semrush-nav'), 'semrush-nav');
  assert.equal(sanitizeSlot(''), 'default');
  assert.equal(sanitizeSlot(null), 'default');
  assert.equal(sanitizeSlot('a'.repeat(50)).length, 40);
  assert.match(sanitizeSlot('semrush-nav'), /^[A-Za-z0-9_.-]{1,40}$/);
});

test('resolveWindowStrategy: default is virtual-display; explicit opencli modes pass through untouched', () => {
  assert.deepEqual(resolveWindowStrategy({ windowFlag: undefined, fallbackWindowMode: 'active' }),
    { strategy: VIRTUAL_DISPLAY_WINDOW, launchWindow: VIRTUAL_DISPLAY_WINDOW, fallbackWindowMode: 'active', explicit: false });
  assert.equal(resolveWindowStrategy({ windowFlag: 'virtual-display', fallbackWindowMode: 'foreground' }).strategy, VIRTUAL_DISPLAY_WINDOW);
  for (const mode of ['foreground', 'active', 'background', 'isolated']) {
    const r = resolveWindowStrategy({ windowFlag: mode, fallbackWindowMode: 'active' });
    assert.equal(r.strategy, 'plain');
    assert.equal(r.launchWindow, mode);
  }
  assert.equal(resolveWindowStrategy({ windowFlag: 'typo', fallbackWindowMode: 'active' }).launchWindow, 'active');
  assert.equal(resolveWindowStrategy({ windowFlag: undefined, fallbackWindowMode: 'background', defaultVirtualDisplay: false }).launchWindow, 'background');
});

test('fallbackHint: names the activation cap when the fallback steals focus', () => {
  assert.equal(fallbackHint({ reason: 'no-virtual-display', maxActivations: 3 }), '未检测到虚拟屏幕，回退为抢焦点（最多 3 次）');
  assert.match(fallbackHint({ reason: 'no-virtual-display', maxActivations: 0, fallbackWindowMode: 'active' }), /回退为 --window active（不抢焦点/);
  assert.match(fallbackHint({ reason: 'no-virtual-display', fallbackWindowMode: 'foreground' }), /foreground/);
});

test('createFrontmostSampler: throttles, caps stored samples, counts Chrome-frontmost', async () => {
  let t = 0;
  const apps = ['Claude', 'Google Chrome', 'Claude', 'Claude'];
  const s = createFrontmostSampler({ readFrontmost: async () => apps.shift() ?? 'Claude', now: () => t, minIntervalMs: 1000, maxSamples: 2 });
  await s.sample('a'); t += 10; await s.sample('throttled');
  t += 2000; await s.sample('b');
  t += 2000; await s.sample('c', { force: false });
  assert.equal(s.state.total, 3);
  assert.equal(s.state.samples.length, 2);
  assert.equal(s.state.chromeFrontmost, 1);
});

test('plainAutomationSummary keeps the field shape for non-virtual runs', () => {
  const s = plainAutomationSummary({ windowMode: 'foreground' });
  assert.equal(s.mode, 'fallback');
  assert.equal(s.fallbackReason, 'explicit-window-mode');
  assert.deepEqual(s.frontmostAppSamples, []);
});

/* ---------------- 控制器（假副作用） ---------------- */

function fakeWorld({
  screens = [PRIMARY, VIRTUAL],
  sessions = [],
  windows = {},
  visSequence = ['visible'],
  afterOpen = null,
  // dedicated 探测/摆放——不传（undefined）时 windowStatus/windowEnsure 干脆不出现在
  // deps 上，模拟旧版 opencli 没有这两个 deps 函数：tryDedicated() 自己的 try/catch
  // 会把「deps.windowStatus is not a function」当成探测失败，等同于「不支持」，
  // 落回现有 JXA 路径——这也是为什么下面所有既有测试不需要改一行就继续通过。
  windowStatus = undefined,
  windowEnsure = undefined,
  dedicatedTabs = [{ page: 'D1', url: 'about:blank' }],
} = {}) {
  // `calls` 的既有字段（setWindowBounds/closeSession/openPlaceholder/selectTab/
  // listScreens/readVisibility/frontmost）形状保持逐字节不变——这是所有既有测试
  // 断言的对象。dedicated 相关的新增观测（有没有带 marker 调用）单独放
  // `calls.dedicated.*`，不污染旧字段，保证旧测试一个字符都不用改。
  const calls = {
    setWindowBounds: [], closeSession: 0, openPlaceholder: 0, selectTab: [], listScreens: 0, readVisibility: 0, frontmost: 0,
    windowStatus: 0, windowEnsure: [],
    dedicated: { openPlaceholder: [], selectTab: [], readVisibility: [], listTabs: [] },
  };
  const world = { screens, sessions: [...sessions], windows: { ...windows }, visSequence: [...visSequence] };
  let clock = 0;
  const deps = {
    listScreens: async () => { calls.listScreens += 1; if (world.screens instanceof Error) throw world.screens; return world.screens; },
    listSessions: async () => world.sessions,
    windowInfo: async (id) => (world.windows[id] ? { running: true, found: true, ...world.windows[id] } : { running: true, found: false }),
    setWindowBounds: async (id, b) => { calls.setWindowBounds.push({ id, b }); world.windows[id] = { ...world.windows[id], bounds: b }; },
    frontmostApp: async () => { calls.frontmost += 1; return 'Claude'; },
    openPlaceholder: async (dedicated = null) => {
      calls.openPlaceholder += 1;
      calls.dedicated.openPlaceholder.push(dedicated);
      if (afterOpen) afterOpen(world);
    },
    closeSession: async () => { calls.closeSession += 1; world.sessions = world.sessions.filter((s) => s.session !== SESSION); },
    listTabs: async (dedicated = null) => { calls.dedicated.listTabs.push(dedicated); return dedicated ? dedicatedTabs : [{ page: 'T1', url: 'about:blank' }]; },
    selectTab: async (page, dedicated = null) => { calls.selectTab.push(page); calls.dedicated.selectTab.push(dedicated); },
    readVisibility: async (dedicated = null) => {
      calls.readVisibility += 1;
      calls.dedicated.readVisibility.push(dedicated);
      const v = world.visSequence.length > 1 ? world.visSequence.shift() : world.visSequence[0];
      return { vis: v };
    },
    sleep: async () => {},
    now: () => { clock += 1000; return clock; },
    // undefined（默认）时干脆不放这两个 key 上去：模拟旧版 opencli 没有这两个 deps
    // 函数，tryDedicated() 自己的 try/catch 把「不是函数」当探测失败处理，等同于
    // 「不支持」——这正是下面所有既有测试不用改一行就继续通过的原因。
    ...(windowStatus !== undefined ? {
      windowStatus: async () => { calls.windowStatus += 1; return typeof windowStatus === 'function' ? windowStatus() : windowStatus; },
    } : {}),
    ...(windowEnsure !== undefined ? {
      windowEnsure: async (args) => { calls.windowEnsure.push(args); return typeof windowEnsure === 'function' ? windowEnsure(args) : windowEnsure; },
    } : {}),
  };
  return { deps, calls, world };
}

const OFF_SCREEN = { left: 100, top: 100, right: 1380, bottom: 1000 };

test('prepare: virtual display found, dedicated window off-display → moved once into the display, tab selected, isolated', async () => {
  const { deps, calls, world } = fakeWorld({
    sessions: [{ session: SESSION, surface: 'browser', windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: OFF_SCREEN, tabs: [{ id: 420, blank: false }, { id: 421, blank: true }] } },
  });
  const aw = createAutomationWindow({ session: SESSION, deps });
  const r = await aw.prepare();
  assert.equal(r.mode, VIRTUAL_DISPLAY_WINDOW);
  assert.equal(aw.windowMode, 'isolated');
  assert.equal(calls.setWindowBounds.length, 1);
  assert.equal(calls.setWindowBounds[0].id, 42);
  const [, display] = toGlobalTopLeft(world.screens);
  assert.equal(windowCenterInDisplay(calls.setWindowBounds[0].b, display), true);
  assert.deepEqual(calls.selectTab, ['T1']);
  const s = aw.summary();
  assert.equal(s.moves, 1);
  assert.equal(s.tabSelects, 1);
  assert.equal(s.windowId, 42);
  assert.equal(s.display.name, '虚拟 16:9');
  assert.ok(s.frontmostAppSamples.length >= 1);
  assert.equal(s.frontmost.chromeFrontmost, 0);
});

test('prepare: window already on the virtual display → no move, still selects the tab', async () => {
  const { deps, calls } = fakeWorld({
    sessions: [{ session: SESSION, windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: { left: -2480, top: -1380, right: -1200, bottom: -480 }, tabs: [{ id: 420, blank: false }] } },
  });
  const aw = createAutomationWindow({ session: SESSION, deps });
  await aw.prepare();
  assert.equal(calls.setWindowBounds.length, 0);
  assert.equal(calls.selectTab.length, 1);
});

test('prepare: no virtual display → fallback, zero Chrome writes, keeps the caller fallback window mode', async () => {
  const { deps, calls } = fakeWorld({
    screens: [PRIMARY],
    sessions: [{ session: SESSION, windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: OFF_SCREEN, tabs: [{ id: 420, blank: false }] } },
  });
  const aw = createAutomationWindow({ session: SESSION, deps, fallbackWindowMode: 'foreground' });
  const r = await aw.prepare();
  assert.equal(r.mode, 'fallback');
  assert.equal(r.fallbackReason, 'no-virtual-display');
  assert.equal(aw.windowMode, 'foreground');
  assert.equal(calls.setWindowBounds.length, 0);
  assert.equal(calls.selectTab.length, 0);
  assert.equal(calls.openPlaceholder, 0);
  assert.equal(calls.closeSession, 0);
  const again = await aw.ensureVisible('hidden-read');
  assert.equal(again.skipped, true, 'ensureVisible is a no-op in fallback mode — callers use their own activator');
});

test('prepare: disabled by config → fallback without even listing screens', async () => {
  const { deps, calls } = fakeWorld();
  const aw = createAutomationWindow({ session: SESSION, deps, matcher: resolveDisplayMatcher({ flag: 'off' }) });
  const r = await aw.prepare();
  assert.equal(r.fallbackReason, 'disabled-by-config');
  assert.equal(calls.listScreens, 0);
});

test('prepare: session tab sits in the USER window → never moves that window; releases own lease and reopens isolated', async () => {
  const { deps, calls } = fakeWorld({
    sessions: [{ session: SESSION, windowId: 7, tabId: 70 }],
    windows: {
      7: { bounds: OFF_SCREEN, tabs: [{ id: 70, blank: false }, { id: 71, blank: false }, { id: 72, blank: false }] },
      99: { bounds: OFF_SCREEN, tabs: [{ id: 990, blank: false }] },
    },
    afterOpen: (world) => { world.sessions.push({ session: SESSION, windowId: 99, tabId: 990 }); },
  });
  const aw = createAutomationWindow({ session: SESSION, deps });
  const r = await aw.prepare();
  assert.equal(calls.closeSession, 1);
  assert.equal(calls.openPlaceholder, 1);
  assert.ok(calls.setWindowBounds.every((c) => c.id !== 7), 'the user window must never receive set bounds');
  assert.deepEqual(calls.setWindowBounds.map((c) => c.id), [99]);
  assert.equal(r.mode, VIRTUAL_DISPLAY_WINDOW);
  assert.equal(aw.summary().sessionRelocations[0].reason, 'window-has-foreign-tabs');
});

test('prepare: even the reopened window holds a foreign tab → refuse to move, fall back', async () => {
  const { deps, calls } = fakeWorld({
    sessions: [],
    windows: { 99: { bounds: OFF_SCREEN, tabs: [{ id: 990, blank: false }, { id: 5, blank: false }] } },
    afterOpen: (world) => { world.sessions.push({ session: SESSION, windowId: 99, tabId: 990 }); },
  });
  const aw = createAutomationWindow({ session: SESSION, deps, fallbackWindowMode: 'active' });
  const r = await aw.prepare();
  assert.equal(r.mode, 'fallback');
  assert.equal(r.fallbackReason, 'automation-window-has-foreign-tabs');
  assert.equal(calls.setWindowBounds.length, 0);
  assert.equal(aw.windowMode, 'active');
  assert.equal(aw.summary().refusedMoves.length, 1);
});

test('prepare: no session and opencli could not create one → fallback session-window-not-found', async () => {
  const { deps, calls } = fakeWorld({ sessions: [] });
  const aw = createAutomationWindow({ session: SESSION, deps });
  const r = await aw.prepare();
  assert.equal(r.fallbackReason, 'session-window-not-found');
  assert.equal(calls.setWindowBounds.length, 0);
});

test('ensureVisible: visible read → no rearrangement', async () => {
  const { deps, calls } = fakeWorld({
    sessions: [{ session: SESSION, windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: { left: -2480, top: -1380, right: -1200, bottom: -480 }, tabs: [{ id: 420, blank: false }] } },
  });
  const aw = createAutomationWindow({ session: SESSION, deps });
  await aw.prepare();
  const selects = calls.selectTab.length;
  const r = await aw.ensureVisible('before-navigation');
  assert.equal(r.visible, true);
  assert.equal(calls.selectTab.length, selects);
  assert.equal(aw.summary().recoveries, 0);
});

test('ensureVisible: hidden recovery re-selects and moves back, bounded by maxRecoveries', async () => {
  const { deps, calls, world } = fakeWorld({
    sessions: [{ session: SESSION, windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: { left: -2480, top: -1380, right: -1200, bottom: -480 }, tabs: [{ id: 420, blank: false }] } },
    visSequence: ['visible'],
  });
  const aw = createAutomationWindow({ session: SESSION, deps, maxRecoveries: 2, visiblePollTries: 2 });
  await aw.prepare();
  // 用户把窗口拖回主屏，之后一直 hidden。
  world.windows[42].bounds = OFF_SCREEN;
  world.visSequence = ['hidden'];
  for (let i = 0; i < 5; i += 1) await aw.ensureVisible('hidden-read');
  const s = aw.summary();
  assert.equal(s.recoveries, 2);
  assert.equal(s.recoveryCapReached, true);
  assert.equal(calls.setWindowBounds.length, 1, 'moved back once; later recoveries see it already on-display');
  assert.equal(s.mode, VIRTUAL_DISPLAY_WINDOW);
  assert.ok(s.visibility.hidden >= 5);
});

test('ensureVisible: virtual display disappears mid-run → downgrade to fallback so callers use their activator', async () => {
  const { deps, calls, world } = fakeWorld({
    sessions: [{ session: SESSION, windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: { left: -2480, top: -1380, right: -1200, bottom: -480 }, tabs: [{ id: 420, blank: false }] } },
  });
  const aw = createAutomationWindow({ session: SESSION, deps, fallbackWindowMode: 'active' });
  await aw.prepare();
  world.screens = [PRIMARY];
  world.visSequence = ['hidden'];
  const r = await aw.ensureVisible('hidden-read');
  assert.equal(r.mode, 'fallback');
  assert.equal(r.displayLost, true);
  assert.equal(aw.mode, 'fallback');
  assert.equal(aw.summary().fallbackReason, 'no-virtual-display');
  assert.equal(calls.setWindowBounds.length, 0);
});

/* ---------------- dedicated 窗口模式 ---------------- */

const DEDICATED_SUPPORTED_STATUS = {
  supported: true,
  protocol: 1,
  capabilities: ['dedicated-window', 'window-slots', 'window-bounds', 'window-display', 'auto-select', 'foreign-tab-policy'],
  displays: [
    { id: '1', name: 'Built-in Display', primary: true, bounds: { left: 0, top: 0, width: 1512, height: 982 } },
    { id: '2', name: '虚拟 16:9', primary: false, bounds: { left: -2560, top: -1440, width: 2560, height: 1440 } },
  ],
  windows: [],
};

function dedicatedEnsureResult({ windowId = 501, displayFound = true, onDisplay = true, created = true, moved = false } = {}) {
  return {
    slot: 'test-slot',
    windowId,
    exists: true,
    state: 'normal',
    bounds: { left: -2480, top: -1380, width: 1280, height: 900 },
    placement: {
      source: 'display', requestedBounds: null, displayPattern: String(DEFAULT_DISPLAY_MATCH),
      displayName: '虚拟 16:9', displayFound, cell: 0,
    },
    onDisplay,
    activeTab: null,
    tabs: { total: 1, leases: 1, placeholders: 0, automation: 0, foreign: 0 },
    sessions: [SESSION],
    autoSelect: true,
    foreignTabPolicy: 'evict',
    evictedTabs: 0,
    created,
    moved,
  };
}

test('dedicated: supported + matching display → commits to dedicated, never touches osascript/session-list machinery', async () => {
  const { deps, calls } = fakeWorld({ windowStatus: DEDICATED_SUPPORTED_STATUS, windowEnsure: () => dedicatedEnsureResult({ windowId: 777 }) });
  const aw = createAutomationWindow({ session: SESSION, deps });
  const r = await aw.prepare();
  assert.equal(r.mode, VIRTUAL_DISPLAY_WINDOW);
  assert.equal(aw.windowMode, 'dedicated');
  assert.equal(calls.windowStatus, 1);
  assert.equal(calls.windowEnsure.length, 1);
  assert.equal(calls.windowEnsure[0].slot, sanitizeSlot(SESSION));
  assert.equal(calls.windowEnsure[0].display, String(DEFAULT_DISPLAY_MATCH));
  assert.equal(calls.setWindowBounds.length, 0, 'dedicated never moves windows itself (opencli does the placing)');
  assert.equal(calls.closeSession, 0, 'dedicated never closes+reopens the session (extension owns isolation)');
  assert.equal(calls.listScreens, 0, 'dedicated never falls through to JXA screen detection');
  assert.equal(calls.dedicated.openPlaceholder.length, 1);
  assert.ok(calls.dedicated.openPlaceholder[0], 'openPlaceholder called with the dedicated marker');
  assert.equal(calls.dedicated.openPlaceholder[0].slot, sanitizeSlot(SESSION));
  assert.equal(calls.selectTab.length, 0, 'happy path relies on the extension\'s own auto-select, no explicit tab select');
  const s = aw.summary();
  assert.equal(s.strategy, 'dedicated');
  assert.equal(s.slot, sanitizeSlot(SESSION));
  assert.equal(s.windowId, 777);
  assert.equal(s.dedicatedSupport.supported, true);
});

test('dedicated: capable extension but no matching display in its list → falls through to legacy JXA (which still finds one)', async () => {
  const noVirtualInStatus = { ...DEDICATED_SUPPORTED_STATUS, displays: [DEDICATED_SUPPORTED_STATUS.displays[0]] };
  const { deps, calls } = fakeWorld({
    sessions: [{ session: SESSION, surface: 'browser', windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: OFF_SCREEN, tabs: [{ id: 420, blank: false }, { id: 421, blank: true }] } },
    windowStatus: noVirtualInStatus,
  });
  const aw = createAutomationWindow({ session: SESSION, deps });
  const r = await aw.prepare();
  assert.equal(r.mode, VIRTUAL_DISPLAY_WINDOW);
  assert.equal(aw.windowMode, 'isolated');
  assert.equal(calls.windowEnsure.length, 0, 'never reaches ensure without a matching display');
  assert.equal(calls.setWindowBounds.length, 1, 'legacy JXA path takes over and finds the virtual display itself');
  assert.equal(aw.summary().strategy, 'osascript');
});

test('dedicated: unsupported shapes (old extension array / old CLI supported:false / unreachable / missing capability / null displays) all fall through to the exact legacy call sequence', async () => {
  const shapes = [
    [{ session: 'other' }],
    { supported: false, reason: 'extension-too-old' },
    { supported: false, reason: 'bridge-unavailable', error: 'x' },
    null,
    { supported: true, capabilities: ['window-slots'] },
    { supported: true, capabilities: ['dedicated-window'], displays: null },
  ];
  for (const shape of shapes) {
    const { deps, calls } = fakeWorld({
      sessions: [{ session: SESSION, surface: 'browser', windowId: 42, tabId: 420 }],
      windows: { 42: { bounds: OFF_SCREEN, tabs: [{ id: 420, blank: false }, { id: 421, blank: true }] } },
      windowStatus: shape,
    });
    const aw = createAutomationWindow({ session: SESSION, deps });
    const r = await aw.prepare();
    assert.equal(r.mode, VIRTUAL_DISPLAY_WINDOW, `mode for shape ${JSON.stringify(shape)}`);
    assert.equal(aw.windowMode, 'isolated');
    assert.equal(calls.windowStatus, 1, 'probed exactly once');
    assert.equal(calls.windowEnsure.length, 0, 'never reaches window ensure once support/displays are ruled out');
    assert.equal(calls.setWindowBounds.length, 1);
    assert.deepEqual(calls.selectTab, ['T1']);
    assert.equal(calls.dedicated.openPlaceholder.length, 0, 'the one openPlaceholder call carries no dedicated marker');
    assert.equal(aw.summary().strategy, 'osascript');
  }
});

test('dedicated: matcher disabled skips windowStatus entirely, same as the legacy JXA path', async () => {
  const { deps, calls } = fakeWorld({ windowStatus: DEDICATED_SUPPORTED_STATUS, windowEnsure: () => dedicatedEnsureResult() });
  const aw = createAutomationWindow({ session: SESSION, deps, matcher: resolveDisplayMatcher({ flag: 'off' }) });
  const r = await aw.prepare();
  assert.equal(r.fallbackReason, 'disabled-by-config');
  assert.equal(calls.windowStatus, 0);
  assert.equal(calls.windowEnsure.length, 0);
  assert.equal(calls.listScreens, 0);
});

test('dedicated: display found in status() but window ensure reports displayFound:false at commit time → straight fallback, never touches JXA', async () => {
  const { deps, calls } = fakeWorld({
    windowStatus: DEDICATED_SUPPORTED_STATUS,
    windowEnsure: () => dedicatedEnsureResult({ displayFound: false }),
  });
  const aw = createAutomationWindow({ session: SESSION, deps, fallbackWindowMode: 'active' });
  const r = await aw.prepare();
  assert.equal(r.mode, 'fallback');
  assert.equal(r.fallbackReason, 'virtual-display-lost');
  assert.equal(aw.windowMode, 'active');
  assert.equal(calls.listScreens, 0, 'once committed to dedicated it never falls back to JXA');
  assert.equal(calls.setWindowBounds.length, 0);
});

test('dedicated: ensureVisible hidden → windowEnsure re-places + tab select + poll, bounded like the legacy path', async () => {
  const { deps, calls, world } = fakeWorld({ windowStatus: DEDICATED_SUPPORTED_STATUS, windowEnsure: () => dedicatedEnsureResult({ windowId: 900 }) });
  const aw = createAutomationWindow({ session: SESSION, deps, maxRecoveries: 2, visiblePollTries: 2 });
  await aw.prepare();
  assert.equal(aw.summary().strategy, 'dedicated');
  world.visSequence = ['hidden', 'visible'];
  const r = await aw.ensureVisible('before-nav');
  assert.equal(r.visible, true);
  assert.equal(aw.summary().recoveries, 1);
  assert.equal(calls.windowEnsure.length, 2, 'once in prepare, once in the hidden recovery');
  assert.equal(calls.selectTab.length, 1, 'the recovery path does an explicit tab select');
  assert.ok(calls.dedicated.selectTab[0], 'select carries the dedicated marker');
  assert.equal(calls.setWindowBounds.length, 0);
  assert.equal(calls.closeSession, 0);
  assert.equal(calls.listScreens, 0);
});

test('dedicated: hidden recovery whose windowEnsure reports displayFound:false downgrades permanently to fallback', async () => {
  let call = 0;
  const { deps, world } = fakeWorld({
    windowStatus: DEDICATED_SUPPORTED_STATUS,
    windowEnsure: () => { call += 1; return call === 1 ? dedicatedEnsureResult() : dedicatedEnsureResult({ displayFound: false }); },
  });
  const aw = createAutomationWindow({ session: SESSION, deps, fallbackWindowMode: 'active' });
  await aw.prepare();
  world.visSequence = ['hidden'];
  const r = await aw.ensureVisible('before-nav');
  assert.equal(r.mode, 'fallback');
  assert.equal(r.displayLost, true);
  assert.equal(aw.mode, 'fallback');
  assert.equal(aw.summary().fallbackReason, 'virtual-display-lost');
  assert.equal(aw.windowMode, 'active');
  // 一旦降级为 fallback，ensureVisible 变成永久 no-op——与既有 legacy 行为一致。
  const again = await aw.ensureVisible('after-fallback');
  assert.equal(again.skipped, true);
});

test('createAutomationWindow: slot option overrides the session-derived default, sanitized the same way', async () => {
  const { deps, calls } = fakeWorld({ windowStatus: DEDICATED_SUPPORTED_STATUS, windowEnsure: () => dedicatedEnsureResult() });
  const aw = createAutomationWindow({ session: SESSION, deps, slot: 'semrush' });
  await aw.prepare();
  assert.equal(aw.summary().slot, 'semrush');
  assert.equal(calls.windowEnsure[0].slot, 'semrush');
});

test('automationWindow.opencliEnv: only non-empty when dedicated actually committed, empty for legacy and fallback', async () => {
  const dedicated = fakeWorld({ windowStatus: DEDICATED_SUPPORTED_STATUS, windowEnsure: () => dedicatedEnsureResult() });
  const awD = createAutomationWindow({ session: SESSION, deps: dedicated.deps });
  await awD.prepare();
  assert.deepEqual(awD.opencliEnv, {
    OPENCLI_WINDOW: 'dedicated',
    OPENCLI_WINDOW_SLOT: sanitizeSlot(SESSION),
    OPENCLI_WINDOW_DISPLAY: String(DEFAULT_DISPLAY_MATCH),
  });

  const legacy = fakeWorld({
    sessions: [{ session: SESSION, surface: 'browser', windowId: 42, tabId: 420 }],
    windows: { 42: { bounds: { left: -2480, top: -1380, right: -1200, bottom: -480 }, tabs: [{ id: 420, blank: false }] } },
  });
  const awL = createAutomationWindow({ session: SESSION, deps: legacy.deps });
  await awL.prepare();
  assert.deepEqual(awL.opencliEnv, {}, 'legacy JXA path never emits dedicated env vars');

  const fell = fakeWorld({ screens: [PRIMARY] });
  const awF = createAutomationWindow({ session: SESSION, deps: fell.deps, fallbackWindowMode: 'active' });
  await awF.prepare();
  assert.deepEqual(awF.opencliEnv, {}, 'fallback mode never emits dedicated env vars either');
});

/* ---------------- 源码守卫 ---------------- */

test('source guard: the module never sends anything that raises Chrome to the front', () => {
  const src = readFileSync(new URL('../scripts/lib-automation-window.mjs', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bactivate\b/, 'no AppleScript/JXA activate');
  assert.doesNotMatch(code, /'open',\s*\[\s*'-a'/, 'no open -a');
  assert.doesNotMatch(code, /set index of window|\.index\s*=|reopen/i, 'no window raise');
  assert.doesNotMatch(code, /\.focused\s*=|frontmost\s*=|set frontmost/i, 'System Events is read-only here');
  assert.match(code, /c\.running\(\)/, 'Chrome is only queried when already running (a tell would launch it)');
});

test('wiring guard: the four visibility-dependent entry scripts default to the virtual-display strategy', () => {
  for (const f of ['semrush-overview.mjs', 'similarweb-query.mjs', 'similarweb-batch.mjs', 'similarweb-keywords.mjs', 'semrush-traffic.mjs']) {
    const src = readFileSync(new URL(`../scripts/${f}`, import.meta.url), 'utf8');
    assert.match(src, /resolveWindowStrategy\(/, `${f} resolves the window strategy`);
    assert.match(src, /automationWindow/, `${f} writes automationWindow`);
  }
  const share = readFileSync(new URL('../scripts/lib-tools-share.mjs', import.meta.url), 'utf8');
  assert.match(share, /window === VIRTUAL_DISPLAY_WINDOW/);
});

/**
 * lib-automation-window.mjs — 把 opencli 自动化窗口放到「虚拟屏幕」上，让懒加载报表在
 * 不抢用户焦点的前提下保持 `document.visibilityState === 'visible'`。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 为什么需要它（实测，2026-09-14）
 * ──────────────────────────────────────────────────────────────────────
 * - Chrome 窗口被别的应用完全遮挡时，macOS 的遮挡检测会让 Chrome 把活动标签页也标成
 *   hidden（约 3 秒内），rAF / IntersectionObserver 停摆，懒加载区块不挂载。
 * - 以前的补救是 `open -a "Google Chrome"` 抬前台——打断用户。
 * - 把自动化窗口放到一块没人看、但系统认为「在屏上」的虚拟屏幕上：60 秒 20 轮读数
 *   全程 visible、rAF ≈60fps，前台应用始终不变。挪回主屏被遮挡 → hidden；挪回来 → 立即 visible。
 *
 * ──────────────────────────────────────────────────────────────────────
 * dedicated 优先，osascript 兜底（2026-09-14 新增）
 * ──────────────────────────────────────────────────────────────────────
 * opencli 正在加一个「专用窗口」模式（`--window dedicated`）：扩展自己把会话标签页
 * 焊死在一个按 slot 命名的独立窗口里，摆放、隔离、自动选中活动标签全由扩展负责——
 * 不需要我们自己拼 JXA + AppleScript。旧版 opencli/旧扩展不认这个值，所以这里先探测
 * 支持（`opencli browser window status`），支持且扩展报的 displays 里有匹配的虚拟屏
 * 才走 dedicated；探测失败、扩展报的 displays 是 null、或者没有匹配的屏，一律原样
 * 落回下面这套已经实测过的 JXA + osascript 路径——那条路径的代码和行为完全不变。
 * 一旦决定走 dedicated，这一轮就不再退回 JXA 路径（两套隔离机制不混用）：确认支持
 * 且找到匹配屏之后如果 `window ensure` 本身失败，直接判成 fallback，不越级尝试 JXA。
 *
 * dedicated 路径里绝不做的事：不调用 osascript `set bounds`（窗口摆放交给
 * `opencli browser window ensure`）、不跑 classifyWindowTabs 那套「外来标签页则拒绝
 * 移动」的兜底（扩展自己的 evict 策略负责隔离，契约见 dedicated-window-contract.md
 * 第 1 节）、不 `closeSession` 再重开（同样是扩展的职责）。也绝不会给 opencli 开一个
 * 独立 Chrome Profile / user-data-dir——dedicated 窗口和用户使用的是同一个已登录的
 * Chrome、同一个 profile，只是另开了一扇窗。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 可行组合（JXA + osascript 路径，缺一步都不行）
 * ──────────────────────────────────────────────────────────────────────
 * 1. `--window isolated`：扩展用 `chrome.windows.create({focused:false})` 建独立窗口，
 *    不聚焦。`active`/`background` 不行——用户开着自己的 Chrome 窗口时，扩展会把 session
 *    标签塞进用户窗口（扩展 background.ts 的 findHostWindowForContainer 分支）。
 * 2. 移窗：AppleScript `set bounds of window id <winId>`。winId 就是 `opencli browser sessions`
 *    里的 windowId。**这条命令不激活 Chrome**（实测前后台均不变）。
 * 3. `opencli browser <s> tab select <page>`：扩展只做 `chrome.tabs.update({active:true})`，
 *    不 focus 窗口。一个窗口里只有活动标签页 visible。
 * 4. 读 `document.visibilityState` 确认 visible 之后，调用方才导航到报表（location.href）。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 绝不抢焦点、绝不碰用户窗口——依据写在每个副作用旁边
 * ──────────────────────────────────────────────────────────────────────
 * - 本模块**从不**调用 `activate`、`open -a`、`set index of window`、`reopen`，也不对
 *   System Events 发任何写指令；System Events 只用来只读查询前台应用名。
 * - 对 Chrome 的 JXA/AppleScript 调用先检查 `running()`（不会因为 `tell` 而拉起 Chrome）。
 * - `set bounds` 只作用于**本 session 所在、且窗口内每个标签页都是 opencli 已知标签页
 *   或空白占位页**的窗口（classifyWindowTabs）。只要窗口里出现一个不认识的标签页，
 *   就判定为用户窗口 / 借用窗口，拒绝移动并回退。dedicated 路径不适用这条——它压根
 *   不调用 set bounds。
 * - 标签页 URL 只在 osascript 进程内部判「是否空白页」，不返回、不打印（URL 里可能有令牌）。
 * - 从不关闭窗口。唯一的 close 是 `opencli browser <本 session> close`，只在本 session
 *   的标签页落在用户窗口里时释放它自己的租约（调用方已持有该工具的跨进程锁）；dedicated
 *   路径不调用它。
 * - 不给 opencli 开独立 Chrome Profile / 独立 user-data-dir / 独立 Chrome 实例——不管是
 *   虚拟屏路径还是 dedicated 路径，动的都是用户已登录的那个 Chrome、同一个 profile。
 *
 * 纯逻辑（屏幕换算、匹配、判定、窗口模式解析）与副作用（osascript / opencli）分离；
 * 副作用全部经 `deps` 注入，离线测试见 tests/automation-window.test.mjs。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  firstJson, normalizeWindowMode, opencli, run,
} from './opencli-core.mjs';

const execFileP = promisify(execFile);

/** 调用方用这个值表达「要虚拟屏幕策略」。它不是 opencli 的窗口模式，不会传给 opencli。 */
export const VIRTUAL_DISPLAY_WINDOW = 'virtual-display';

/** 默认匹配：名字里含「虚拟」或 Virtual 的**非主屏**（只剩它一块屏时例外，见 pickAutomationDisplay）。 */
export const DEFAULT_DISPLAY_MATCH = /虚拟|virtual/i;

/** 配置入口：环境变量（也可写进 Skill 根目录 `.env`，lib-tools-share.mjs 启动时会加载）。 */
export const DISPLAY_ENV = 'BACKLINK_AUTOMATION_DISPLAY';

export const AUTOMATION_WINDOW_GEOMETRY = { width: 1280, height: 900, offsetX: 80, offsetY: 60 };

const DISABLED_VALUES = new Set(['off', 'none', 'false', '0', 'disabled']);

/* ------------------------------------------------------------------ *
 * 纯函数
 * ------------------------------------------------------------------ */

/**
 * 屏幕名匹配器。优先级：显式参数（--automation-display）> 环境变量 > 默认正则。
 * 值为 off/none/false/0 ⇒ 关闭虚拟屏幕策略；`/re/flags` ⇒ 正则；其它 ⇒ 不区分大小写的子串。
 */
export function resolveDisplayMatcher({ flag, env = process.env } = {}) {
  const raw = typeof flag === 'string' && flag.trim() ? flag.trim()
    : (typeof env?.[DISPLAY_ENV] === 'string' && env[DISPLAY_ENV].trim() ? env[DISPLAY_ENV].trim() : null);
  const source = typeof flag === 'string' && flag.trim() ? 'flag' : (raw ? 'env' : 'default');
  if (!raw) return { disabled: false, matcher: DEFAULT_DISPLAY_MATCH, source, pattern: String(DEFAULT_DISPLAY_MATCH) };
  if (DISABLED_VALUES.has(raw.toLowerCase())) return { disabled: true, matcher: null, source, pattern: raw };
  const re = raw.match(/^\/(.+)\/([a-z]*)$/i);
  if (re) {
    try { return { disabled: false, matcher: new RegExp(re[1], re[2]), source, pattern: raw }; } catch { /* 写错的正则当子串处理 */ }
  }
  const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { disabled: false, matcher: new RegExp(escaped, 'i'), source, pattern: raw };
}

/**
 * NSScreen frame（Cocoa：左下原点、y 向上）→ 全局左上原点矩形（与 Chrome AppleScript
 * `bounds`、页面 `screenX/screenY` 同一坐标系）。
 *
 * 换算基准（翻转用的 `mainH`）取「frame 原点为 (0,0) 的那块」——这才是 Cocoa 对「主屏」
 * 的真实定义（带菜单栏的屏幕，全局坐标原点永远钉在它左上角），**不是数组下标 0**。
 * 2026-09-14 复核实测踩过这个坑：多屏重新连接后 `NSScreen.screens` 的下标顺序会变，
 * 虚拟屏排到 index 0、真主屏排到 index 1 都发生过；如果换算基准和「谁是主屏」的判定
 * 都写死 index 0，物理主屏熄屏/锁屏后 `NSScreen.screens` 只剩虚拟屏时，它会顶替占据
 * 全局原点，此时按坐标判定它才正确地不再是"某个真主屏之外的另一块屏"，而是唯一一块
 * 屏——这个转变必须被换算基准感知到，否则会用一个过期的高度去翻转 y。找不到任何一块
 * 原点为 (0,0) 的屏（理论上不会发生，Cocoa 保证恰好一块）时兜底用下标 0，不让函数在
 * 异常输入下抛错。
 */
export function toGlobalTopLeft(screens) {
  const list = Array.isArray(screens) ? screens : [];
  if (!list.length) return [];
  const originIndex = list.findIndex((s) => (Number(s.x) || 0) === 0 && (Number(s.y) || 0) === 0);
  const pivot = originIndex >= 0 ? originIndex : 0;
  const mainH = Number(list[pivot].h) || 0;
  return list.map((s, index) => ({
    name: String(s.name ?? ''),
    primary: index === pivot,
    builtin: typeof s.builtin === 'boolean' ? s.builtin : null,
    bounds: {
      x: Number(s.x) || 0,
      y: mainH - ((Number(s.y) || 0) + (Number(s.h) || 0)),
      width: Number(s.w) || 0,
      height: Number(s.h) || 0,
    },
  }));
}

/**
 * 从换算后的屏幕列表里挑自动化屏：名字匹配、尺寸非零，**优先非主屏**。
 *
 * 例外（2026-09-14）：如果整台机器现在就只报了这一块屏（`globalScreens.length === 1`），
 * 且它恰好名字匹配，即使它因为独占了全局原点而被 `toGlobalTopLeft` 标成 `primary`，
 * 这里也照用不拒绝。理由：物理主屏熄屏/锁屏是无人值守自动化里最常见的情形之一，此时
 * `NSScreen.screens` 只剩配置好的虚拟屏，它的 `primary:true` 只是「独占了原点」的副作用，
 * 不代表它是用户正在用的真实主屏——继续拒绝就是眼睁睁看着虚拟屏幕策略在最该生效的场景
 * 里静默退化成 fallback。这个例外**只在只有一块屏时**成立：只要还有第二块屏在，不管
 * 名字撞得多准，主屏永远不会被选中——这条线不因为这次例外松动。
 */
export function pickAutomationDisplay(globalScreens, matcher) {
  if (!matcher) return null;
  const list = globalScreens || [];
  const nonPrimary = list.find((s) => !s.primary && s.bounds.width > 0 && s.bounds.height > 0 && matcher.test(s.name));
  if (nonPrimary) return nonPrimary;
  if (list.length === 1) {
    const only = list[0];
    if (only.primary && only.bounds.width > 0 && only.bounds.height > 0 && matcher.test(only.name)) return only;
  }
  return null;
}

/**
 * 从 opencli `browser window status` 上报的 `displays`（扩展用 `chrome.system.display`
 * 读到的屏幕列表，形状是 `{id,name,primary,bounds:{left,top,width,height},workArea}`，
 * 已经是全局左上原点坐标，不需要像 NSScreen 那样做 Cocoa 翻转）里挑自动化屏。
 * 规则与 `pickAutomationDisplay` 保持一致（同一份"优先非主屏，只剩一块屏时才允许用
 * 主屏"的道理）——dedicated-window-contract.md 第 3 节说扩展自己的 `pickDisplay` 就是
 * 这个规则，这里对齐，不要因为 `primary:true` 就一律排除。
 */
export function pickDedicatedDisplay(displays, matcher, { allowNameless = false } = {}) {
  if (!matcher || !Array.isArray(displays)) return null;
  const usable = (d) => d && d.bounds && Number(d.bounds.width) > 0 && Number(d.bounds.height) > 0;
  const hasName = (d) => String(d?.name ?? '').trim() !== '';
  const pool = displays.filter(usable);
  if (!pool.length) return null;
  // 几何先行：候选永远是非主屏；只剩一块屏时才允许用它（熄屏/锁屏场景，见 pickAutomationDisplay）。
  const secondary = pool.filter((d) => d.primary !== true);
  const candidates = secondary.length ? secondary : (pool.length === 1 ? pool : []);
  if (!candidates.length) return null;
  const byName = candidates.find((d) => matcher.test(String(d.name ?? '')));
  if (byName) return byName;
  // 名字没匹配上：名字信号本身不存在（整份列表都没有名字）时按几何兜底，调用方明确允许
  // （默认匹配器）时同样兜底。
  const nameSignalAvailable = pool.some(hasName);
  if (nameSignalAvailable && !allowNameless) return null;
  if (secondary.length) return secondary[0];
  // 只剩一块屏（物理屏熄屏/合盖，虚拟屏顶替占据原点）：没有名字佐证时，只认
  // `internal === false` 这条硬证据——内建屏或者读不出这个字段，都不能拿用户唯一
  // 在用的屏幕当自动化屏。2026-09-14 实测：合盖后扩展只报一块 id=8、name=''、
  // internal:false、2560x1440 的屏，正是配好的虚拟屏。
  if (pool.length === 1 && pool[0].internal === false) return pool[0];
  return null;
}

/**
 * 把选中的屏换算成传给扩展的 display 模式串。扩展侧 `pickDisplay` 只认名字，所以：
 * 有名字 ⇒ 锚定成 `/^名字$/`（精确到这一块，不会被另一块同样非主的屏截胡）；
 * 没名字（本机 `chrome.system.display` 两块屏的 name 都是空字符串，2026-09-14 实测）
 * ⇒ 用「匹配一切」的正则（见 fallbackPattern 默认值），它能匹配空名字，而扩展自己的
 * pickDisplay 同样只会落在非主屏上，
 * 与这里的几何判定一致。
 */
export function dedicatedDisplayPattern(display, fallbackPattern = '/.*/') {
  const name = String(display?.name ?? '').trim();
  if (!name) return fallbackPattern;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `/^${escaped}$/`;
}

/** `{left,top,width,height}` → opencli `--bounds` / `OPENCLI_WINDOW_BOUNDS` 的 `x,y,w,h` 串。 */
export function formatBounds(b) {
  return [b.left, b.top, b.width, b.height].map((n) => Math.round(Number(n) || 0)).join(',');
}

/** 两个 `{left,top,width,height}` 矩形是否相交（边贴边不算）。 */
export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return Number(a.left) < Number(b.left) + Number(b.width)
    && Number(b.left) < Number(a.left) + Number(a.width)
    && Number(a.top) < Number(b.top) + Number(b.height)
    && Number(b.top) < Number(a.top) + Number(a.height);
}

/**
 * 在一块屏里找一块**不与任何已占矩形重叠**的位置。
 *
 * 为什么需要：扩展按固定 1280x900 切格，2560x1440 的屏只有 2 格，第 3 个 slot 会绕回
 * 第 0 格，新窗口整个被压在老窗口下面 —— Chrome 对完全遮挡的窗口报 `hidden`，抓取
 * 侧于是拿到一堆没渲染的区块，而 `window status` 还在报 `onDisplay:true`（2026-09-14
 * 实测：82 次可见度读数全 hidden，只拿到 11/23 区块）。放不下就缩小一档窗口再排，
 * 缩到底仍放不下才返回 null，由调用方如实记录 `dedicated-relocate-failed`。
 */
export function pickFreeRect({ area, occupied = [], size = AUTOMATION_WINDOW_GEOMETRY, cascade = { x: 120, y: 90, tries: 8 } } = {}) {
  if (!area || !(Number(area.width) > 0) || !(Number(area.height) > 0)) return null;
  const taken = (Array.isArray(occupied) ? occupied : []).filter((r) => r && Number(r.width) > 0 && Number(r.height) > 0);
  const w = Math.min(Number(size.width), Number(area.width));
  const h = Math.min(Number(size.height), Number(area.height));
  if (!(w > 0) || !(h > 0)) return null;
  const clamp = (rect) => ({
    left: Math.min(Math.max(rect.left, Number(area.left)), Number(area.left) + Number(area.width) - w),
    top: Math.min(Math.max(rect.top, Number(area.top)), Number(area.top) + Number(area.height) - h),
    width: w,
    height: h,
  });
  // 1) 完全不重叠的格子优先——窗口尺寸一个像素都不改，抓到的 DOM 与单窗口时逐字节可比。
  const cols = Math.max(1, Math.floor(Number(area.width) / w));
  const rows = Math.max(1, Math.floor(Number(area.height) / h));
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const rect = clamp({ left: Number(area.left) + col * w, top: Number(area.top) + row * h });
      if (!taken.some((r) => rectsOverlap(rect, r))) return rect;
    }
  }
  // 2) 屏幕放不下第三块全尺寸窗口时，层叠错开：Chrome 只在窗口**被完全遮住**时报 hidden，
  //    错开之后总有一条边露在外面，既不缩窗口（不改渲染宽度）也不会被判成不可见。
  for (let i = 1; i <= (cascade.tries ?? 8); i += 1) {
    const rect = clamp({ left: Number(area.left) + i * cascade.x, top: Number(area.top) + i * cascade.y });
    const swallowed = taken.some((r) => rect.left >= r.left && rect.top >= r.top
      && rect.left + rect.width <= r.left + r.width && rect.top + rect.height <= r.top + r.height);
    const duplicate = taken.some((r) => r.left === rect.left && r.top === rect.top);
    if (!swallowed && !duplicate) return rect;
  }
  return null;
}

/** 窗口中心点是否落在屏幕矩形内（左闭右开）。bounds 为 {left, top, right, bottom}。 */
export function windowCenterInDisplay(win, display) {
  if (!win || !display) return false;
  const cx = (Number(win.left) + Number(win.right)) / 2;
  const cy = (Number(win.top) + Number(win.bottom)) / 2;
  const b = display.bounds;
  return cx >= b.x && cx < b.x + b.width && cy >= b.y && cy < b.y + b.height;
}

/** 目标窗口矩形 {left, top, right, bottom}，放在屏幕左上角附近并裁进屏幕。 */
export function targetWindowBounds(display, geometry = AUTOMATION_WINDOW_GEOMETRY) {
  const b = display.bounds;
  const width = Math.min(geometry.width, Math.max(200, b.width - geometry.offsetX));
  const height = Math.min(geometry.height, Math.max(200, b.height - geometry.offsetY));
  const left = b.x + Math.min(geometry.offsetX, Math.max(0, b.width - width));
  const top = b.y + Math.min(geometry.offsetY, Math.max(0, b.height - height));
  return { left, top, right: left + width, bottom: top + height };
}

/** `opencli browser sessions -f json` 里找本 session 的那一行（browser surface 优先）。 */
export function findSessionEntry(sessions, session) {
  const rows = (Array.isArray(sessions) ? sessions : []).filter((s) => s?.session === session && Number.isInteger(s?.windowId));
  return rows.find((s) => s.surface === 'browser') || rows[0] || null;
}

/**
 * 这个窗口能不能动：每个标签页要么是 opencli 已知会话的标签页，要么是空白占位页。
 * 一个都不认识 ⇒ 用户的窗口（或被借用的窗口），**不许 set bounds**。
 * tabs 形如 [{id, blank}]——`blank` 在 osascript 内部算好，URL 本身不出进程。
 */
export function classifyWindowTabs({ tabs, knownTabIds }) {
  const known = knownTabIds instanceof Set ? knownTabIds : new Set(knownTabIds || []);
  const list = Array.isArray(tabs) ? tabs : [];
  if (!list.length) return { safe: false, reason: 'window-has-no-tabs', foreignTabs: 0, tabs: 0 };
  const foreign = list.filter((t) => !known.has(Number(t.id)) && !t.blank);
  return {
    safe: foreign.length === 0,
    reason: foreign.length ? 'window-has-foreign-tabs' : null,
    foreignTabs: foreign.length,
    tabs: list.length,
  };
}

/**
 * 窗口策略解析（调用方共用）：
 *   - 没传 --window，且调用方默认是虚拟屏幕 ⇒ virtual-display（检测不到时用 fallbackWindowMode）；
 *   - 显式 --window virtual-display ⇒ virtual-display；
 *   - 显式传 opencli 四档之一 ⇒ plain，原样透传（行为与接入前完全一致）；
 *   - 认不出的值 ⇒ plain + fallbackWindowMode。
 */
export function resolveWindowStrategy({ windowFlag, fallbackWindowMode = 'active', defaultVirtualDisplay = true } = {}) {
  const flag = typeof windowFlag === 'string' && windowFlag ? windowFlag : null;
  if (flag === VIRTUAL_DISPLAY_WINDOW || (!flag && defaultVirtualDisplay)) {
    return { strategy: VIRTUAL_DISPLAY_WINDOW, launchWindow: VIRTUAL_DISPLAY_WINDOW, fallbackWindowMode, explicit: Boolean(flag) };
  }
  const windowMode = flag ? normalizeWindowMode(flag, fallbackWindowMode) : fallbackWindowMode;
  return { strategy: 'plain', launchWindow: windowMode, fallbackWindowMode: windowMode, explicit: Boolean(flag) };
}

/** 回退提示（人读）。maxActivations>0 说明回退路径会抢焦点，要把上限说出来。 */
export function fallbackHint({ reason, maxActivations = 0, fallbackWindowMode = 'active' } = {}) {
  const why = {
    'no-virtual-display': '未检测到虚拟屏幕',
    'disabled-by-config': '虚拟屏幕策略已被配置关闭',
    'screen-query-failed': '读取屏幕列表失败',
    'virtual-display-lost': '运行中虚拟屏幕断开',
    'automation-window-has-foreign-tabs': '自动化窗口里混入了非 opencli 标签页（不移动它）',
    'session-window-not-found': '找不到本 session 的自动化窗口',
    'chrome-window-query-failed': '读取 Chrome 窗口失败',
    'explicit-window-mode': '调用方显式指定了 --window',
    'dedicated-ensure-failed': 'opencli dedicated 窗口摆放失败',
  }[reason] || `虚拟屏幕不可用（${reason}）`;
  if (maxActivations > 0) return `${why}，回退为抢焦点（最多 ${maxActivations} 次）`;
  if (fallbackWindowMode === 'foreground') return `${why}，回退为 --window foreground（会把 Chrome 窗口抬到前台）`;
  return `${why}，回退为 --window ${fallbackWindowMode}（不抢焦点；窗口被遮挡时报表可能读成 hidden）`;
}

/** 前台应用采样器：同一 label 至少间隔 minIntervalMs，总条数封顶，计数不封顶。 */
export function createFrontmostSampler({ readFrontmost, now = () => Date.now(), minIntervalMs = 5000, maxSamples = 60 } = {}) {
  const state = { samples: [], total: 0, chromeFrontmost: 0, errors: 0, lastAt: -Infinity };
  async function sample(label, { force = false } = {}) {
    const t = now();
    if (!force && t - state.lastAt < minIntervalMs) return null;
    state.lastAt = t;
    let app = null;
    try { app = String(await readFrontmost()).trim() || null; } catch { state.errors += 1; }
    state.total += 1;
    if (app && /google chrome/i.test(app)) state.chromeFrontmost += 1;
    if (state.samples.length < maxSamples) state.samples.push({ at: new Date(t).toISOString(), label, app });
    return app;
  }
  return { state, sample };
}

/**
 * session 名 → dedicated 窗口的 slot 名。选用 session 名（清洗后）而不是引入一个新的
 * 「工具名」概念：backlink 里配额站（Semrush/Similarweb）的 session 名本来就固定成
 * `semrush-nav`/`similarweb-nav`（见 opencli-core.mjs 的 quotaSession），这本身就是
 * 按工具分的——两个工具并发时天然落进两个不同的 slot，同一工具的调用天然共享同一个
 * slot 窗口，与契约"并发需要可见性的工具各开一个 slot"的要求一致，且不用在
 * createAutomationWindow 的入参里再加一个"工具名"概念。非配额站的 session 名带
 * per-conversation 后缀，每个会话独立一个 slot，只会更隔离，不会破坏隔离。
 * 清洗成契约的 slot 名正则 `^[A-Za-z0-9_.-]{1,40}$`——session 名已经只含
 * `[a-z0-9-]`（见 validateSession），这里只需要再截到 40 字符。
 */
export function sanitizeSlot(session, fallback = 'default') {
  const cleaned = String(session ?? '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
  return cleaned || fallback;
}

/**
 * 纯函数：判断 `opencli browser window status -f json` 的返回值是否代表"opencli 支持
 * dedicated 窗口模式"。契约（dedicated-window-contract.md 第 3 节 "Feature detection
 * for scripts"）：解析成功、`supported===true`、且 `capabilities` 含 `dedicated-window`
 * 才算支持；其它任何形状——旧 CLI 的帮助/报错文本（解析失败传 null 进来）、旧扩展答的
 * 会话数组（`Array.isArray`）、桥不可达、`supported`字段缺失或为 false、capabilities
 * 里没有这个能力——都是不支持。不支持就退回现有 JXA+osascript 路径，不是抛错。
 */
export function detectDedicatedSupport(statusJson) {
  if (Array.isArray(statusJson)) return { supported: false, reason: 'extension-too-old', capabilities: [] };
  if (!statusJson || typeof statusJson !== 'object') return { supported: false, reason: 'unavailable', capabilities: [] };
  const capabilities = Array.isArray(statusJson.capabilities) ? statusJson.capabilities : [];
  if (statusJson.supported !== true) return { supported: false, reason: statusJson.reason || 'not-supported', capabilities };
  if (!capabilities.includes('dedicated-window')) return { supported: false, reason: 'missing-capability', capabilities };
  return { supported: true, reason: null, capabilities };
}

/* ------------------------------------------------------------------ *
 * 默认副作用实现（真实机器）
 * ------------------------------------------------------------------ */

const JXA_SCREENS = 'ObjC.import("AppKit"); var s=$.NSScreen.screens; var o=[]; for (var i=0;i<s.count;i++){var x=s.objectAtIndex(i); var f=x.frame; o.push({name: ObjC.unwrap(x.localizedName), x:f.origin.x, y:f.origin.y, w:f.size.width, h:f.size.height});} JSON.stringify(o)';

// 只读：running() 不会拉起 Chrome；URL 只在这里判空白页，不返回。
const jxaWindowInfo = (windowId) => `var c=Application("Google Chrome"); if(!c.running()){JSON.stringify({running:false})} else { var ws=c.windows.whose({id: ${Number(windowId)}})(); if(!ws.length){JSON.stringify({running:true, found:false})} else { var w=ws[0]; var b=w.bounds(); var t=w.tabs(); var tabs=[]; for (var i=0;i<t.length;i++){ var u=""; try{u=String(t[i].url()||"")}catch(e){} tabs.push({id:t[i].id(), blank:(u===""||u==="about:blank"||u.indexOf("data:")===0)}); } JSON.stringify({running:true, found:true, bounds:{left:b.x, top:b.y, right:b.x+b.width, bottom:b.y+b.height}, tabs:tabs}); } }`;

export const DEFAULT_PLACEHOLDER_URL = 'https://example.com/';

export function defaultAutomationDeps({ session, env, placeholderUrl = process.env.BACKLINK_AUTOMATION_PLACEHOLDER_URL || DEFAULT_PLACEHOLDER_URL } = {}) {
  if (!/^https?:\/\//i.test(placeholderUrl)) throw new Error('Automation placeholder URL must be http(s): opencli open rejects other schemes.');
  const runOsa = async (args, timeout = 10_000) => (await execFileP('osascript', args, { timeout, maxBuffer: 1024 * 1024 })).stdout.trim();
  // dedicated 会话命令：`dedicated` 为 {slot, display} 时用 --window dedicated +
  // OPENCLI_WINDOW_SLOT/_DISPLAY 环境变量；不传（legacy 调用点全部如此）时行为与接入
  // dedicated 之前逐字节一致（--window isolated），一个参数都没多传给 opencli()。
  const sessionCmd = (args, timeoutMs = 60_000, dedicated = null) => opencli(['browser', session, ...args], {
    windowMode: dedicated ? 'dedicated' : 'isolated',
    // bounds 优先于 display：重摆到空闲位置之后，后续每条命令都必须带同一份 bounds，
    // 否则扩展会按 display 模式把 placement 重置回原来那个撞车的格子，把窗口挪回去。
    env: dedicated
      ? {
        ...env,
        OPENCLI_WINDOW_SLOT: dedicated.slot,
        ...(dedicated.bounds
          ? { OPENCLI_WINDOW_BOUNDS: formatBounds(dedicated.bounds) }
          : (dedicated.display ? { OPENCLI_WINDOW_DISPLAY: dedicated.display } : {})),
      }
      : env,
    timeoutMs,
  });
  return {
    listScreens: async () => JSON.parse(await runOsa(['-l', 'JavaScript', '-e', JXA_SCREENS])),
    listSessions: async () => {
      const out = await opencli(['browser', 'sessions', '-f', 'json'], { timeoutMs: 20_000, allowFailure: true });
      try { return firstJson(out.stdout); } catch { return []; }
    },
    windowInfo: async (windowId) => JSON.parse(await runOsa(['-l', 'JavaScript', '-e', jxaWindowInfo(windowId)])),
    // 依据：plan 实测 `set bounds of window id` 前后前台应用均为用户原来的应用，不激活 Chrome。
    // 这里不写 activate，也不写 `set index`（后者会把窗口排到最前）。dedicated 路径不调用这个。
    setWindowBounds: async (windowId, b) => runOsa(['-e',
      `tell application "Google Chrome" to set bounds of window id ${Number(windowId)} to {${Math.round(b.left)}, ${Math.round(b.top)}, ${Math.round(b.right)}, ${Math.round(b.bottom)}}`]),
    // System Events 只读查询前台进程名，不发任何写指令。
    frontmostApp: async () => runOsa(['-e', 'tell application "System Events" to get name of first process whose frontmost is true'], 5_000),
    // 只为让扩展建出 isolated 窗口和本 session 的标签页；随后启动流程会在同一标签页里导航走。
    // opencli `open` 只接受 http(s)（about:blank / data: 实测报 Blocked URL scheme），所以用一个
    // 无登录、无配额的公共占位页，可用 BACKLINK_AUTOMATION_PLACEHOLDER_URL 覆盖。
    // `dedicated` 传入时（{slot, display}）改用 dedicated 窗口模式建标签页,扩展自己把它
    // 放进对应 slot 的窗口——不再需要下面的 windowInfo/classifyWindowTabs/setWindowBounds
    // 那一整套"先确认窗口安全再移动"的逻辑,那是专门给"用户可能借用了这个窗口"兜底的。
    openPlaceholder: async (dedicated = null) => sessionCmd(['open', placeholderUrl], 90_000, dedicated),
    closeSession: async () => opencli(['browser', session, 'close'], { windowMode: 'isolated', env, timeoutMs: 30_000, allowFailure: true }),
    listTabs: async (dedicated = null) => { const out = await sessionCmd(['tab', 'list'], 30_000, dedicated); try { return firstJson(out.stdout); } catch { return []; } },
    // 扩展侧实现只有 chrome.tabs.update(id, {active:true})：切窗口内活动标签，不 focus 窗口。
    selectTab: async (page, dedicated = null) => sessionCmd(['tab', 'select', String(page)], 30_000, dedicated),
    readVisibility: async (dedicated = null) => {
      const out = await sessionCmd(['eval', 'JSON.stringify({vis: document.visibilityState, sx: screenX, sy: screenY})'], 30_000, dedicated);
      return firstJson(out.stdout);
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    // ── dedicated 能力探测 / 窗口摆放：两个新的会话无关命令，绕开 opencli() 的
    // --window 注入逻辑直接 run()（'window' 不是会话名，是子命令本身，混进
    // resolveBrowserWindowArgs 会把 --window 错插成会话名参数）。allowFailure：
    // 旧 CLI 打印帮助/报错、桥不可达时都要拿到 stdout 而不是抛异常，解析失败统一
    // 返回 null，交给 detectDedicatedSupport 判定为不支持。
    windowStatus: async () => {
      let out;
      try { out = await run('opencli', ['browser', 'window', 'status', '-f', 'json'], { timeoutMs: 15_000, allowFailure: true }); }
      catch { return null; }
      try { return firstJson(out.stdout); } catch { return null; }
    },
    windowEnsure: async ({ slot, display, bounds } = {}) => {
      const args = ['browser', 'window', 'ensure', '--slot', String(slot || 'default')];
      if (bounds) args.push('--bounds', formatBounds(bounds));
      else if (display) args.push('--display', String(display));
      args.push('-f', 'json');
      let out;
      try { out = await run('opencli', args, { timeoutMs: 20_000, allowFailure: true }); }
      catch { return null; }
      try { return firstJson(out.stdout); } catch { return null; }
    },
  };
}

/* ------------------------------------------------------------------ *
 * 控制器
 * ------------------------------------------------------------------ */

/** tab list 里挑本 session 的活动候选：只有一个就用它；多个时优先 http(s)/about 页中的第一个。 */
export function chooseTabTarget(tabs) {
  const list = (Array.isArray(tabs) ? tabs : []).filter((t) => t && (t.page || t.targetId));
  if (!list.length) return null;
  const pick = list.length === 1 ? list[0]
    : (list.find((t) => t.active === true || t.selected === true) || list.find((t) => /^https?:/.test(String(t.url || ''))) || list[0]);
  return pick.page || pick.targetId;
}

/**
 * createAutomationWindow({ session, deps, matcher, fallbackWindowMode, maxRecoveries, log })
 *   .prepare()                  启动前调用：检测屏幕、确保窗口在虚拟屏上、选中标签、确认 visible
 *   .ensureVisible(reason)      每次关键读/导航前调用；visible 直接返回，hidden 才走恢复（有上限）
 *   .recordRead({vis, label})   读数级别记录可见性，并按节流采样前台应用
 *   .summary()                  写进输出的 automationWindow 对象
 *   .mode                       'virtual-display' | 'fallback'
 *   .windowMode                 传给 opencli 的窗口模式（virtual-display 时是 'dedicated' 或 'isolated'）
 *   .opencliEnv                 dedicated 时是 {OPENCLI_WINDOW,OPENCLI_WINDOW_SLOT,OPENCLI_WINDOW_DISPLAY}，
 *                                否则 {}——调用方（lib-tools-share.mjs）合并进自己后续 opencli 调用的 env，
 *                                让面板导航/eval 等命令也落在同一个 dedicated 窗口里。
 */
export function createAutomationWindow({
  session,
  deps,
  matcher = { disabled: false, matcher: DEFAULT_DISPLAY_MATCH, source: 'default', pattern: String(DEFAULT_DISPLAY_MATCH) },
  fallbackWindowMode = 'active',
  maxRecoveries = 4,
  visiblePollMs = 500,
  visiblePollTries = 8,
  frontmostIntervalMs = 5000,
  slot,
  log = () => {},
} = {}) {
  if (!deps) throw new Error('createAutomationWindow requires deps (use defaultAutomationDeps).');
  const sampler = createFrontmostSampler({ readFrontmost: deps.frontmostApp, now: deps.now, minIntervalMs: frontmostIntervalMs });
  const dedicatedSlot = sanitizeSlot(typeof slot === 'string' && slot ? slot : session);
  const st = {
    mode: 'fallback',
    strategy: null, // 'dedicated' | 'osascript' | null（尚未成功摆放，或已回退到 fallback）
    fallbackReason: null,
    display: null,
    windowId: null,
    windowMode: fallbackWindowMode,
    slot: dedicatedSlot,
    dedicatedSupport: null, // 最近一次 windowStatus() 探测结果的摘要，见 detectDedicatedSupport
    dedicatedDisplay: null, // window status 里选中的那块屏（几何先行，名字只是辅助信号）
    dedicatedPattern: null, // 传给扩展的 display 模式串（名字为空时是 /.*/）
    dedicatedBounds: null,  // 重摆到空闲位置后钉死的窗口矩形；非空时压过 display 模式
    relocations: 0,
    relocationFailures: 0,
    moves: 0,
    tabSelects: 0,
    recoveries: 0,
    recoveryCapReached: false,
    sessionRelocations: [],
    refusedMoves: [],
    visibility: { reads: 0, visible: 0, hidden: 0, other: 0, first: null, last: null },
    events: [],
    errors: [],
  };
  const event = (name, extra = {}) => { if (st.events.length < 40) st.events.push({ at: new Date(deps.now()).toISOString(), name, ...extra }); };
  const err = (where, e) => { if (st.errors.length < 20) st.errors.push(`${where}: ${String(e?.message || e).replace(/__gmitm=[^&\s"']+/g, '__gmitm=<redacted>').slice(0, 160)}`); };

  function toFallback(reason) {
    st.mode = 'fallback';
    st.fallbackReason = reason;
    st.windowMode = fallbackWindowMode;
    event('fallback', { reason });
  }

  async function detectDisplay() {
    if (matcher.disabled) return { display: null, reason: 'disabled-by-config' };
    let screens;
    try { screens = await deps.listScreens(); } catch (e) { err('listScreens', e); return { display: null, reason: 'screen-query-failed' }; }
    const display = pickAutomationDisplay(toGlobalTopLeft(screens), matcher.matcher);
    return display ? { display, reason: null } : { display: null, reason: 'no-virtual-display' };
  }

  async function knownTabIds() {
    const sessions = await deps.listSessions();
    return { sessions, ids: new Set(sessions.map((s) => Number(s?.tabId)).filter(Number.isInteger)) };
  }

  /** 确保本 session 的标签页在一个可安全移动的专用窗口里；返回 windowId 或 null（已回退）。 */
  async function ensureSessionWindow() {
    let { sessions, ids } = await knownTabIds();
    let entry = findSessionEntry(sessions, session);
    if (entry) {
      let info;
      try { info = await deps.windowInfo(entry.windowId); } catch (e) { err('windowInfo', e); info = null; }
      const verdict = info?.found ? classifyWindowTabs({ tabs: info.tabs, knownTabIds: ids }) : { safe: false, reason: 'session-window-not-found' };
      if (!verdict.safe) {
        // 本 session 的标签页在用户窗口里（上一次用 active/background 跑时被塞进去的）。
        // 不动那个窗口；只释放本 session 自己的租约，再用 isolated 重新开。
        st.sessionRelocations.push({ from: entry.windowId, reason: verdict.reason, foreignTabs: verdict.foreignTabs ?? null });
        event('release-session-from-shared-window', { windowId: entry.windowId, reason: verdict.reason });
        try { await deps.closeSession(); } catch (e) { err('closeSession', e); }
        entry = null;
      }
    }
    if (!entry) {
      try { await deps.openPlaceholder(); } catch (e) { err('openPlaceholder', e); }
      ({ sessions, ids } = await knownTabIds());
      entry = findSessionEntry(sessions, session);
      if (!entry) { toFallback('session-window-not-found'); return null; }
    }
    st.windowId = entry.windowId;
    return { windowId: entry.windowId, ids };
  }

  /** 窗口不在虚拟屏上就移过去——仅当窗口内全是 opencli 已知标签页/空白页。 */
  async function placeWindow(windowId, ids, display) {
    let info;
    try { info = await deps.windowInfo(windowId); } catch (e) { err('windowInfo', e); toFallback('chrome-window-query-failed'); return false; }
    if (!info?.running || !info?.found) { toFallback('session-window-not-found'); return false; }
    const verdict = classifyWindowTabs({ tabs: info.tabs, knownTabIds: ids });
    if (!verdict.safe) {
      st.refusedMoves.push({ windowId, reason: verdict.reason, foreignTabs: verdict.foreignTabs });
      toFallback('automation-window-has-foreign-tabs');
      return false;
    }
    if (windowCenterInDisplay(info.bounds, display)) return true;
    const target = targetWindowBounds(display);
    try {
      await deps.setWindowBounds(windowId, target);
      st.moves += 1;
      event('moved-window', { windowId, to: target });
    } catch (e) { err('setWindowBounds', e); toFallback('chrome-window-query-failed'); return false; }
    return true;
  }

  async function selectSessionTab() {
    let tabs = [];
    try { tabs = await deps.listTabs(); } catch (e) { err('listTabs', e); }
    const page = chooseTabTarget(tabs);
    if (!page) return false;
    try { await deps.selectTab(page); st.tabSelects += 1; return true; } catch (e) { err('selectTab', e); return false; }
  }

  /** dedicated 版的选中标签——独立于 selectSessionTab，走 dedicated 窗口模式+slot 环境变量。 */
  async function selectDedicatedTab(dedicated) {
    let tabs = [];
    try { tabs = await deps.listTabs(dedicated); } catch (e) { err('listTabs', e); }
    const page = chooseTabTarget(tabs);
    if (!page) return false;
    try { await deps.selectTab(page, dedicated); st.tabSelects += 1; return true; } catch (e) { err('selectTab', e); return false; }
  }

  async function readVis(dedicated) {
    try {
      const r = dedicated ? await deps.readVisibility(dedicated) : await deps.readVisibility();
      return r?.vis ?? null;
    } catch (e) { err('readVisibility', e); return null; }
  }

  async function pollVisible(label, dedicated, { record = true } = {}) {
    let vis = null;
    for (let i = 0; i < visiblePollTries; i += 1) {
      vis = dedicated ? await readVis(dedicated) : await readVis();
      if (vis === 'visible') break;
      await deps.sleep(visiblePollMs);
    }
    if (record) recordRead({ vis, label });
    return vis;
  }

  function recordRead({ vis, label = 'read' } = {}) {
    const v = st.visibility;
    v.reads += 1;
    if (vis === 'visible') v.visible += 1; else if (vis === 'hidden') v.hidden += 1; else v.other += 1;
    v.first ??= vis ?? null;
    v.last = vis ?? null;
    // 采样节流在 sampler 内部；这里不 await，读数路径不被 osascript 拖慢。
    sampler.sample(label).catch(() => {});
  }

  /**
   * 试一次 dedicated 路径。`{attempted:false}` 表示 dedicated 不适用（未支持/未开启/
   * 没有匹配屏），调用方原样落到现有 JXA 路径，`st` 不受任何影响。`{attempted:true}`
   * 表示已经确认支持且找到匹配屏——从这里开始只走 dedicated,不管后面 ensure 是否成功
   * 都不会再退回 JXA 路径（两套隔离机制不混用），失败就地判成 fallback。
   */
  async function tryDedicated(label) {
    if (matcher.disabled) return { attempted: false };
    let statusJson;
    try { statusJson = await deps.windowStatus(); } catch (e) { err('windowStatus', e); statusJson = null; }
    const support = detectDedicatedSupport(statusJson);
    st.dedicatedSupport = support;
    if (!support.supported) return { attempted: false };
    const displays = statusJson && Array.isArray(statusJson.displays) ? statusJson.displays : null;
    if (!displays) return { attempted: false };
    // 几何先行：名字匹配不上（本机 chrome.system.display 的 name 全是空字符串）时不再
    // 直接放弃 dedicated——那等于静默退回会抢焦点的 osascript 路径。
    const display = pickDedicatedDisplay(displays, matcher.matcher, { allowNameless: matcher.source === 'default' });
    if (!display) return { attempted: false };
    st.dedicatedDisplay = display;
    st.dedicatedPattern = dedicatedDisplayPattern(display);

    let ensured;
    try { ensured = await deps.windowEnsure({ slot: dedicatedSlot, display: st.dedicatedPattern }); }
    catch (e) { err('windowEnsure', e); ensured = null; }
    if (!ensured || ensured.placement?.displayFound === false) {
      toFallback('virtual-display-lost');
      return { attempted: true, vis: null };
    }

    st.mode = 'virtual-display';
    st.strategy = 'dedicated';
    st.fallbackReason = null;
    st.windowMode = 'dedicated';
    st.display = { name: display.name, bounds: { ...display.bounds } };
    st.windowId = Number.isInteger(ensured.windowId) ? ensured.windowId : null;
    event('dedicated-ensure', { slot: dedicatedSlot, created: Boolean(ensured.created), moved: Boolean(ensured.moved), onDisplay: ensured.onDisplay ?? null, pattern: st.dedicatedPattern });

    try { await deps.openPlaceholder(dedicatedMarker()); } catch (e) { err('openPlaceholder', e); }
    await sampler.sample(`${label}:after-select`, { force: true });
    // 摆放阶段不记读数：窗口刚建出来那一瞬间的 hidden 不该被算成「首次读数是 hidden」
    // 的完整性 blocker（问题 4）。只有这一轮的**最终**结果才记一次。
    let vis = await pollVisible(label, dedicatedMarker(), { record: false });
    if (vis !== 'visible' && await relocateToFreeRect('occluded-at-arrange')) {
      await selectDedicatedTab(dedicatedMarker());
      vis = await pollVisible(label, dedicatedMarker(), { record: false });
    }
    recordRead({ vis, label });
    return { attempted: true, vis };
  }

  /** 当前这轮 dedicated 会话命令要带的窗口标记：重摆过就钉死在那块 bounds 上。 */
  function dedicatedMarker() {
    return st.dedicatedBounds
      ? { slot: dedicatedSlot, bounds: st.dedicatedBounds }
      : { slot: dedicatedSlot, display: st.dedicatedPattern || matcher.pattern };
  }

  /**
   * 专用窗口读到 hidden，多半是被同一块屏上另一个 slot 的窗口整个压住了（扩展按固定
   * 1280x900 切格，格子用完就绕回第 0 格重叠）。这里不等扩展改：自己从 window status
   * 拿到同屏所有已存在窗口的矩形，算一块不重叠的位置，用 `--bounds` 把自己挪过去。
   * 挪成功后 `st.dedicatedBounds` 会一直带在后续每条命令上，避免被 display 模式挪回去。
   */
  async function relocateToFreeRect(reason) {
    const display = st.dedicatedDisplay;
    if (!display) return false;
    let status = null;
    try { status = await deps.windowStatus(); } catch (e) { err('windowStatus', e); }
    const windows = Array.isArray(status?.windows) ? status.windows : [];
    const occupied = windows
      .filter((w) => w && w.exists !== false && w.bounds && String(w.slot) !== String(dedicatedSlot))
      .map((w) => w.bounds);
    const area = display.workArea && Number(display.workArea.width) > 0 ? display.workArea : display.bounds;
    const rect = pickFreeRect({ area, occupied });
    if (!rect) {
      st.relocationFailures += 1;
      event('dedicated-relocate-failed', { reason, occupied: occupied.length });
      return false;
    }
    let ensured;
    try { ensured = await deps.windowEnsure({ slot: dedicatedSlot, bounds: rect }); }
    catch (e) { err('windowEnsure', e); ensured = null; }
    if (!ensured) return false;
    st.dedicatedBounds = rect;
    st.relocations += 1;
    st.windowId = Number.isInteger(ensured.windowId) ? ensured.windowId : st.windowId;
    event('dedicated-relocate', { reason, slot: dedicatedSlot, bounds: rect, occupied: occupied.length });
    return true;
  }

  /** 完整的一轮摆放：先试 dedicated，不适用才走会话窗口 → 移窗 → 选中标签 → 等 visible。 */
  async function arrange(label) {
    const dedicated = await tryDedicated(label);
    if (dedicated.attempted) return dedicated.vis;
    const found = await detectDisplay();
    if (!found.display) { toFallback(found.reason); return null; }
    st.display = found.display;
    st.mode = 'virtual-display';
    st.fallbackReason = null;
    st.windowMode = 'isolated';
    const win = await ensureSessionWindow();
    if (!win) return null;
    if (!(await placeWindow(win.windowId, win.ids, found.display))) return null;
    await selectSessionTab();
    await sampler.sample(`${label}:after-select`, { force: true });
    return pollVisible(label);
  }

  async function prepare() {
    await sampler.sample('prepare:before', { force: true });
    const vis = await arrange('prepare');
    log(`[automation-window] mode=${st.mode}${st.fallbackReason ? ` reason=${st.fallbackReason}` : ''} windowId=${st.windowId ?? '-'} moves=${st.moves} vis=${vis ?? '-'}`);
    return { mode: st.mode, windowMode: st.windowMode, vis, fallbackReason: st.fallbackReason };
  }

  /** dedicated 模式下的 ensureVisible：hidden 时 windowEnsure 重新摆放 + tab select + 轮询。 */
  async function ensureVisibleDedicated(reason) {
    const marker = dedicatedMarker();
    const vis = await readVis(marker);
    if (vis === 'visible') { recordRead({ vis, label: reason }); return { mode: st.mode, visible: true }; }
    recordRead({ vis, label: `${reason}:hidden` });
    if (st.recoveries >= maxRecoveries) {
      st.recoveryCapReached = true;
      return { mode: st.mode, visible: false, capReached: true };
    }
    st.recoveries += 1;
    event('recover', { reason, vis });
    let ensured;
    try {
      ensured = st.dedicatedBounds
        ? await deps.windowEnsure({ slot: dedicatedSlot, bounds: st.dedicatedBounds })
        : await deps.windowEnsure({ slot: dedicatedSlot, display: st.dedicatedPattern || matcher.pattern });
    } catch (e) { err('windowEnsure', e); ensured = null; }
    if (!ensured || ensured.placement?.displayFound === false) {
      toFallback('virtual-display-lost');
      return { mode: st.mode, visible: false, displayLost: true, fallbackReason: st.fallbackReason };
    }
    st.windowId = Number.isInteger(ensured.windowId) ? ensured.windowId : st.windowId;
    event('dedicated-ensure', { slot: dedicatedSlot, created: Boolean(ensured.created), moved: Boolean(ensured.moved), onDisplay: ensured.onDisplay ?? null, recovery: reason });
    await selectDedicatedTab(dedicatedMarker());
    let after = await pollVisible(`recover:${reason}`, dedicatedMarker(), { record: false });
    // 还是 hidden：多半是被同屏另一个 slot 压住了，换一块空闲位置再看一次。
    if (after !== 'visible' && await relocateToFreeRect(`occluded-at-${reason}`)) {
      await selectDedicatedTab(dedicatedMarker());
      after = await pollVisible(`recover:${reason}`, dedicatedMarker(), { record: false });
    }
    recordRead({ vis: after, label: `recover:${reason}` });
    return { mode: st.mode, visible: after === 'visible' };
  }

  async function ensureVisible(reason = 'check') {
    if (st.mode !== 'virtual-display') return { mode: st.mode, visible: null, skipped: true };
    if (st.strategy === 'dedicated') return ensureVisibleDedicated(reason);
    const vis = await readVis();
    if (vis === 'visible') { recordRead({ vis, label: reason }); return { mode: st.mode, visible: true }; }
    recordRead({ vis, label: `${reason}:hidden` });
    if (st.recoveries >= maxRecoveries) {
      st.recoveryCapReached = true;
      return { mode: st.mode, visible: false, capReached: true };
    }
    st.recoveries += 1;
    event('recover', { reason, vis });
    const after = await arrange(`recover:${reason}`);
    if (st.mode !== 'virtual-display') return { mode: st.mode, visible: false, displayLost: st.fallbackReason === 'no-virtual-display' || st.fallbackReason === 'screen-query-failed', fallbackReason: st.fallbackReason };
    return { mode: st.mode, visible: after === 'visible' };
  }

  function summary() {
    const f = sampler.state;
    return {
      mode: st.mode,
      strategy: st.mode === 'virtual-display' ? (st.strategy === 'dedicated' ? 'dedicated' : 'osascript') : null,
      ...(st.fallbackReason ? { fallbackReason: st.fallbackReason } : {}),
      display: st.display ? { name: st.display.name, bounds: st.display.bounds } : null,
      displayMatcher: { source: matcher.source, pattern: matcher.pattern, disabled: matcher.disabled },
      dedicatedPlacement: st.strategy === 'dedicated'
        ? { pattern: st.dedicatedPattern, bounds: st.dedicatedBounds, relocations: st.relocations, relocationFailures: st.relocationFailures }
        : null,
      windowId: st.windowId,
      windowMode: st.windowMode,
      slot: st.slot,
      dedicatedSupport: st.dedicatedSupport,
      moves: st.moves,
      tabSelects: st.tabSelects,
      recoveries: st.recoveries,
      maxRecoveries,
      recoveryCapReached: st.recoveryCapReached,
      sessionRelocations: st.sessionRelocations,
      refusedMoves: st.refusedMoves,
      visibility: { ...st.visibility, visibleRatio: st.visibility.reads ? Number((st.visibility.visible / st.visibility.reads).toFixed(3)) : null },
      frontmostAppSamples: f.samples,
      frontmost: { samples: f.total, chromeFrontmost: f.chromeFrontmost, errors: f.errors },
      events: st.events,
      errors: st.errors,
    };
  }

  return {
    prepare, ensureVisible, recordRead, summary,
    sampleFrontmost: (label) => sampler.sample(label, { force: true }),
    get mode() { return st.mode; },
    get windowMode() { return st.windowMode; },
    get fallbackReason() { return st.fallbackReason; },
    /**
     * 只有真的走了 dedicated 才非空——调用方（lib-tools-share.mjs 的 launchToolInner）
     * 把它合并进自己后续每一次 opencli 调用的 env，让面板导航、eval 等命令都落在同一个
     * dedicated 窗口/slot 里，而不是被扩展当成一个新的、没有 slot 的默认窗口。
     */
    get opencliEnv() {
      if (st.mode !== 'virtual-display' || st.strategy !== 'dedicated') return {};
      // 重摆过就传 bounds，别再传 display：display 会让扩展每条命令都把 placement 重算回
      // 原来那个撞车的格子，等于把窗口挪回被遮挡的位置。
      if (st.dedicatedBounds) {
        return {
          OPENCLI_WINDOW: 'dedicated',
          OPENCLI_WINDOW_SLOT: st.slot,
          OPENCLI_WINDOW_BOUNDS: formatBounds(st.dedicatedBounds),
        };
      }
      const pattern = st.dedicatedPattern || matcher.pattern;
      return {
        OPENCLI_WINDOW: 'dedicated',
        OPENCLI_WINDOW_SLOT: st.slot,
        ...(pattern ? { OPENCLI_WINDOW_DISPLAY: pattern } : {}),
      };
    },
  };
}

/** 调用方没走虚拟屏幕策略时也要写一份 automationWindow，保持字段形状一致。 */
export function plainAutomationSummary({ windowMode, reason = 'explicit-window-mode' } = {}) {
  return {
    mode: 'fallback', fallbackReason: reason, display: null, windowId: null, windowMode: windowMode ?? null,
    moves: 0, tabSelects: 0, recoveries: 0, visibility: null, frontmostAppSamples: [],
  };
}

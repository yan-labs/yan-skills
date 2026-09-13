/**
 * `resolveSimilarwebWindowMode`（lib-similarweb.mjs）——2026-09-14 新增。
 *
 * 背景：`similarweb-batch.mjs` 原来是 `flags.window === 'foreground' ? 'foreground'
 * : 'background'` 的二值化，`active`/`isolated` 都会被压成 `background`。
 * `similarweb-keywords.mjs` 更糟：它把整个 `flags` 对象当一个属性传给
 * `launchTool({ tool, session, flags, ... })`，`launchToolInner` 只解构认识的
 * 字段名，`flags` 被静默丢弃，`--window` 这个 CLI flag 从来没生效过，一直隐式
 * 落在 `background`。
 *
 * 这里钉住修复之后的共享行为：默认 `active`（选中标签页、不节流，但不夺 OS
 * 焦点，跟 similarweb-query.mjs 同一次修复统一默认），显式传值原样透传。
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { resolveSimilarwebWindowMode } from '../scripts/lib-similarweb.mjs';

test('resolveSimilarwebWindowMode: no --window at all → active (was background)', () => {
  assert.equal(resolveSimilarwebWindowMode(undefined), 'active');
  assert.equal(resolveSimilarwebWindowMode(null), 'active');
  assert.equal(resolveSimilarwebWindowMode(''), 'active');
  assert.equal(resolveSimilarwebWindowMode(true), 'active', 'a bare --window flag with no value parses to boolean true under parseFlags');
});

test('resolveSimilarwebWindowMode: explicit values pass through as-is, including active/isolated', () => {
  assert.equal(resolveSimilarwebWindowMode('foreground'), 'foreground');
  assert.equal(resolveSimilarwebWindowMode('active'), 'active');
  assert.equal(resolveSimilarwebWindowMode('background'), 'background');
  assert.equal(resolveSimilarwebWindowMode('isolated'), 'isolated');
});

test('resolveSimilarwebWindowMode: an unrecognised value falls back to the new default (active), not the old one (background)', () => {
  assert.equal(resolveSimilarwebWindowMode('typo'), 'active');
});

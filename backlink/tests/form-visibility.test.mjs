import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { makeSubmitGuard, releaseSubmitGuard } from '../scripts/opencli-core.mjs';

test('form scan and fill both reject off-page honeypot fields', async () => {
  // inspect-page.mjs's own census walk (visible()/classifyBlocker()/etc.) moved
  // into lib-form-scan.mjs on 2026-09-12 so submit-known.mjs (the known-forms
  // recipe driver) can share the exact same marker-per-element census instead
  // of carrying a second, drifting copy — see references/known-forms.md.
  for (const file of ['lib-form-scan.mjs', 'safe-fill.mjs']) {
    const source = await readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    const body = source.match(/const visible = \(element\) => \{([\s\S]*?)\n  \};/)?.[1];
    assert.ok(body, `${file} must define visible()`);
    const visible = vm.runInNewContext(`(element) => {${body}}`, {
      document: { documentElement: { clientWidth: 1200, scrollHeight: 3000 }, body: { scrollHeight: 3000 } },
      innerWidth: 1200,
      getComputedStyle: (element) => element.style,
    });
    const element = (rect) => ({ hidden: false, disabled: false, style: { display: 'block', visibility: 'visible', opacity: '1' }, getBoundingClientRect: () => rect });
    assert.equal(visible(element({ width: 100, height: 30, left: 10, right: 110, top: 200, bottom: 230 })), true);
    assert.equal(visible(element({ width: 100, height: 30, left: -9999, right: -9899, top: 200, bottom: 230 })), false);
    assert.equal(visible(element({ width: 100, height: 30, left: 10, right: 110, top: -9999, bottom: -9969 })), false);
    assert.equal(visible(element({ width: 100, height: 30, left: 10, right: 110, top: 9999, bottom: 10029 })), false);
  }
});

test('page-wide login copy does not block a complete comment form', async () => {
  const source = await readFile(new URL('../scripts/lib-form-scan.mjs', import.meta.url), 'utf8');
  const body = source.match(/const classifyBlocker = \(([^)]*)\) => ([^;]+);/)?.slice(1);
  assert.ok(body, 'lib-form-scan must define classifyBlocker()');
  const classifyBlocker = vm.runInNewContext(`(${body[0]}) => ${body[1]}`);
  assert.equal(classifyBlocker(false, true, 1), null);
  assert.equal(classifyBlocker(false, true, 0), 'login');
  assert.equal(classifyBlocker(true, false, 1), 'captcha');
});

test('CAPTCHA guard releases only for explicit human handoff', async () => {
  const source = await readFile(new URL('../scripts/safe-fill.mjs', import.meta.url), 'utf8');
  assert.match(source, /flags\['allow-captcha'\] === true && scan\.blocker === 'captcha'/);
  assert.match(source, /makeSubmitGuard\(input\.allowCaptcha\)/);

  const guard = makeSubmitGuard(true);
  let prevented = 0;
  guard.blockSubmit({ preventDefault: () => prevented += 1, stopImmediatePropagation: () => prevented += 1 });
  assert.equal(prevented, 2);
  assert.equal(guard.handoffOnly, true);

  const removed = [];
  const context = {
    __backlinkOpenCliSubmitGuard: guard,
  };
  const documentTarget = { removeEventListener: (...args) => removed.push(args) };
  const result = releaseSubmitGuard(context, documentTarget, false);
  assert.deepEqual({ ...result }, { released: false, reason: 'captcha_handoff_only', handoffOnly: true });
  assert.equal(removed.length, 0);
  assert.equal(context.__backlinkOpenCliSubmitGuard, guard);

  const handedOff = releaseSubmitGuard(context, documentTarget, true);
  assert.deepEqual(handedOff, { released: true, handoffOnly: true, submitAttempted: false });
  assert.equal(removed.length, 2);
  assert.equal(context.__backlinkOpenCliSubmitGuard, undefined);
});

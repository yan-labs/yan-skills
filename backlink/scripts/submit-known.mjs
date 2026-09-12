#!/usr/bin/env node
/**
 * submit-known.mjs — recipe-driven driver for a target that has ALREADY been
 * fully walked once by hand (inspect-page.mjs's census + human field-mapping
 * decision + a confirmed real submission). It exists to skip exactly one
 * step — the AI re-reading the census and re-deciding which control is which
 * field — and nothing else. Every runtime safety check that inspect-page.mjs
 * / safe-fill.mjs / release-submit-guard.mjs carry stays in force:
 *
 *   - the live page is re-scanned on every run (same lib-form-scan.mjs census
 *     inspect-page.mjs uses) so a changed page fails loudly instead of being
 *     filled blind;
 *   - safe-fill.mjs itself does the actual fill and its own live re-check
 *     (page identity / form identity / field identity / CAPTCHA / login) —
 *     this script builds it a fingerprint from the recipe's field mapping
 *     instead of from inspect-page's heuristic classifier, but the guard
 *     that runs immediately before every value is written is the same code;
 *   - release-submit-guard.mjs is still the only thing that lifts the
 *     submit-blocking guard, immediately before the real click;
 *   - a form's own terms/consent checkbox is never ticked without an
 *     explicit --confirm-terms on THIS run (see below) — recipe scripting
 *     must not quietly script away that human decision either;
 *   - an account-cohort recipe refuses to run at all without --confirmed-login
 *     on THIS run, for the same reason.
 *
 * A recipe (scripts/known-forms/<domain>.json) is valid ONLY for the exact
 * field structure it was verified against. If the live census no longer
 * resolves the recipe's field-map rules, this script fails loudly and says
 * so — it does not fall back to guessing. See references/known-forms.md for
 * the recipe schema, how to add one, and when a recipe goes stale.
 *
 * Usage:
 *   node scripts/submit-known.mjs --domain playlin.io --project crossword-ar \
 *     --payload payload.json [--dry-run] [--submit] [--session s]
 *
 *   node scripts/submit-known.mjs --domain projectpedia.net --project my-tool-site \
 *     --payload payload.json --confirmed-login [--confirm-terms] [--submit]
 *
 * Flags:
 *   --domain            required. Picks scripts/known-forms/<domain>.json,
 *                       or pass --recipe to point at a file directly.
 *   --project           required. A short slug identifying the caller (used
 *                       for the session name and, when the recipe declares
 *                       refreshParam, appended as ?<refreshParam>=<project>).
 *   --payload           JSON file with the submission content. Recognized
 *                       keys: url, name, email, description (safe-fill's own
 *                       four kinds) plus whatever the recipe's extraFields
 *                       declare (e.g. category, pricing). Individual keys can
 *                       also be passed inline as --url/--name/--email/--description.
 *   --dry-run           fill and validate everything, capture evidence, and
 *                       stop before the real submit click. Never touches the
 *                       ledger. This is the only way to test a recipe against
 *                       a target that has already been submitted to for real.
 *   --submit            without this, the default (like submit-directory.mjs)
 *                       is to fill and stop — same as --dry-run for the click
 *                       itself, but --submit is what actually clicks when
 *                       given (--dry-run always wins if both are passed).
 *   --confirmed-login   required for any recipe with requireConfirmedLogin.
 *                       This is a per-invocation human statement ("I checked,
 *                       the login for this account is still valid right
 *                       now"), never inferred from the DOM and never implied
 *                       by anything in the recipe file.
 *   --confirm-terms     required, on top of --confirmed-login, before this
 *                       script will tick a form's own terms/consent checkbox
 *                       and proceed to submit. Without it, a form that has
 *                       one is always filled and left staged (state
 *                       staged-terms) exactly like submit-directory.mjs's
 *                       Lane B — this flag is the "one exact submission
 *                       after review" carve-out in references/safety-policy.md,
 *                       not a standing default.
 *   --session           override the derived session name.
 *   --evidence-dir      override the derived evidence directory.
 *   --ledger            ledger file to write to on a real submitted outcome
 *                       (default .backlink/ledger.json, relative to cwd —
 *                       same convention as ledger.mjs / submit-directory.mjs).
 *   --no-ledger         skip the ledger write even on a real submit.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  opencli, openAndEval, parseFlags, printJson, required, showHelpIfRequested, validateSession,
} from './opencli-core.mjs';
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import { buildScanExpression } from './lib-form-scan.mjs';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Thrown to unwind to the single exit point below without skipping tmpDir cleanup. */
class Stop extends Error {
  constructor(code) { super('stop'); this.code = code; }
}

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);

const domain = required(flags, 'domain');
const project = required(flags, 'project');
if (!/^[a-z0-9][a-z0-9-]{0,40}$/i.test(project)) throw new Error('--project must look like a short slug (letters, numbers, hyphens).');

const dryRun = flags['dry-run'] === true;
const wantSubmit = flags.submit === true && !dryRun;
const confirmedLogin = flags['confirmed-login'] === true;
const confirmTerms = flags['confirm-terms'] === true;
const noLedger = flags['no-ledger'] === true;

const recipePath = typeof flags.recipe === 'string' ? flags.recipe : path.join(HERE, 'known-forms', `${domain}.json`);
const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
if (recipe.domain !== domain) throw new Error(`Recipe at ${recipePath} is for ${recipe.domain}, not ${domain}.`);

if (recipe.requireConfirmedLogin && !confirmedLogin) {
  throw new Error(
    `${domain} is a "${recipe.cohort}" cohort recipe (needs an existing logged-in session). `
    + 'Pass --confirmed-login only after you have checked, right now, that the login for this '
    + 'account is still valid. Scripting the field mapping away must not also script away that '
    + 'human decision — see references/known-forms.md.',
  );
}

// ---- payload ---------------------------------------------------------------
let payload = {};
if (typeof flags.payload === 'string') payload = JSON.parse(await readFile(flags.payload, 'utf8'));
for (const key of ['url', 'name', 'email', 'description']) {
  if (typeof flags[key] === 'string') payload[key] = flags[key];
}
for (const extraKey of Object.keys(recipe.extraFields || {})) {
  if (typeof flags[extraKey] === 'string') payload[extraKey] = flags[extraKey];
}
for (const key of recipe.payloadRequired || []) {
  if (typeof payload[key] !== 'string' || !payload[key].trim()) {
    throw new Error(`Recipe ${domain} requires payload.${key} (from --payload or --${key}).`);
  }
}

// ---- session / url / evidence -----------------------------------------------
const session = validateSession(
  typeof flags.session === 'string'
    ? flags.session
    : `${recipe.sessionPrefix || `backlink-known-${domain.replace(/[^a-z0-9]+/gi, '-')}`}-${project}`.slice(0, 63),
);
const windowMode = flags.window === 'foreground' ? 'foreground' : 'background';
const waitSeconds = Math.max(0, Math.min(15, Number(flags.wait || 3)));

let targetUrl = recipe.route;
if (recipe.refreshParam) {
  const u = new URL(targetUrl);
  u.searchParams.set(recipe.refreshParam, project);
  targetUrl = u.toString();
}

const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ script: 'submit-known', runTag: `${domain}-${project}` });
const scenes = [];
async function scene(tag, note = null) {
  const record = await captureScene({ session, outDir: evidenceDir, windowMode, tag, note });
  scenes.push(record);
  return record;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evalJs = async (js) => {
  const out = await opencli(['browser', session, 'eval', js], { windowMode, timeoutMs: 60_000 });
  try { return JSON.parse(out.stdout); } catch { return out.stdout; }
};

// ---- matching helpers --------------------------------------------------------
// Every fieldCensus entry's `semantic` is [tag, type, id, name, label, autocomplete, placeholder]
// (see lib-form-scan.mjs). A recipe rule matches on the keys it names, exactly —
// no regex, no fuzz. That precision is the point: a recipe exists because a
// human already read the real attribute values off this exact page once.
function matchesRule(entry, rule = {}) {
  const [tag, type, id, name] = entry.semantic;
  if (rule.tag != null && tag !== rule.tag) return false;
  if (rule.type != null && type !== rule.type) return false;
  if (rule.id != null && id !== rule.id) return false;
  if (rule.name != null && name !== rule.name) return false;
  return true;
}

function findOne(fieldCensus, rule) {
  const hits = fieldCensus.filter((entry) => matchesRule(entry, rule));
  return hits.length === 1 ? hits[0] : { ambiguousCount: hits.length };
}

/**
 * Pick the form in the census whose fieldCensus resolves the recipe's
 * fieldMap. Required kinds (recipe.payloadRequired) must resolve to exactly
 * one control; optional kinds are best-effort (null if missing/ambiguous).
 * Returns { form, fields, warnings } for the first form that resolves every
 * required kind, or null if no form in the census does.
 */
function pickForm(scan, recipeArg) {
  const requiredKinds = new Set(recipeArg.payloadRequired || []);
  for (const form of scan.forms) {
    const fields = {};
    const warnings = [];
    let ok = true;
    for (const [kind, rule] of Object.entries(recipeArg.fieldMap || {})) {
      const hit = findOne(form.fieldCensus, rule.match);
      if (hit && hit.marker) {
        fields[kind] = { marker: hit.marker, semantic: hit.semantic };
      } else if (requiredKinds.has(kind)) {
        ok = false;
        warnings.push(`required kind "${kind}" (${JSON.stringify(rule.match)}) resolved to ${hit?.ambiguousCount ?? 0} controls in form #${form.formIndex}`);
      } else {
        fields[kind] = null;
        warnings.push(`optional kind "${kind}" not found in form #${form.formIndex}, skipping`);
      }
    }
    if (ok) return { form, fields, warnings };
  }
  return null;
}

async function writeLedger(res, state, note) {
  const ledgerFile = typeof flags.ledger === 'string' ? flags.ledger : '.backlink/ledger.json';
  const ledgerPath = path.join(HERE, 'ledger.mjs');
  try {
    const { stdout: upsertOut } = await execFileAsync('node', [ledgerPath, 'upsert', '--url', recipe.route, '--file', ledgerFile]);
    const record = JSON.parse(upsertOut);
    await execFileAsync('node', [ledgerPath, 'transition', '--id', record.id, '--state', state, '--evidence', note, '--file', ledgerFile]);
    res.ledger = { file: ledgerFile, id: record.id, state };
  } catch (error) {
    res.ledgerError = String(error?.message || error).slice(0, 300);
  }
}

// =============================================================================
const result = { domain, project, url: targetUrl, at: new Date().toISOString(), dryRun, session };
let tmpDir = null;
try {
  // Step 1 — the same full census inspect-page.mjs takes, on the live page,
  // right now. This is what makes the recipe self-invalidating: if the site
  // changed its field names, this step still succeeds (it's just a census),
  // but pickForm() below will fail to resolve the recipe's rules against it.
  const scan = await openAndEval(session, targetUrl, buildScanExpression('directory'), {
    wait: waitSeconds, windowMode, timeoutMs: 120_000,
  });
  result.scannedUrl = scan.url;
  result.formCount = scan.formCount;

  const picked = pickForm(scan, recipe);
  if (!picked) {
    result.state = 'recipe-stale';
    result.error = 'None of the live forms resolved this recipe\'s fieldMap. The target\'s markup '
      + 'probably changed since the recipe was verified. Do not force it — re-run '
      + 'scripts/inspect-page.mjs on this URL, re-derive the field mapping by hand, and update '
      + `scripts/known-forms/${domain}.json (see references/known-forms.md).`;
    await scene('recipe-stale', result.error);
    throw new Stop(2);
  }
  result.formIndex = picked.form.formIndex;
  if (picked.warnings.length) result.pickWarnings = picked.warnings;

  // Step 2 — hand safe-fill.mjs a fingerprint built from the recipe's mapping
  // instead of from inspect-page's own heuristic `selectedForm`. Everything
  // downstream of this point runs safe-fill.mjs's actual code, unmodified:
  // its own re-check of page identity / form identity / field identity /
  // CAPTCHA / login happens inside that process, against the live page,
  // immediately before it writes any value.
  const fingerprint = {
    url: scan.url,
    formMarker: picked.form.marker,
    fields: picked.fields,
  };
  fingerprint.signature = JSON.stringify({ url: fingerprint.url, formMarker: fingerprint.formMarker, fields: fingerprint.fields });
  const syntheticScan = { fillable: true, fingerprint };

  tmpDir = await mkdtemp(path.join(tmpdir(), 'backlink-submit-known-'));
  const scanFile = path.join(tmpDir, 'scan.json');
  const payloadFile = path.join(tmpDir, 'payload.json');
  await writeFile(scanFile, JSON.stringify(syntheticScan), 'utf8');
  await writeFile(payloadFile, JSON.stringify(payload), 'utf8');

  const safeFillPath = path.join(HERE, 'safe-fill.mjs');
  let fillResult;
  try {
    const { stdout } = await execFileAsync('node', [
      safeFillPath, '--session', session, '--scan', scanFile, '--payload', payloadFile,
      '--evidence-dir', evidenceDir,
    ]);
    fillResult = JSON.parse(stdout);
  } catch (error) {
    // safe-fill.mjs exits 2 (not an uncaught crash) when its own guard refuses
    // a fill; execFile still throws on nonzero exit, but the refusal JSON —
    // reason + its own captureScene evidence — is on stdout.
    if (error.stdout) fillResult = JSON.parse(error.stdout);
    else throw error;
  }
  result.fill = fillResult;
  if (!fillResult.ok) {
    result.state = `fill-refused-${fillResult.reason || 'unknown'}`;
    throw new Stop(2);
  }

  // Step 3 — extra fields safe-fill.mjs's four kinds don't cover (selects).
  // Same safety pattern as safe-fill's own guard: re-verify page URL, form
  // marker, and field marker+semantic against the live page immediately
  // before writing anything, using the native property setter and a real
  // change event — this is the "equivalent, same safety level" implementation
  // the brief allows for the parts safe-fill.mjs does not itself cover.
  result.extraFields = {};
  for (const [kind, spec] of Object.entries(recipe.extraFields || {})) {
    const hit = findOne(picked.form.fieldCensus, spec.match);
    if (!hit || !hit.marker) { result.extraFields[kind] = { ok: false, reason: 'not_found_in_census' }; continue; }
    const wanted = payload[spec.payloadKey] || spec.default;
    if (!wanted) { result.extraFields[kind] = { ok: false, reason: 'no_value_and_no_default' }; continue; }
    const setSelect = `(() => {
      const fingerprint = ${JSON.stringify({ url: fingerprint.url, formMarker: fingerprint.formMarker })};
      const wanted = ${JSON.stringify(wanted)};
      const expectedMarker = ${JSON.stringify(hit.marker)};
      const expectedSemantic = ${JSON.stringify(hit.semantic)};
      if (location.href !== fingerprint.url) return { ok: false, reason: 'page_changed' };
      const form = [...document.forms].find((f) => f.__backlinkOpenCliScan === fingerprint.formMarker);
      if (!form) return { ok: false, reason: 'form_changed' };
      const field = [...form.querySelectorAll('select')].find((el) => el.__backlinkOpenCliScan === expectedMarker);
      if (!field) return { ok: false, reason: 'field_changed' };
      const semantic = [field.tagName.toLowerCase(), field.getAttribute('type') || '', field.id || '', field.name || ''];
      if (JSON.stringify(semantic) !== JSON.stringify(expectedSemantic.slice(0, 4))) return { ok: false, reason: 'field_changed' };
      const options = [...field.options];
      const match = options.find((o) => o.value === wanted)
        || options.find((o) => o.textContent.trim().toLowerCase() === String(wanted).toLowerCase());
      if (!match) return { ok: false, reason: 'option_not_found', available: options.map((o) => o.textContent.trim()) };
      field.value = match.value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, set: match.textContent.trim() };
    })()`;
    result.extraFields[kind] = await evalJs(setSelect);
  }

  // Step 4 — a form's own terms/consent checkbox is never ticked without an
  // explicit --confirm-terms on THIS run. Detect it from the recipe (declared
  // once, off the real census, same as every other field rule) rather than
  // re-guessing from the label text on every run.
  if (recipe.termsCheckbox) {
    const hit = findOne(picked.form.fieldCensus, recipe.termsCheckbox.match);
    if (hit && hit.marker) {
      if (!confirmTerms) {
        result.state = 'staged-terms';
        result.termsCheckboxLabel = hit.semantic[4];
        await scene('staged-terms', 'filled everything else; terms checkbox left unticked pending --confirm-terms');
        if (!noLedger && !dryRun) await writeLedger(result, 'filled', 'staged-terms: filled, terms checkbox left for a human — see evidenceDir');
        throw new Stop(0);
      }
      const tickResult = await evalJs(`(() => {
        const fingerprint = ${JSON.stringify({ url: fingerprint.url, formMarker: fingerprint.formMarker })};
        const expectedMarker = ${JSON.stringify(hit.marker)};
        if (location.href !== fingerprint.url) return { ok: false, reason: 'page_changed' };
        const form = [...document.forms].find((f) => f.__backlinkOpenCliScan === fingerprint.formMarker);
        if (!form) return { ok: false, reason: 'form_changed' };
        const field = [...form.querySelectorAll('input[type="checkbox"]')].find((el) => el.__backlinkOpenCliScan === expectedMarker);
        if (!field) return { ok: false, reason: 'field_changed' };
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
        setter.call(field, true);
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('click', { bubbles: true }));
        return { ok: true };
      })()`);
      result.termsCheckboxTicked = tickResult;
      if (!tickResult.ok) {
        result.state = `terms-checkbox-${tickResult.reason}`;
        await scene(result.state);
        throw new Stop(2);
      }
    }
  }

  // Step 5 — stop here for a dry run. Never touches the ledger. This is the
  // full pipeline minus the one irreversible action.
  if (dryRun) {
    result.state = 'dry-run-stopped-before-submit';
    await scene('dry-run-ready', 'safe-fill ok; recipe field mapping verified against the live page; stopping before the real submit click (--dry-run)');
    throw new Stop(0);
  }
  if (!wantSubmit) {
    result.state = 'filled-stopped';
    await scene('filled-stopped', 'filled and validated; --submit not given, stopping before the real submit click');
    if (!noLedger) await writeLedger(result, 'filled', 'filled-stopped: --submit not given');
    throw new Stop(0);
  }

  // Step 6 — the real submit. release-submit-guard.mjs is still the only
  // thing that lifts the guard safe-fill.mjs installed.
  const releasePath = path.join(HERE, 'release-submit-guard.mjs');
  const { stdout: releaseOut } = await execFileAsync('node', [releasePath, '--session', session]);
  result.release = JSON.parse(releaseOut);
  if (!result.release.released) {
    result.state = 'release-refused';
    await scene(result.state, JSON.stringify(result.release));
    throw new Stop(2);
  }

  const submitHit = findOne(picked.form.fieldCensus, recipe.submit?.match || { tag: 'button', type: 'submit' });
  if (!submitHit || !submitHit.marker) {
    result.state = 'no-submit-control';
    await scene(result.state);
    throw new Stop(2);
  }

  const clickOnce = async () => {
    const tag = await evalJs(`(() => {
      const fingerprint = ${JSON.stringify({ url: fingerprint.url, formMarker: fingerprint.formMarker })};
      const expectedMarker = ${JSON.stringify(submitHit.marker)};
      if (location.href !== fingerprint.url) return { ok: false, reason: 'page_changed' };
      const form = [...document.forms].find((f) => f.__backlinkOpenCliScan === fingerprint.formMarker);
      if (!form) return { ok: false, reason: 'form_changed' };
      const button = [...form.querySelectorAll('button,input[type="submit"]')].find((el) => el.__backlinkOpenCliScan === expectedMarker);
      if (!button) return { ok: false, reason: 'field_changed' };
      button.setAttribute('data-bl-submit-known', '1');
      return { ok: true, sel: '[data-bl-submit-known="1"]' };
    })()`);
    if (!tag.ok) return tag;
    await opencli(['browser', session, 'click', tag.sel], { windowMode, timeoutMs: 60_000 });
    return { ok: true };
  };

  const settle = async () => {
    let prev = null;
    let settled = false;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await sleep(1_000);
      const now = await evalJs('JSON.stringify({url:location.href,title:document.title,len:document.body.innerText.length})');
      const key = JSON.stringify(now);
      if (prev === key) { settled = true; break; }
      prev = key;
    }
    return settled;
  };

  const checkSuccess = async () => {
    if (recipe.success.type === 'navigation') {
      return evalJs(`JSON.stringify({
        ok: location.href.includes(${JSON.stringify(recipe.success.urlIncludes)})
          && document.body.innerText.includes(${JSON.stringify(recipe.success.textIncludes)}),
        url: location.href,
      })`);
    }
    // inline-text
    return evalJs(`JSON.stringify({
      ok: document.body.innerText.includes(${JSON.stringify(recipe.success.textIncludes)}),
      url: location.href,
    })`);
  };

  const click1 = await clickOnce();
  result.click1 = click1;
  if (!click1.ok) {
    result.state = `submit-click-${click1.reason}`;
    await scene(result.state);
    throw new Stop(2);
  }
  await settle();
  let outcome = await checkSuccess();
  result.outcomeCheck1 = outcome;

  if (!outcome.ok && recipe.retryClickIfNoChange) {
    // Known quirk (recipe-specific, see the recipe's own notes): an AJAX
    // handler that sometimes does not fire on the first click. Retry the
    // SAME real click exactly once — never more — and only because this
    // exact behavior was observed and documented by hand for this target.
    const click2 = await clickOnce();
    result.click2 = click2;
    if (click2.ok) {
      await settle();
      outcome = await checkSuccess();
      result.outcomeCheck2 = outcome;
    }
  }

  result.state = outcome.ok ? 'submitted' : 'outcome-unknown';
  await scene(`outcome-${result.state}`, `submit-known outcome: ${result.state}`);
  if (!noLedger) {
    await writeLedger(
      result,
      result.state === 'submitted' ? 'submitted' : 'filled',
      result.state === 'submitted'
        ? `submit-known.mjs recipe run: ${recipe.success.type === 'navigation' ? outcome.url : 'inline success text observed'}; evidence in ${evidenceDir}`
        : `submit-known.mjs: outcome-unknown after submit click, see evidence in ${evidenceDir}`,
    );
  }
  throw new Stop(0);
} catch (error) {
  if (error instanceof Stop) {
    process.exitCode = error.code || undefined;
  } else {
    result.state = result.state || 'error';
    result.error = String(error?.message || error).slice(0, 500);
    await scene('state-error', result.error);
    process.exitCode = 2;
  }
} finally {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
}

result.evidenceDir = evidenceDir;
result.scenes = scenes;
printJson(result);

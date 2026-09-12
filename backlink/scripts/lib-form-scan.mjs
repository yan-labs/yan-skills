/**
 * lib-form-scan.mjs — the one full-form census + marker-assignment expression.
 *
 * Extracted 2026-09-12 from inspect-page.mjs so a second caller can get the
 * exact same per-element census (semantic seven-tuple + stable `marker` +
 * visibility, one entry per control, hidden fields included) without a second,
 * drifting copy of the DOM walk.
 *
 * Why this needed to be extracted rather than importing inspect-page.mjs
 * directly: inspect-page.mjs is a CLI entry point — it runs `parseFlags` and
 * `required(flags, 'url')` at module top level, so importing it as a library
 * executes a real browser round-trip (or throws) as a side effect of the
 * import. `scripts/submit-known.mjs` (the known-forms recipe driver, see
 * `references/known-forms.md`) needs the census function itself, not the CLI
 * script, because a recipe exists specifically to replace inspect-page's own
 * heuristic field classifier with a pre-verified, human-written field mapping
 * — it still needs markers assigned on the live page so `safe-fill.mjs` can
 * re-locate the same elements it is about to fill.
 *
 * `buildScanExpression(mode)` returns the identical expression string
 * inspect-page.mjs evaluates in the browser. Both callers pass it to
 * `openAndEval` (or an equivalent eval call) themselves — this module never
 * touches the browser.
 */
export function buildScanExpression(mode = 'auto') {
  const requestedMode = ['auto', 'directory', 'comment'].includes(mode) ? mode : 'auto';
  return `(() => {
  const requestedMode = ${JSON.stringify(requestedMode)};
  const visible = (element) => {
    if (!element || element.hidden || element.disabled) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const pageWidth = Math.max(document.documentElement.clientWidth, innerWidth || 0);
    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
      && rect.width >= 2 && rect.height >= 2
      && rect.right > 0 && rect.left < pageWidth && rect.bottom > 0 && rect.top < pageHeight;
  };
  const label = (element) => {
    const explicit = element.id ? document.querySelector('label[for="' + CSS.escape(element.id) + '"]')?.innerText : '';
    return (explicit || element.closest('label')?.innerText || element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.name || element.id || '').trim();
  };
  const semantic = (element) => [
    element.tagName.toLowerCase(),
    element.getAttribute('type') || '',
    element.id || '',
    element.name || '',
    label(element),
    element.getAttribute('autocomplete') || '',
    element.getAttribute('placeholder') || ''
  ];
  const marker = (element) => {
    if (!element.__backlinkOpenCliScan) element.__backlinkOpenCliScan = crypto.randomUUID();
    return element.__backlinkOpenCliScan;
  };
  const text = (element) => semantic(element).join(' ');
  const directoryPatterns = {
    url: /(url|website|web.?site|homepage|site.?link|product.?link)/i,
    email: /(e-?mail)/i,
    name: /(product|tool|site|company|business).{0,8}(name|title)|(name|title).{0,8}(product|tool|site|company|business)/i,
    description: /(description|summary|about|details|introduction|tagline)/i
  };
  const commentPatterns = {
    url: /(url|website|web.?site|homepage)/i,
    email: /(e-?mail)/i,
    name: /(^|\\b)(name|author|nickname)(\\b|$)/i,
    description: /(comment|reply|message|response)/i
  };
  const classifyBlocker = (captcha, login, qualifiedForms) => captcha ? 'captcha' : login && qualifiedForms === 0 ? 'login' : null;
  const bodyText = document.body?.innerText || '';
  const captchaNode = document.querySelector('[class*="captcha" i],[id*="captcha" i],[class*="turnstile" i],[id*="turnstile" i],[data-sitekey],iframe[src*="recaptcha" i],iframe[src*="hcaptcha" i],iframe[src*="turnstile" i],iframe[src*="challenges.cloudflare.com" i]');
  const captchaDetected = Boolean(captchaNode || /\\b(captcha|recaptcha|hcaptcha|turnstile|security challenge)\\b/i.test(bodyText));
  const loginDetected = /\\b(sign in|log in|login|required to log in|continue with google)\\b/i.test(bodyText);
  const summaries = [...document.forms].map((form, formIndex) => {
    // 全字段普查：每个控件的语义七元组 + 稳定 marker + 可见性。隐藏控件也进普查
    // （visible: false）——CSRF token、蜜罐字段、被折叠的步骤都在这里现形，
    // AI 判「这张表单是什么」要看全量，不能只看启发式挑出来的四个字段。
    const allControls = [...form.querySelectorAll('input,textarea,select,button')];
    const controls = allControls.filter((el) => el.matches('input,textarea,select')).filter(visible);
    const fieldCensus = allControls.map((el) => ({
      marker: marker(el),
      semantic: semantic(el),
      visible: visible(el),
      required: el.required || false,
    }));
    const looksLikeComment = controls.some((field) => field.tagName === 'TEXTAREA' && commentPatterns.description.test(text(field)));
    const detectedMode = looksLikeComment ? 'comment' : 'directory';
    const patterns = detectedMode === 'comment' ? commentPatterns : directoryPatterns;
    const candidates = {};
    for (const kind of Object.keys(patterns)) {
      candidates[kind] = controls.filter((field) => {
        if (kind === 'url' && field.type === 'url') return true;
        if (kind === 'email' && field.type === 'email') return true;
        if (kind === 'description' && field.tagName === 'TEXTAREA') return true;
        return patterns[kind].test(text(field));
      });
    }
    const ambiguous = Object.entries(candidates).filter(([, fields]) => fields.length > 1).map(([kind]) => kind);
    const fields = Object.fromEntries(Object.entries(candidates).map(([kind, fieldsForKind]) => {
      const field = fieldsForKind.length === 1 ? fieldsForKind[0] : null;
      return [kind, field ? { marker: marker(field), semantic: semantic(field) } : null];
    }));
    const modeMatches = requestedMode === 'auto' || requestedMode === detectedMode;
    const requiredFields = detectedMode === 'comment'
      ? Boolean(fields.url && fields.description)
      : Boolean(fields.url && (fields.name || fields.description));
    const qualifies = modeMatches && requiredFields && ambiguous.length === 0 && !form.querySelector('input[type="password"]');
    return {
      formIndex,
      mode: detectedMode,
      action: form.action,
      method: (form.method || 'get').toLowerCase(),
      marker: marker(form),
      fields,
      fieldCensus,
      ambiguous,
      qualifies,
      submitLabels: [...form.querySelectorAll('button,input[type="submit"]')].filter(visible).map(label).filter(Boolean)
    };
  });
  const qualified = summaries.filter((form) => form.qualifies);
  const blocker = classifyBlocker(captchaDetected, loginDetected, qualified.length);
  const selected = qualified.length === 1 ? qualified[0] : null;
  const fingerprint = selected ? {
    url: location.href,
    formMarker: selected.marker,
    fields: selected.fields,
    signature: JSON.stringify({ url: location.href, formMarker: selected.marker, fields: selected.fields })
  } : null;
  return {
    version: 1,
    scannedAt: new Date().toISOString(),
    url: location.href,
    title: document.title,
    language: document.documentElement.lang || '',
    requestedMode,
    blocker,
    formCount: summaries.length,
    qualifiedFormCount: qualified.length,
    fillable: Boolean(selected && !blocker),
    reason: blocker || (qualified.length > 1 ? 'ambiguous_forms' : qualified.length === 0 ? 'no_safe_submission_form' : null),
    selectedForm: selected,
    forms: summaries,
    fingerprint
  };
})()`;
}

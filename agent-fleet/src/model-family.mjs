import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function familyOf(model = '') {
  return /^(?:gpt-[\d.]+-|claude-)?(sol|terra|luna|astra|opus|sonnet|haiku|fable)(?:-[\d-]+)?$/.exec(model)?.[1] ?? null;
}
export const isCodexModel = model => ['sol', 'terra', 'luna', 'astra'].includes(familyOf(model));
export function latestModel(models, family) {
  return models.map(m => typeof m === 'string' ? m : m.slug ?? m.id)
    .filter(m => new RegExp(`^gpt-[0-9]+(?:\\.[0-9]+)*-${family}$`).test(m))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
}
export function resolveCodexModel(family, { cachePath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'models_cache.json'), log = console.error } = {}) {
  let model;
  try { if (family !== 'astra') model = latestModel(JSON.parse(readFileSync(cachePath, 'utf8')).models, family); } catch {}
  if (model) return model;
  const config = JSON.parse(readFileSync(new URL('../models.config.json', import.meta.url), 'utf8'));
  const fallback = config.$codexFallbacks[family];
  log(`[model] ${family}: cache unavailable; fallback ${fallback}`);
  return fallback;
}
const catalogs = new Map();
export async function resolveApiModel(resolved, { fetchModels = fetch, log = console.error } = {}) {
  const family = familyOf(resolved.model);
  if (resolved.protocol !== 'openai-responses' || !isCodexModel(resolved.model)) return resolved;
  const key = `${resolved.baseURL}:${resolved.apiKey}`;
  let catalog = catalogs.get(key);
  if (!catalog || catalog.expires < Date.now()) {
    try {
      const response = await fetchModels(`${resolved.baseURL.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${resolved.apiKey}` }, signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      catalog = { models: (await response.json()).data, expires: Date.now() + 300000 };
      catalogs.set(key, catalog);
    } catch { catalog = null; }
  }
  const model = catalog && latestModel(catalog.models ?? [], family);
  if (!model) log(`[model] ${family}: API catalog unavailable; fallback ${resolved.fallbackModel}`);
  return { ...resolved, family, model: model || resolved.fallbackModel, subagentModel: model || resolved.fallbackModel };
}

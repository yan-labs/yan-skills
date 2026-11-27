// Registration of an SSH-tunnelled execution environment.  This module does
// not start a model or an executor and deliberately has no local fallback.
import { posix } from 'node:path';

export function validateGcpEnvironment(config) {
  if (!config || typeof config !== 'object') throw new Error('missing GCP execution environment');
  const { id, url, cwd, token } = config;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new Error('invalid GCP environment id');
  let endpoint;
  try { endpoint = new URL(url); } catch { throw new Error('invalid GCP tunnel URL'); }
  if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
      !endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
    throw new Error('GCP execution endpoint must be a loopback SSH tunnel');
  }
  if (typeof cwd !== 'string' || !cwd.startsWith('/') || posix.normalize(cwd) !== cwd || cwd === '/') {
    throw new Error('invalid GCP workspace path');
  }
  if (typeof token !== 'string' || token.length < 32) throw new Error('missing GCP execution tunnel authentication');
  return { id, url: endpoint.toString(), cwd, token };
}

export async function registerGcpEnvironment(rpc, config) {
  const { id, url, cwd, token } = validateGcpEnvironment(config);
  await rpc('environment/add', { environmentId: id, execServerUrl: url, authBearerToken: token });
  const info = await rpc('environment/info', { environmentId: id });
  if (!info?.shell?.path || !info?.shell?.name) throw new Error('GCP execution environment did not report a shell');
  return [{ environmentId: id, cwd, runtimeWorkspaceRoots: [cwd] }];
}

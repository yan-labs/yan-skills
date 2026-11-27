import assert from 'node:assert/strict';
import { registerGcpEnvironment, validateGcpEnvironment } from '../src/gcp-environment.mjs';

const config = { id: 'gcp-task-1', url: 'ws://127.0.0.1:29123/', cwd: '/home/worker/repo', token: 'x'.repeat(32) };
const calls = [];
const rpc = async (method, params) => {
  calls.push({ method, params });
  return method === 'environment/info' ? { shell: { name: 'bash', path: '/bin/bash' } } : {};
};
assert.deepEqual(await registerGcpEnvironment(rpc, config), [{ environmentId: config.id, cwd: config.cwd, runtimeWorkspaceRoots: [config.cwd] }]);
assert.deepEqual(calls.map(c => c.method), ['environment/add', 'environment/info']);
for (const changes of [{ url: 'ws://example.com:80/' }, { url: 'ws://127.0.0.1:9000/path' }, { cwd: '/home/a/../b' }, { token: 'short' }, { id: '../bad' }]) {
  assert.throws(() => validateGcpEnvironment({ ...config, ...changes }));
}
await assert.rejects(registerGcpEnvironment(async () => { throw new Error('disconnected'); }, config), /disconnected/);
await assert.rejects(registerGcpEnvironment(async () => ({}), config), /did not report a shell/);
console.log('GCP environment registration tests passed');

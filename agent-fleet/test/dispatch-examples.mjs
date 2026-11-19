// Run self-contained examples from both public dispatch guides in an isolated repository.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'fleet-examples-'));
const home = join(temp, 'home'), repo = join(temp, 'repo');
const results = [];
try {
  mkdirSync(home); mkdirSync(repo);
  const git = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
  if (git.status) throw new Error(git.stderr);
  const env = { ...process.env, HOME: home, AGENT_FLEET_ORDER_FILE: join(home, 'order.md'),
    AGENT_FLEET_RUNS_DIR: join(home, 'runs'), FLEET_DEFAULT_ON: 'local', PATH: join(root, 'bin') + ':' + process.env.PATH };
  for (const file of ['skill/SKILL.md', 'skill/references/fleet-go.md']) {
    const doc = readFileSync(join(root, file), 'utf8');
    for (const [, block] of doc.matchAll(/^\x60{3}[^\n]*\n([\s\S]*?)^\x60{3}/gm)) {
      const lines = block.replace(/\\\r?\n/g, ' ').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('fleet-go new ')) continue;
        const name = line.split(/\s+/)[2];
        const end = /<<-?\s*['"]?(\w+)/.exec(line)?.[1];
        const body = [];
        if (end) {
          while (++i < lines.length && lines[i].trim() !== end) body.push(lines[i]);
        }
        if (/\s--body\s+(?!-\s|-$)/.test(line)) {
          results.push({ name, status: 'deferred' });
          continue;
        }
        const command = line.replace(/\s*<<.*$/, '')
          .replaceAll('/path/to/project', '"$FLEET_EXAMPLE_REPO"')
          .replaceAll('/path/to/repo', '"$FLEET_EXAMPLE_REPO"');
        const input = body.join('\n').replaceAll('/path/to/project', repo).replaceAll('/path/to/repo', repo);
        const location = / --on /.test(command) ? '' : ' --on local --local-reason "example fixture"';
        const run = spawnSync('sh', ['-c', command + location + ' --dry-run'], {
          cwd: repo, env: { ...env, FLEET_EXAMPLE_REPO: repo }, input, encoding: 'utf8', timeout: 15000,
        });
        results.push({ name, status: run.status === 0 ? 'pass' : 'fail', ...(run.status === 0 ? {} : { reason: run.stderr }) });
      }
    }
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log(JSON.stringify(results));
if (!results.some(row => row.status === 'pass') || results.some(row => row.status === 'fail')) process.exitCode = 1;

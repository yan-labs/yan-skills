import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../scripts/seo-audit.mjs', import.meta.url));

test('CLI reports malformed JSON-LD but never claims Schema semantic validity', async () => {
  const server = createServer((request, response) => {
    const ld = request.url === '/broken' ? '{"@type":' : JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Game',
      additionalProperty: [{ '@type': 'PropertyValue', name: 'Level', value: 'Easy' }],
    });
    response.setHeader('content-type', 'text/html');
    response.end(`<html lang="en"><head><title>Fixture</title><script type="application/ld+json">${ld}</script></head><body><h1>Fixture</h1></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const { stdout } = await run(process.execPath, [cli, `${origin}/broken`, `${origin}/valid-json`, '--json']);
    const [broken, valid] = Object.values(JSON.parse(stdout));
    assert.ok(broken.issues.some(issue => issue.code === 'STRUCTURED_PARSE_ERROR'));
    assert.equal(broken.structured[0].type, 'PARSE_ERROR');
    assert.equal(broken.structuredValidation.jsonSyntax, 'invalid');
    assert.equal(valid.structured[0].type, 'Game');
    assert.equal(valid.issues.some(issue => issue.code === 'STRUCTURED_PARSE_ERROR'), false);
    assert.deepEqual(valid.structuredValidation, {
      scope: 'syntax-only', jsonSyntax: 'valid', schemaSemantics: 'not-validated',
    });
    const text = await run(process.execPath, [cli, `${origin}/valid-json`]);
    assert.match(text.stdout, /syntax-only.*Schema 语义未验证.*not-validated/);
    const fixes = await run(process.execPath, [cli, `${origin}/broken`, '--fix-report']);
    assert.match(fixes.stdout, /STRUCTURED_PARSE_ERROR/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

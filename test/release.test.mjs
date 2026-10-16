import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

test('release preparation generates the official button and is repeatable', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'ssh-keydrop-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  const script = join(root, 'scripts', 'prepare-release.mjs');
  copyFileSync(new URL('../scripts/prepare-release.mjs', import.meta.url), script);
  copyFileSync(new URL('../README.md', import.meta.url), join(root, 'README.md'));
  writeFileSync(join(root, 'package.json'), '{"name":"ssh-keydrop"}');
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, [script, 'https://github.com/example-org/example-project'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const link = /\]\((https:\/\/deploy\.workers\.cloudflare\.com\/\?url=[^)]+)\)/.exec(readme)?.[1];
  assert.equal(new URL(link).searchParams.get('url'), 'https://github.com/example-org/example-project');
  assert.ok(!readme.includes('<!-- release-note:start -->'));
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'))).repository.url, 'https://github.com/example-org/example-project.git');
  assert.notEqual(spawnSync(process.execPath, [script, 'https://example.com/untrusted']).status, 0);
});

test('button metadata requests public keys without bundling defaults or account routing', () => {
  const metadata = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.deepEqual(metadata.secrets.required, ['SSH_PUBLIC_KEYS']);
  assert.equal(metadata.vars, undefined);
  assert.equal(metadata.routes, undefined);
  assert.equal(metadata.account_id, undefined);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.deploy, 'cf deploy');
  assert.ok(pkg.cloudflare.bindings.SSH_PUBLIC_KEYS.description.includes('PUBLIC key'));
  const example = readFileSync(new URL('../.dev.vars.example', import.meta.url), 'utf8');
  assert.match(example, /^SSH_PUBLIC_KEYS=""$/m);
});

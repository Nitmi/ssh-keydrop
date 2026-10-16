import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHandler } from '../src/worker.ts';

const keys = readFileSync(new URL('./fixtures/public-keys.keys', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/install.sh', import.meta.url), 'utf8');
const script = await createHandler(keys, template)(new Request('https://example.com/')).text();
const bash = process.env.BASH_PATH || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/sh');
const posixPath = (path) => process.platform === 'win32' ? path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : path;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ssh-keydrop-test-'));
  const home = join(root, 'home with spaces');
  mkdirSync(home);
  const file = join(root, 'install.sh');
  writeFileSync(file, script);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const run = (body) => spawnSync(bash, ['-c', body || 'exec sh "$2"', 'test', posixPath(home), posixPath(file)], {
    env: { ...process.env, HOME: posixPath(home) }, encoding: 'utf8', timeout: 10000,
  });
  return { root, home, file, run, auth: join(home, '.ssh', 'authorized_keys') };
}

test('fresh install and repeated invocation preserve contents and permissions', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /added 2 key/);
  const before = readFileSync(f.auth, 'utf8');
  assert.equal(before, keys);
  assert.equal(f.run().status, 0);
  assert.equal(readFileSync(f.auth, 'utf8'), before);
  if (process.platform !== 'win32') {
    assert.equal(statSync(join(f.home, '.ssh')).mode & 0o777, 0o700);
    assert.equal(statSync(f.auth).mode & 0o777, 0o600);
  }
});

test('preserves restricted keys and comments; separates an unterminated last line', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.home, '.ssh'));
  const [rsa, ed] = keys.trim().split('\n');
  const existing = `# existing configuration\nfrom="192.0.2.1",command="echo hello" ${ed} device`;
  writeFileSync(f.auth, existing);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /added 1 key/);
  assert.equal(readFileSync(f.auth, 'utf8'), `${existing}\n${rsa}\n`);
  assert.match(f.run().stdout, /added 0 key/);
});

test('all keys are checked before authorized_keys is changed', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.home, '.ssh'));
  writeFileSync(f.auth, '# preserve me\n');
  writeFileSync(f.file, script.replace(keys.trimEnd(), `${keys.trimEnd()}\nssh-ed25519 AAAA`));
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid pinned public key/);
  assert.equal(readFileSync(f.auth, 'utf8'), '# preserve me\n');
  assert.equal(existsSync(join(f.home, '.ssh', '.ssh-keydrop.lock')), false);
});

test('interrupted download does not invoke the installer', (t) => {
  const f = fixture(t);
  writeFileSync(f.file, script.slice(0, script.lastIndexOf('ssh_keydrop_main "$@"')));
  assert.equal(f.run().status, 0);
  assert.equal(existsSync(join(f.home, '.ssh')), false);
});

test('concurrent installer is refused', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.home, '.ssh', '.ssh-keydrop.lock'), { recursive: true });
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Another install is running/);
  assert.equal(existsSync(f.auth), false);
});

test('symbolic links are refused', { skip: process.platform === 'win32' }, (t) => {
  const f = fixture(t);
  const result = f.run('mkdir "$1/target" && ln -s "$1/target" "$1/.ssh" && sh "$2"');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Refusing a symlink/);
});

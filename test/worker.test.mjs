import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { createHandler, createService, normalizeKeys } from '../src/worker.ts';

const keys = readFileSync(new URL('./fixtures/public-keys.keys', import.meta.url), 'utf8');
const template = readFileSync(new URL('../src/install.sh', import.meta.url), 'utf8');
const handler = createHandler(keys, template);

test('routes serve the pinned keys and a complete installer', async () => {
  const response = handler(new Request('https://example.com/keys'));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), normalizeKeys(keys));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const script = await handler(new Request('https://example.com/')).text();
  assert.ok(script.startsWith('#!/bin/sh\n'));
  assert.ok(script.includes(normalizeKeys(keys)));
  assert.ok(!script.includes('@@PUBLIC_KEYS@@'));
  assert.equal(await handler(new Request('https://example.com/install.sh')).text(), script);
});

test('HEAD, missing routes, and unsupported methods', async () => {
  assert.equal(await handler(new Request('https://example.com/', { method: 'HEAD' })).text(), '');
  assert.equal(handler(new Request('https://example.com/missing')).status, 404);
  const response = handler(new Request('https://example.com/', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test('key configuration rejects empty data, options, shell content, and mismatched types', () => {
  for (const value of ['', '# empty', 'ssh-ed25519 abc; touch /tmp/bad', 'ssh-ed25519 AAAA', keys.replace('ssh-ed25519', 'ssh-rsa')]) {
    assert.throws(() => normalizeKeys(value));
  }
  assert.equal(normalizeKeys(keys + keys), normalizeKeys(keys));
  assert.throws(() => createHandler(keys, 'missing marker'));
});

test('deployment forms accept JSON arrays, newline escapes, and normal multiline keys', () => {
  assert.equal(normalizeKeys(JSON.stringify(keys.trim().split('\n'))), normalizeKeys(keys));
  assert.equal(normalizeKeys(keys.trim().replaceAll('\n', '\\n')), normalizeKeys(keys));
  assert.throws(() => normalizeKeys('[123]'));
  assert.throws(() => normalizeKeys('['));
  assert.throws(() => normalizeKeys('x'.repeat(65537)));
});

test('unconfigured and invalid deployments never serve an installer', async () => {
  const service = createService(template);
  for (const SSH_PUBLIC_KEYS of [undefined, '', 'not a public key', '-----BEGIN OPENSSH PRIVATE KEY-----']) {
    for (const path of ['/', '/install.sh', '/keys']) {
      const response = service(new Request('https://example.com' + path), { SSH_PUBLIC_KEYS });
      assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes('#!/bin/sh'));
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  }
  assert.equal(service(new Request('https://example.com/', {method:'HEAD'}), {}).status, 503);
  assert.equal(service(new Request('https://example.com/missing'), {}).status, 404);
});

test('each request uses its own runtime keys and reflects key rotations', async () => {
  const service = createService(template);
  const [first, second] = keys.trim().split('\n');
  for (const SSH_PUBLIC_KEYS of [first, second]) {
    const response = service(new Request('https://example.com/keys'), { SSH_PUBLIC_KEYS });
    assert.equal(await response.text(), SSH_PUBLIC_KEYS + '\n');
    const installer = await service(new Request('https://example.com/'), { SSH_PUBLIC_KEYS }).text();
    assert.ok(installer.includes(SSH_PUBLIC_KEYS));
    assert.ok(!installer.includes(SSH_PUBLIC_KEYS === first ? second : first));
  }
});

test('accepts real RSA and ECDSA public keys and rejects truncated key data', () => {
  const field = (bytes) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const mpint = (encoded) => {
    const bytes = Buffer.from(encoded, 'base64url');
    return field(bytes[0] & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes);
  };
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'jwk' });
  const values = [
    ['ssh-rsa', Buffer.concat([field(Buffer.from('ssh-rsa')), mpint(rsa.e), mpint(rsa.n)])],
  ];
  for (const [namedCurve, curve] of [['prime256v1', 'nistp256'], ['secp384r1', 'nistp384'], ['secp521r1', 'nistp521']]) {
    const key = generateKeyPairSync('ec', { namedCurve }).publicKey.export({ format: 'jwk' });
    const type = 'ecdsa-sha2-' + curve;
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(key.x, 'base64url'), Buffer.from(key.y, 'base64url')]);
    values.push([type, Buffer.concat([field(Buffer.from(type)), field(Buffer.from(curve)), field(point)])]);
  }
  for (const [type, blob] of values) {
    const key = type + ' ' + blob.toString('base64');
    assert.equal(normalizeKeys(key), key + '\n');
    assert.throws(() => normalizeKeys(type + ' ' + blob.subarray(0, -1).toString('base64')));
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DessMonitorClient,
  DessMonitorError,
  buildActionString,
  mask,
  quotePlus,
} from '../src/dessmonitor/client.js';
import { ACCOUNT, createFakeDessMonitor } from './helpers/fakeDessMonitor.js';

const clientFor = (cloud, account = ACCOUNT) =>
  new DessMonitorClient({ ...account, fetch: cloud.fetch });

test('values are encoded like the platform decodes them, before signing', () => {
  assert.equal(quotePlus("a b!'()*/?&="), 'a+b%21%27%28%29%2A%2F%3F%26%3D');
  assert.equal(
    buildActionString('authSource', { usr: 'jean dupont', skipped: undefined, n: 0 }),
    '&action=authSource&usr=jean+dupont&n=0',
  );
});

test('logs in with the password hash, then signs with the secret and the token', async () => {
  const cloud = createFakeDessMonitor();
  const client = clientFor(cloud);
  const plants = await client.queryPlants();
  assert.deepEqual(
    plants.map((plant) => plant.pid),
    [101],
  );
  assert.deepEqual(
    cloud.calls.map((call) => call.action),
    ['authSource', 'queryPlants'],
  );
  // The username with a space and the password with reserved characters both
  // went through: the signature covered the encoded values.
  assert.equal(cloud.logins(), 1);
});

test('one login serves the following calls', async () => {
  const cloud = createFakeDessMonitor();
  const client = clientFor(cloud);
  await client.queryPlants();
  await client.queryPlantDevices(101);
  assert.equal(cloud.logins(), 1);
});

test('a token the platform no longer accepts is renewed once', async () => {
  const cloud = createFakeDessMonitor();
  const client = clientFor(cloud);
  await client.queryPlants();
  cloud.expireToken();
  await client.queryPlants();
  assert.equal(cloud.logins(), 2);
});

test('an expired token is renewed before the call', async () => {
  const cloud = createFakeDessMonitor();
  let now = 1_000_000;
  const client = new DessMonitorClient({ ...ACCOUNT, fetch: cloud.fetch, now: () => now });
  await client.queryPlants();
  now += 8 * 24 * 3600 * 1000;
  await client.queryPlants();
  assert.equal(cloud.logins(), 2);
  assert.ok(!cloud.calls.some((call) => call.action !== 'authSource' && call.params.err));
});

test('a wrong password is a credentials error, never retried', async () => {
  const cloud = createFakeDessMonitor();
  const client = clientFor(cloud, { username: ACCOUNT.username, password: 'wrong' });
  await assert.rejects(client.queryPlants(), (err) => {
    assert.ok(err instanceof DessMonitorError);
    // A wrong password breaks the signature: the platform says ERR_SIGN.
    return true;
  });
  const unknownUser = clientFor(cloud, { username: 'nobody', password: ACCOUNT.password });
  await assert.rejects(unknownUser.queryPlants(), (err) => err.isCredentials && err.code === 16);
});

test('errors never carry the password, the token or the signed URL', async () => {
  const cloud = createFakeDessMonitor();
  const client = clientFor(cloud);
  await client.queryPlants();
  cloud.failNext('queryPlants', 'network');
  await assert.rejects(client.queryPlants(), (err) => {
    assert.doesNotMatch(err.message, /token|sign=|secret|p@ss/);
    assert.equal(err.code, null);
    return true;
  });
});

test('"no record" reads as an empty list', async () => {
  const cloud = createFakeDessMonitor();
  const client = clientFor(cloud);
  assert.deepEqual(await client.queryCollectors(999), []);
  assert.deepEqual(
    await client.queryDeviceParameters({ sn: 'x', pn: 'y', devcode: 1, devaddr: 1 }),
    [],
  );
});

test('mask keeps only the first characters', () => {
  assert.equal(mask('96342210100001'), '963***');
  assert.equal(mask('ab'), '***');
  assert.equal(mask(undefined), '***');
});

test('a client without credentials refuses to log in', async () => {
  const client = new DessMonitorClient({ username: '', password: '', fetch: () => {} });
  assert.equal(client.configured, false);
  await assert.rejects(client.login(), (err) => err.isCredentials);
});

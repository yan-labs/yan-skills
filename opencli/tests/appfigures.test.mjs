import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEstimate, parseProfile, parseKeywords, profileUrl, matchesReportUrl, sessionForRun } from '../scripts/appfigures.mjs';

test('estimates preserve censored buckets, missing values and displayed scale', () => {
  assert.equal(parseEstimate('<$5K').value, null);
  assert.equal(parseEstimate('<$5K').upperBoundExclusive, 5000);
  assert.equal(parseEstimate('Not Available').value, null);
  assert.equal(parseEstimate('14M').value, 14000000);
  assert.equal(parseEstimate('$166M').value, 166000000);
});
test('overview labels retain platform, period and partial coverage; gated ranks are not data', () => {
  const page = { url: 'https://app.appfigures.com/reports/app-profile/41474101682', text: 'Intelligence Summary\niOS App Store\nEst. Downloads\nWorldwide · Aug 2026\nNot Available\nEst. Revenue (After Fees)\nWorldwide · Aug 2026\n<$5K' };
  const parsed = parseProfile(page);
  assert.equal(parsed.status, 'ok');
  assert.equal(parsed.period, 'Aug 2026');
  assert.equal(parsed.platform, 'iOS App Store');
  assert.equal(parsed.downloads.status, 'not_available');
  assert.equal(parseProfile({ text: 'Loading ranks\n10000\nCreate a free account to continue' }).status, 'auth_required');
  assert.equal(parseProfile({ text: 'Loading ranks\n10000' }).status, 'loading');
});
test('IDs are provider IDs and URLs are restricted to overview routes', () => {
  assert.match(profileUrl('41474101682'), /app.appfigures.com/);
  assert.match(profileUrl('https://appfigures.com/reports/app-profile/6160015?dates=last-month'), /6160015/);
  assert.throws(() => profileUrl('https://apps.apple.com/us/app/id1010311475'));
  assert.throws(() => profileUrl('https://app.appfigures.com/reports/app-profile/6160015/organic-search'));
});

test('malformed numbers and conflicting metric scope cannot be successful estimates', () => {
  for (const raw of ['.', ',', '1.2.3', '1,2K']) assert.equal(parseEstimate(raw).value, null);
  const p = parseProfile({ text: 'Intelligence Summary\niOS App Store\nEst. Downloads\nWorldwide · Aug 2026\n14M\nEst. Revenue (After Fees)\nUnited States · Jul 2026\n$166M' });
  assert.equal(p.status, 'scope_mismatch');
});


test('gates and unsettled keyword rows never become complete results', () => {
  const cards = 'Intelligence Summary\niOS App Store\nEst. Downloads\nWorldwide · Aug 2026\n14M\nEst. Revenue (After Fees)\nWorldwide · Aug 2026\n$166M';
  assert.equal(parseProfile({ text: cards, access: 'auth_required' }).status, 'auth_required');
  assert.equal(parseProfile({ text: cards, access: 'competitor_tracking_required' }).status, 'competitor_tracking_required');
  const page = { text: 'COUNTRY\nUnited States', platform: 'iOS App Store', selectedDevice: 'iPhone', tables: [[['', 'conduit bending', '12', '45', '20', '1']]] };
  assert.equal(parseKeywords(page).status, 'ok');
  const partial = parseKeywords({ ...page, access: 'partial_upgrade_required' });
  assert.equal(partial.status, 'partial');
  assert.equal(partial.truncated, true);
  const loading = parseKeywords({ ...page, text: 'Loading...', access: 'partial_upgrade_required' });
  assert.equal(loading.status, 'loading');
  assert.equal(loading.truncated, true);
  assert.equal(loading.country, null);
  assert.equal(loading.count, 1);
  assert.equal(parseKeywords({ ...page, text: '' }).status, 'incomplete');
  assert.equal(parseKeywords({ ...page, selectedDevice: null }).status, 'incomplete');
  assert.equal(parseKeywords({ ...page, access: 'auth_required' }).status, 'auth_required');
});

test('overflow cannot turn into an estimate or numeric keyword metric', () => {
  for (const raw of ['9'.repeat(400), '<$' + '9'.repeat(400) + 'B']) {
    const value = parseEstimate(raw);
    assert.equal(value.status, 'unparsed');
    assert.equal(value.value, null);
    assert.equal(value.upperBoundExclusive, null);
  }
  assert.equal(parseKeywords({ tables: [[['', 'keyword', '9'.repeat(400), '1', '1', '1']]] }).count, 0);
});

test('actual report URLs bind HTTPS origin, product and report without credentials', () => {
  const expected = profileUrl('41474101682', 'last-month', 'keywords');
  assert.equal(matchesReportUrl(expected, expected), true);
  for (const actual of [expected.replace('https:', 'http:'), expected.replace('app.appfigures.com', 'example.com'), expected.replace('https://', 'https://user:pass@'), expected.replace('.com/', '.com:444/'), expected.replace('41474101682', '6160015'), expected.replace('/organic-search', '/revenue'), 'invalid']) {
    assert.equal(matchesReportUrl(actual, expected), false, actual);
  }
  for (const input of ['http://app.appfigures.com/reports/app-profile/1', 'https://user:pass@app.appfigures.com/reports/app-profile/1', 'https://app.appfigures.com:444/reports/app-profile/1']) assert.throws(() => profileUrl(input));
});

test('each default session is owned and unique; explicit sessions stay borrowed', () => {
  const a = sessionForRun(), b = sessionForRun();
  assert.notEqual(a.session, b.session);
  assert.equal(a.ownsSession, true);
  assert.match(a.session, /^appfigures-[0-9a-f-]{36}$/);
  assert.deepEqual(sessionForRun('provider-borrowed'), { session: 'provider-borrowed', ownsSession: false });
});

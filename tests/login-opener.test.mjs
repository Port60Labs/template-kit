import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserOpener } from '../src/lib/auth.mjs';

const SIGN_IN = 'https://auth.port60.com/realms/port60-customers/device?user_code=ABCD-EFGH';

test('the sign-in page opens through the platform opener on each system, never through a shell', () => {
  assert.deepEqual(browserOpener(SIGN_IN, 'darwin'), { command: 'open', args: [SIGN_IN] });
  assert.deepEqual(browserOpener(SIGN_IN, 'linux'), { command: 'xdg-open', args: [SIGN_IN] });
  assert.deepEqual(browserOpener(SIGN_IN, 'win32'), { command: 'rundll32', args: ['url.dll,FileProtocolHandler', SIGN_IN] });
});

test('a URL carrying command separators reaches the Windows opener as one argument, with nothing for a shell to parse', () => {
  const hostile = 'https://auth.port60.com/device?user_code=A&calc.exe|whoami';
  const opener = browserOpener(hostile, 'win32');
  assert.equal(opener.command, 'rundll32');
  assert.equal(opener.args[1], hostile);
  assert.equal(Object.hasOwn(opener, 'shell'), false);
});

test('only an https URL is opened; anything else is left to the printed link', () => {
  for (const url of ['http://auth.port60.com/device', 'javascript:alert(1)', 'file:///etc/passwd', 'cmd /c calc', '']) {
    assert.equal(browserOpener(url, 'win32'), null, url);
    assert.equal(browserOpener(url, 'darwin'), null, url);
  }
});

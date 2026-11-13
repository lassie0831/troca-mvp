import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '../../src/auth/password.js';

describe('password hashing', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.match(hash, /^scrypt\$131072\$8\$1\$/);
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
    assert.equal(await verifyPassword('Correct horse battery staple', hash), false);
  });

  it('uses a random salt', async () => {
    assert.notEqual(await hashPassword('same'), await hashPassword('same'));
  });

  it('rejects malformed hashes without throwing', async () => {
    assert.equal(await verifyPassword('x', 'not-a-hash'), false);
    assert.equal(await verifyPassword('x', 'bcrypt$1$2$3$a$b'), false);
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decryptDescriptor,
  descriptorDistance,
  encryptDescriptor,
  findUniqueMatch,
  parseEncryptionKey,
  validateDescriptor
} = require('../face-utils');

const key = Buffer.alloc(32, 7);
const descriptor = Array(128).fill(0);

test('encrypts and decrypts face descriptors', () => {
  const encrypted = encryptDescriptor(descriptor, key);
  assert.deepEqual(decryptDescriptor(encrypted.ciphertext, encrypted.nonce, encrypted.tag, key), descriptor);
});

test('rejects invalid descriptor shapes and values', () => {
  assert.throws(() => validateDescriptor([0, 1]));
  assert.throws(() => validateDescriptor(Array(128).fill(Number.NaN)));
  assert.throws(() => parseEncryptionKey('not-a-valid-key'));
  assert.throws(() => parseEncryptionKey());
});

test('matches one close descriptor and rejects ambiguous or distant matches', () => {
  const close = [...descriptor];
  close[0] = 0.1;
  const closeSecond = [...descriptor];
  closeSecond[0] = 0.12;
  assert.equal(findUniqueMatch(descriptor, [
    { email: 'one@example.com', descriptor: close }
  ]).email, 'one@example.com');
  assert.equal(findUniqueMatch(descriptor, [
    { email: 'one@example.com', descriptor: close },
    { email: 'two@example.com', descriptor: closeSecond }
  ]), null);
  assert.equal(descriptorDistance(descriptor, Array(128).fill(1)), Math.sqrt(128));
  assert.equal(findUniqueMatch(descriptor, [
    { email: 'far@example.com', descriptor: Array(128).fill(1) }
  ]), null);
});

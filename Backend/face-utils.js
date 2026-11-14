const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');

const DESCRIPTOR_LENGTH = 128;
const MATCH_THRESHOLD = 0.5;
const MIN_MATCH_MARGIN = 0.08;

function parseEncryptionKey(value) {
  if (!value) {
    const error = new Error('Thiếu FACE_ENCRYPTION_KEY trong .env.');
    error.status = 503;
    throw error;
  }
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) {
    const error = new Error('FACE_ENCRYPTION_KEY phải là khóa base64 gồm đúng 32 byte.');
    error.status = 503;
    throw error;
  }
  return key;
}

function validateDescriptor(value) {
  if (!Array.isArray(value) || value.length !== DESCRIPTOR_LENGTH
    || value.some(item => typeof item !== 'number' || !Number.isFinite(item) || item < -1 || item > 1)) {
    const error = new Error('Mẫu khuôn mặt không hợp lệ.');
    error.status = 400;
    throw error;
  }
  return value;
}

function encryptDescriptor(descriptor, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(validateDescriptor(descriptor)), 'utf8'),
    cipher.final()
  ]);
  return { ciphertext, nonce, tag: cipher.getAuthTag() };
}

function decryptDescriptor(ciphertext, nonce, tag, key) {
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return validateDescriptor(JSON.parse(plaintext));
}

function descriptorDistance(left, right) {
  validateDescriptor(left);
  validateDescriptor(right);
  return Math.sqrt(left.reduce((total, value, index) => total + (value - right[index]) ** 2, 0));
}

function findUniqueMatch(queryDescriptor, templates) {
  const matches = templates
    .map(template => ({ ...template, distance: descriptorDistance(queryDescriptor, template.descriptor) }))
    .sort((left, right) => left.distance - right.distance);
  const best = matches[0];
  if (!best || best.distance > MATCH_THRESHOLD) return null;
  if (matches[1] && matches[1].distance - best.distance < MIN_MATCH_MARGIN) return null;
  return best;
}

module.exports = {
  decryptDescriptor,
  descriptorDistance,
  encryptDescriptor,
  findUniqueMatch,
  parseEncryptionKey,
  validateDescriptor
};

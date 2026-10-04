import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  decryptString,
  encryptJson,
  encryptString,
  hmacSignHex,
  sha256Hex,
  timingSafeEqualHex,
} from '../src/crypto';

const KEY = 'a'.repeat(64); // 32 bytes hex

describe('crypto', () => {
  it('round-trips encrypted strings', async () => {
    const enc = await encryptString(KEY, 'Bearer secret-token');
    expect(enc).not.toContain('secret');
    expect(await decryptString(KEY, enc)).toBe('Bearer secret-token');
  });

  it('round-trips encrypted JSON (job headers)', async () => {
    const headers = { Authorization: 'Bearer abc', 'X-Custom': 'v' };
    const enc = await encryptJson(KEY, headers);
    expect(await decryptJson<Record<string, string>>(KEY, enc)).toEqual(headers);
  });

  it('returns null for garbage ciphertext instead of throwing', async () => {
    expect(await decryptString(KEY, 'not-valid-base64!!')).toBeNull();
  });

  it('sha256Hex matches a known vector', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hmac + constant-time compare', async () => {
    const sig = await hmacSignHex(KEY, 'payload');
    expect(timingSafeEqualHex(sig, await hmacSignHex(KEY, 'payload'))).toBe(true);
    expect(timingSafeEqualHex(sig, await hmacSignHex(KEY, 'payload2'))).toBe(false);
    expect(timingSafeEqualHex(sig, 'deadbeef')).toBe(false);
  });
});

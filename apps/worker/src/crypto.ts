/**
 * AES-GCM encryption for secrets at rest (job headers, bodies, alert targets)
 * and HMAC signing for the OAuth state parameter. Key comes from
 * env.ENCRYPTION_KEY (hex or base64, 32 bytes) per plan section 7.
 */

export class CryptoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoConfigError';
  }
}

let cachedKey: CryptoKey | null = null;
let cachedRaw = '';

export async function getEncryptionKey(keyMaterial: string): Promise<CryptoKey> {
  if (cachedKey && cachedRaw === keyMaterial) return cachedKey;
  const raw = decodeKeyMaterial(keyMaterial);
  cachedKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  cachedRaw = keyMaterial;
  return cachedKey;
}

function decodeKeyMaterial(material: string): Uint8Array {
  const trimmed = material.trim();
  let bytes: Uint8Array | null = null;
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
  } else {
    try {
      const decoded = decodeBase64(trimmed);
      if (decoded.length === 32) bytes = decoded;
    } catch {
      // fall through to the error below
    }
  }
  if (!bytes) {
    throw new CryptoConfigError(
      'ENCRYPTION_KEY must be 32 bytes as hex (openssl rand -hex 32) or base64 (openssl rand -base64 32)',
    );
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function decodeBase64(text: string): Uint8Array {
  const s = atob(text.trim());
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

export async function encryptString(keyMaterial: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await getEncryptionKey(keyMaterial),
    new TextEncoder().encode(plaintext),
  );
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return encodeBase64(packed);
}

export async function decryptString(keyMaterial: string, packed: string): Promise<string | null> {
  try {
    const bytes = decodeBase64(packed);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      await getEncryptionKey(keyMaterial),
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

export async function encryptJson(keyMaterial: string, value: unknown): Promise<string> {
  return encryptString(keyMaterial, JSON.stringify(value));
}

export async function decryptJson<T>(keyMaterial: string, packed: string | null): Promise<T | null> {
  if (!packed) return null;
  const raw = await decryptString(keyMaterial, packed);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hmacSignHex(keyMaterial: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two same-length hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken(bytes = 32): string {
  return encodeBase64(crypto.getRandomValues(new Uint8Array(bytes)));
}

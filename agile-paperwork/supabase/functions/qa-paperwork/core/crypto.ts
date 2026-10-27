// AES-256-GCM field encryption with Web Crypto, so the same code runs in
// Supabase Edge Functions (Deno), Node tests and nowhere else.
// The key lives only in the PAPERWORK_ENCRYPTION_KEY secret (base64, 32 bytes).
// Each value is bound to its column name, so a ciphertext copied into another column fails to decrypt.

const VERSION = "v1";

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64decode(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importKey(base64Key: string | undefined): Promise<CryptoKey> {
  if (!base64Key) throw new Error("PAPERWORK_ENCRYPTION_KEY is not set");
  const raw = b64decode(base64Key.trim());
  if (raw.length !== 32) throw new Error("PAPERWORK_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptField(key: CryptoKey, column: string, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(column) },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${VERSION}.${b64encode(iv)}.${b64encode(new Uint8Array(ct))}`;
}

export async function decryptField(key: CryptoKey, column: string, stored: string | null | undefined): Promise<string> {
  if (!stored) return "";
  const [version, ivText, ctText] = stored.split(".");
  if (version !== VERSION || !ivText || !ctText) throw new Error("Unrecognized encrypted value");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivText), additionalData: new TextEncoder().encode(column) },
    key,
    b64decode(ctText),
  );
  return new TextDecoder().decode(pt);
}

export { b64encode, b64decode };

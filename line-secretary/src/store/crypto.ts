// トーク本文・やること名・表示名などを保存前に暗号化する（AES-GCM, WebCrypto）。
// 鍵は環境変数 ENCRYPTION_KEY（32バイトを base64）。DB だけ見ても中身は読めない。

export interface Cipher {
  encrypt(plain: string): Promise<string>;
  decrypt(enc: string): Promise<string>;
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function createCipher(base64Key: string): Promise<Cipher> {
  const raw = b64decode(base64Key);
  if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  return {
    async encrypt(plain) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
      const out = new Uint8Array(iv.length + ct.length);
      out.set(iv);
      out.set(ct, iv.length);
      return b64encode(out);
    },
    async decrypt(data) {
      const bytes = b64decode(data);
      const iv = bytes.slice(0, 12);
      const ct = bytes.slice(12);
      return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
    },
  };
}

/** Mock Mode 用：起動ごとにランダムな鍵を作る */
export function randomKeyBase64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(32)));
}

// Webhook の署名検証（x-line-signature = base64(HMAC-SHA256(channelSecret, rawBody))）

export async function verifySignature(rawBody: string, signature: string | null | undefined, channelSecret: string): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(channelSecret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  let expected = "";
  for (const b of mac) expected += String.fromCharCode(b);
  return timingSafeEqual(btoa(expected), signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signForTest(rawBody: string, channelSecret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(channelSecret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  let s = "";
  for (const b of mac) s += String.fromCharCode(b);
  return btoa(s);
}

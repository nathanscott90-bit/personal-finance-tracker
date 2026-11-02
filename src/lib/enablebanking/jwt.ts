import { createPrivateKey, createSign } from "node:crypto";

const b64url = (b: Buffer | string) =>
  Buffer.from(b)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/**
 * The bearer token every Enable Banking request carries: RS256, `kid` the
 * application id, fixed issuer and audience, valid for an hour.
 */
export function ebJwt(
  appId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  const header = { typ: "JWT", alg: "RS256", kid: appId };
  const payload = {
    iss: "enablebanking.com",
    aud: "api.enablebanking.com",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const body = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = createPrivateKey(privateKeyPem);
  const sig = createSign("RSA-SHA256").update(body).sign(key);
  return `${body}.${b64url(sig)}`;
}

/** Accepts a PEM pasted with its line breaks flattened to spaces or "\n". */
export function normalisePem(raw: string): string {
  const s = raw.trim().replace(/\\n/g, "\n");
  const m = /-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/.exec(s);
  if (!m) return s;
  const body = m[2].replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----\n${lines.join("\n")}\n-----END ${m[1]}-----\n`;
}

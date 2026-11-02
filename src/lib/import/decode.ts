/**
 * Decode an uploaded statement. Most banks export UTF-8, but some UK banks
 * (Nationwide among them) export Windows-1252, where "£" is byte 0xA3 and
 * would otherwise come through as a replacement character.
 */
export function decodeStatement(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomJoinCode(length = 6) {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    out += ALPHABET[b % ALPHABET.length];
  }
  return out;
}

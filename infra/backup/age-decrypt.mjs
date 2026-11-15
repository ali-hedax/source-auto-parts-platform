// Minimal age (v1, X25519 recipient) decryptor with Node's built-in crypto, to prove locally that an
// encrypted backup opens with the owner's private key. Never prints the key.
// Usage: node infra/backup/age-decrypt.mjs <identity-file> <in.age> <out.tar>  (or the official `age -d -i key in.age`)
import { createDecipheriv, createHmac, createPrivateKey, createPublicKey, diffieHellman, hkdfSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [idFile, inFile, outFile] = process.argv.slice(2);
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function bech32Bytes(s) {
  const lower = s.toLowerCase();
  const sep = lower.lastIndexOf('1');
  const data = [...lower.slice(sep + 1, -6)].map((c) => { const v = CHARSET.indexOf(c); if (v < 0) throw new Error('bad bech32'); return v; });
  let acc = 0; let bits = 0; const out = [];
  for (const v of data) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } }
  return Buffer.from(out);
}
const b64 = (s) => Buffer.from(s, 'base64');
const hkdf = (ikm, salt, info) => Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from(info), 32));
function chacha(key, nonce, sealed) {
  const d = createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
  d.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
}

const line = readFileSync(idFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('AGE-SECRET-KEY-1'));
if (!line) throw new Error('no AGE-SECRET-KEY line');
const scalar = bech32Bytes(line.trim());
const priv = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), scalar]), format: 'der', type: 'pkcs8' });
const ourPub = createPublicKey(priv).export({ format: 'der', type: 'spki' }).subarray(-32);

const file = readFileSync(inFile);
const hdrEnd = file.indexOf('\n---');
const macLineEnd = file.indexOf('\n', hdrEnd + 1);
const header = file.subarray(0, hdrEnd).toString('utf8').split('\n');
if (header[0] !== 'age-encryption.org/v1') throw new Error('not an age v1 file');
let fileKey = null;
for (let i = 1; i < header.length; i++) {
  if (!header[i].startsWith('-> ')) continue;
  const args = header[i].slice(3).split(' ');
  let body = ''; let j = i + 1;
  for (; j < header.length && !header[j].startsWith('-> '); j++) { body += header[j]; if (header[j].length < 64) break; }
  if (args[0] !== 'X25519') continue;
  const share = b64(args[1]);
  const shared = diffieHellman({ privateKey: priv, publicKey: createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), share]), format: 'der', type: 'spki' }) });
  const wrap = hkdf(shared, Buffer.concat([share, ourPub]), 'age-encryption.org/v1/X25519');
  try { fileKey = chacha(wrap, Buffer.alloc(12), b64(body)); break; } catch { /* another recipient */ }
}
if (!fileKey) throw new Error('no stanza for this key');
const mac = b64(file.subarray(hdrEnd + 5, macLineEnd).toString('utf8'));
const want = createHmac('sha256', hkdf(fileKey, Buffer.alloc(0), 'header')).update(file.subarray(0, hdrEnd + 4)).digest();
if (!timingSafeEqual(mac, want)) throw new Error('header MAC mismatch');

const payload = file.subarray(macLineEnd + 1);
const key = hkdf(fileKey, payload.subarray(0, 16), 'payload');
const CHUNK = 64 * 1024 + 16;
const parts = [];
for (let off = 16, n = 0; off < payload.length; off += CHUNK, n++) {
  const end = Math.min(off + CHUNK, payload.length);
  const nonce = Buffer.alloc(12); nonce.writeUIntBE(n, 5, 6); nonce[11] = end === payload.length ? 1 : 0;
  parts.push(chacha(key, nonce, payload.subarray(off, end)));
}
writeFileSync(outFile, Buffer.concat(parts));
process.stdout.write(`decrypted ${inFile} → ${outFile} (${parts.reduce((a, p) => a + p.length, 0)} bytes, header MAC ok)\n`);

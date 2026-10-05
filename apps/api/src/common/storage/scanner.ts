import { Socket } from 'node:net';

export interface ScanResult {
  clean: boolean;
  engine: string;
  signature: string | null;
}

/** The signature database the engine has loaded. */
export interface SignatureInfo {
  /** e.g. "28136" (ClamAV daily database version). */
  version: string;
  /** When that database was published, as reported by the engine. */
  builtAt: Date;
}

export interface MalwareScanner {
  readonly name: string;
  scan(bytes: Buffer): Promise<ScanResult>;
  ping(): Promise<boolean>;
  /** null when the engine has no signatures (development) or does not report them. */
  signatures(): Promise<SignatureInfo | null>;
}

export const SCANNER = Symbol('HEDAX_SCANNER');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * clamd VERSION reply: "ClamAV 1.5.4/28136/Fri Oct  3 08:12:01 2026" — engine, database
 * version and database time (clamd's local time; the official image runs in UTC).
 * Without a loaded database the reply is just "ClamAV 1.5.4", which gives null.
 */
export function parseClamVersion(reply: string): SignatureInfo | null {
  const m = /^ClamAV [^/]+\/(\d+)\/[A-Z][a-z]{2} ([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(reply.trim());
  if (!m) return null;
  const [, version, mon, day, hh, mm, ss, year] = m;
  const month = MONTHS.indexOf(mon ?? '');
  if (!version || month < 0) return null;
  return { version, builtAt: new Date(Date.UTC(Number(year), month, Number(day), Number(hh), Number(mm), Number(ss))) };
}

/**
 * clamd INSTREAM client (TCP). Protocol: "zINSTREAM\0", then chunks prefixed by
 * a 4-byte big-endian length, terminated by a zero-length chunk. The reply is
 * "stream: OK" or "stream: <signature> FOUND".
 */
export class ClamAvScanner implements MalwareScanner {
  readonly name = 'clamav';

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 60_000,
  ) {}

  private command(payload: (socket: Socket) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      const chunks: Buffer[] = [];
      socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('clamd timeout')));
      socket.on('data', (d: Buffer) => chunks.push(d));
      socket.on('error', reject);
      socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8').replace(/\0/g, '').trim()));
      socket.connect(this.port, this.host, () => payload(socket));
    });
  }

  async scan(bytes: Buffer): Promise<ScanResult> {
    const reply = await this.command((socket) => {
      socket.write('zINSTREAM\0');
      const chunkSize = 64 * 1024;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        const chunk = bytes.subarray(offset, offset + chunkSize);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length, 0);
        socket.write(len);
        socket.write(chunk);
      }
      socket.end(Buffer.alloc(4));
    });
    if (/\bOK$/.test(reply)) return { clean: true, engine: this.name, signature: null };
    const found = /stream: (.+) FOUND$/.exec(reply);
    if (found?.[1]) return { clean: false, engine: this.name, signature: found[1] };
    // Size-limit or scanner errors are not "clean": the file stays unavailable.
    throw new Error(`clamd returned an unexpected reply: ${reply.slice(0, 120)}`);
  }

  async ping(): Promise<boolean> {
    const reply = await this.command((socket) => socket.end('zPING\0'));
    return reply === 'PONG';
  }

  async signatures(): Promise<SignatureInfo | null> {
    return parseClamVersion(await this.command((socket) => socket.end('zVERSION\0')));
  }
}

/**
 * Development-only stand-in: marks files as not scanned. The env guard makes it
 * impossible to select in production; the UI labels such files "not scanned (dev)".
 */
export class DevNoScanner implements MalwareScanner {
  readonly name = 'none-dev';

  async scan(): Promise<ScanResult> {
    return { clean: true, engine: this.name, signature: null };
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async signatures(): Promise<SignatureInfo | null> {
    return null;
  }
}

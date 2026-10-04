import { Socket } from 'node:net';

export interface ScanResult {
  clean: boolean;
  engine: string;
  signature: string | null;
}

export interface MalwareScanner {
  readonly name: string;
  scan(bytes: Buffer): Promise<ScanResult>;
  ping(): Promise<boolean>;
}

export const SCANNER = Symbol('HEDAX_SCANNER');

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
}

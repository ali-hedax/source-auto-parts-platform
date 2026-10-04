// Starts a command with HEDAX_DATA_SOURCE=fixtures (UI preview with labelled sample data; dev only).
import { spawn } from 'node:child_process';

const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, { stdio: 'inherit', shell: true, env: { ...process.env, HEDAX_DATA_SOURCE: 'fixtures' } });
child.on('exit', (code) => process.exit(code ?? 0));

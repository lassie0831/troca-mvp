// Dev loop: recompile on change (tsc --watch) and restart the server when dist/ changes.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const tscBin = new URL('../node_modules/typescript/bin/tsc', import.meta.url);
const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: false });

const tsc = run(process.execPath, [tscBin.pathname.replace(/^\/([A-Za-z]:)/, '$1'), '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput']);

const waitForBuild = setInterval(() => {
  if (!existsSync('dist/main.js')) return;
  clearInterval(waitForBuild);
  const server = run(process.execPath, ['--env-file-if-exists=.env', '--enable-source-maps', '--watch-path=dist', 'dist/main.js']);
  const stop = () => { server.kill(); tsc.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}, 500);

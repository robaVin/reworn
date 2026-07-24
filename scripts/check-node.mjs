/**
 * Node version guard. Runs as an npm `preinstall` hook so a fresh install on an
 * unsupported Node fails loudly with clear upgrade steps.
 *
 * The minimum is Node 20: Node 18 is End-of-Life (no security patches) and
 * @supabase/supabase-js drops support for it. This must not be weakened.
 *
 * Uses only built-ins so it runs before any dependency is installed.
 */
const MIN_MAJOR = 20;
const current = process.versions.node;
const major = Number(current.split('.')[0]);

if (Number.isNaN(major) || major < MIN_MAJOR) {
  const msg = [
    '',
    `✖ ReWorn requires Node ${MIN_MAJOR} or later. You are running ${current}.`,
    '',
    'Node 18 and below are End-of-Life and are not supported.',
    '',
    'Upgrade on Windows (recommended: nvm-windows):',
    '  1. Install nvm-windows: https://github.com/coreybutler/nvm-windows/releases',
    '  2. nvm install 20',
    '  3. nvm use 20',
    '',
    'Or install the Node 20 LTS MSI directly: https://nodejs.org/en/download',
    '',
    'After upgrading, re-run: npm install',
    '',
  ].join('\n');
  console.error(msg);
  process.exit(1);
}

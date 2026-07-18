import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static guarantee: no Client Component ("use client") may import a privileged,
 * server-only module. The build-time guards are `import 'server-only'` in those
 * modules plus an ESLint rule; this test is a fast, dependency-free backstop
 * that fails loudly if either is ever weakened.
 */
const SRC = join(process.cwd(), 'src');

const PRIVILEGED_IMPORT_PATTERNS = ['@/lib/supabase/admin', '@/lib/db'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

function isClientComponent(source: string): boolean {
  // The 'use client' directive must be the first statement.
  const firstLines = source.slice(0, 200);
  return /^\s*(['"])use client\1/.test(firstLines);
}

describe('privileged client isolation', () => {
  const files = walk(SRC);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('no "use client" file imports a privileged server-only module', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (!isClientComponent(source)) continue;

      for (const pattern of PRIVILEGED_IMPORT_PATTERNS) {
        if (source.includes(pattern)) {
          offenders.push(`${file} imports ${pattern}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('the privileged modules declare the server-only guard', () => {
    for (const rel of ['lib/supabase/admin.ts', 'lib/db.ts']) {
      const source = readFileSync(join(SRC, rel), 'utf8');
      expect(source).toContain("import 'server-only'");
    }
  });
});

/**
 * Test stub for the `server-only` package.
 *
 * In a Next.js build, importing `server-only` from client code is a build
 * error — that is exactly the guard we want in production. Under Vitest there
 * is no React Server Components condition, so the real package would throw on
 * import and make server modules untestable. Aliased in vitest.config.ts.
 *
 * This stub is TEST-ONLY. It does not weaken the production guarantee.
 */
export {};

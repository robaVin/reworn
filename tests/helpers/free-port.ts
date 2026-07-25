import net from 'node:net';

/**
 * Ask the OS for a currently-free TCP port. Integration suites use this instead
 * of a hardcoded port so a leftover/zombie socket from an interrupted run (or a
 * parallel CI job) can never make the embedded-Postgres boot fail to bind.
 *
 * There is a tiny race between closing the probe listener and the real server
 * binding, which is acceptable for tests and vastly less flaky than fixed ports.
 */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => (port ? resolve(port) : reject(new Error('no port'))));
    });
  });
}

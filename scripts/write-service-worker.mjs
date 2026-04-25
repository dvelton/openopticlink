import { readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const distDir = new URL('../dist', import.meta.url).pathname;
const files = await listFiles(distDir);
const cachePrefix = 'openopticlink-';
const cacheName = `${cachePrefix}${Date.now()}`;
const appShell = files
  .filter((file) => !file.endsWith('/sw.js'))
  .map((file) => `./${relative(distDir, file).replaceAll('\\', '/')}`);

if (!appShell.includes('./index.html')) {
  throw new Error('Build output is missing index.html.');
}

const serviceWorker = `const cachePrefix = ${JSON.stringify(cachePrefix)};
const cacheName = ${JSON.stringify(cacheName)};
const appShell = ${JSON.stringify(appShell, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(appShell)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(cachePrefix) && key !== cacheName).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    }),
  );
});
`;

await writeFile(join(distDir, 'sw.js'), serviceWorker);

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await listFiles(path)));
    } else {
      output.push(path);
    }
  }

  return output;
}

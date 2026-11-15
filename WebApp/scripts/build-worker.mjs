import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';

// Self-contained Worker build for private review hosting. Static hosts can serve dist/client directly.
const root = resolve('dist/client');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const assets = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else assets['/' + relative(root, path).replaceAll('\\', '/')] = { type: types[extname(path)] || 'application/octet-stream', body: (await readFile(path)).toString('base64') };
  }
}
await collect(root);
await mkdir('dist/server', { recursive: true });
const worker = await readFile('worker/index.js', 'utf8');
await writeFile('dist/server/index.js', `const assets = ${JSON.stringify(assets)};\n${worker}`);
console.log(`Worker packaged with ${Object.keys(assets).length} static assets.`);

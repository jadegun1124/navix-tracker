import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { PUBLIC_NAVER_CLIENT_ID } from '../src/lib/naverAuth.mjs';
import { createMemoryAccountStore } from './account.mjs';
import { createMemoryStore, handleSyncRequest, withCors } from './protocol.mjs';

function headerObject(incoming) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  return headers;
}

async function readBody(incoming) {
  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : null;
}

export function startSyncServer(port = 0) {
  const store = createMemoryStore();
  const accounts = createMemoryAccountStore();
  const naverClientId = process.env.NAVER_CLIENT_ID || process.env.VITE_NAVER_CLIENT_ID || PUBLIC_NAVER_CLIENT_ID;
  const naverClientSecret = process.env.NAVER_CLIENT_SECRET || '';
  const server = createServer(async (incoming, outgoing) => {
    try {
      const host = incoming.headers.host || '127.0.0.1';
      const url = new URL(incoming.url || '/', `http://${host}`);
      const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
      const body = hasBody ? await readBody(incoming) : null;
      const request = new Request(url, {
        method: incoming.method,
        headers: headerObject(incoming.headers),
        body: body && body.length ? body : undefined,
      });
      const response = withCors(await handleSyncRequest(store, request, {
        accounts,
        naverClientId,
        naverClientSecret,
      }));
      const payload = Buffer.from(await response.arrayBuffer());
      outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
      outgoing.end(payload);
    } catch {
      outgoing.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      outgoing.end(JSON.stringify({ error: 'server' }));
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 8787);
  startSyncServer(port).then((server) => {
    const address = server.address();
    const actual = address && typeof address === 'object' ? address.port : port;
    console.log(`umap family sync listening on ${actual}`);
  });
}

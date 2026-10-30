import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

// Stores voter and ward photos in Netlify Blobs so they persist on the site
// and are available from any device.

const MAX_BYTES = 5 * 1024 * 1024;
const KINDS = new Set(['voter', 'ward']);

function photoStore() {
  return getStore({ name: 'photos', consistency: 'strong' });
}

export default async (req: Request) => {
  const match = new URL(req.url).pathname.match(/^\/api\/photos\/([^/]+)\/([^/]+)\/?$/);
  const kind = match?.[1] ?? '';
  const key = match ? decodeURIComponent(match[2]) : '';
  if (!KINDS.has(kind) || !key || key.length > 200) {
    return new Response('Invalid photo path', { status: 400 });
  }

  const blobKey = `${kind}/${key}`;
  const store = photoStore();

  if (req.method === 'GET' || req.method === 'HEAD') {
    const result = await store.getWithMetadata(blobKey, { type: 'arrayBuffer' });
    // 204 rather than 404 so a missing photo is never retried against the SPA fallback
    if (!result) return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
    const contentType = (result.metadata?.contentType as string) || 'image/jpeg';
    return new Response(req.method === 'HEAD' ? null : result.data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=0, must-revalidate',
        ...(result.etag ? { ETag: result.etag } : {}),
      },
    });
  }

  if (req.method === 'PUT') {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return new Response('Only image uploads are allowed', { status: 415 });
    }
    const data = await req.arrayBuffer();
    if (data.byteLength === 0 || data.byteLength > MAX_BYTES) {
      return new Response('Photo must be between 1 byte and 5 MB', { status: 413 });
    }
    await store.set(blobKey, data, {
      metadata: { contentType, uploadedAt: new Date().toISOString() },
    });
    return Response.json({ url: `/api/photos/${kind}/${encodeURIComponent(key)}` });
  }

  if (req.method === 'DELETE') {
    await store.delete(blobKey);
    return new Response(null, { status: 204 });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config: Config = {
  path: '/api/photos/:kind/:key',
};

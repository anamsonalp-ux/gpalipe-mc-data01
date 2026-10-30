import { getStore } from '@netlify/blobs';
import { getUser } from '@netlify/identity';

// Shared photo storage for voter and ward photos, so every signed-in device
// sees the same pictures instead of each browser keeping its own copy.
//
//   GET    /api/photos                 -> { photos: { "voter/12": "<etag>", ... } }
//   GET    /api/photos/:kind/:id       -> image bytes
//   PUT    /api/photos/:kind/:id       -> store image (raw image body)
//   DELETE /api/photos/:kind/:id       -> remove image

const KINDS = new Set(['voter', 'ward']);
const MAX_BYTES = 5 * 1024 * 1024;

// Strong consistency so a photo is visible to other devices as soon as it is saved.
const store = () => getStore({ name: 'photos', consistency: 'strong' });

function sniffContentType(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45) return 'image/webp';
  return 'application/octet-stream';
}

export default async (req: Request, context: { params: Record<string, string | undefined> }) => {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { kind, id } = context.params;

  if (!kind) {
    if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    const photos: Record<string, string> = {};
    for await (const page of store().list({ paginate: true })) {
      for (const blob of page.blobs) photos[blob.key] = blob.etag;
    }
    return Response.json({ photos }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (!KINDS.has(kind) || !id || !/^[a-zA-Z0-9._-]{1,200}$/.test(id)) {
    return Response.json({ error: 'Invalid photo key' }, { status: 400 });
  }
  const key = `${kind}/${id}`;

  if (req.method === 'GET') {
    const data = await store().get(key, { type: 'arrayBuffer' });
    if (!data) return new Response('Not found', { status: 404 });
    return new Response(data, {
      headers: {
        'Content-Type': sniffContentType(new Uint8Array(data)),
        // URLs carry the etag as a version, so a changed photo gets a new URL.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  }

  if (req.method === 'PUT') {
    const data = await req.arrayBuffer();
    if (data.byteLength === 0) return Response.json({ error: 'Empty photo' }, { status: 400 });
    if (data.byteLength > MAX_BYTES) return Response.json({ error: 'Photo is too large' }, { status: 413 });
    if (sniffContentType(new Uint8Array(data)) === 'application/octet-stream') {
      return Response.json({ error: 'Unsupported image format' }, { status: 415 });
    }
    const { etag } = await store().set(key, data);
    return Response.json({ key, etag: etag ?? String(Date.now()) });
  }

  if (req.method === 'DELETE') {
    await store().delete(key);
    return Response.json({ key, deleted: true });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = {
  path: ['/api/photos', '/api/photos/:kind/:id'],
};

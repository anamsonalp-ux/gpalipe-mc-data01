import { createSupabaseInstance, getStoredSupabaseConfig } from './supabase';

// IndexedDB photo storage for voter photos

const DB_NAME = 'gp_voter_photos_db';
const STORE_NAME = 'photos';
const DB_VERSION = 1;
const SUPABASE_BUCKET = 'gp-photos';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

function safeSupabaseStorageKey(value: string | number): string {
  return String(value).trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
}

async function tryUploadToSupabase(kind: 'voter' | 'ward', key: string | number, photoDataUrl: string): Promise<string | null> {
  try {
    const { url, key: anonKey } = getStoredSupabaseConfig();
    if (!url || !anonKey) return null;

    const client = createSupabaseInstance(url, anonKey);
    const storagePath = `${kind}/${safeSupabaseStorageKey(key)}.jpg`;
    const blob = dataUrlToBlob(photoDataUrl);
    const { error } = await client.storage.from(SUPABASE_BUCKET).upload(storagePath, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/jpeg',
    });

    if (error) {
      return null;
    }

    const { data } = client.storage.from(SUPABASE_BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}

async function tryDeleteFromSupabase(kind: 'voter' | 'ward', key: string | number): Promise<void> {
  try {
    const { url, key: anonKey } = getStoredSupabaseConfig();
    if (!url || !anonKey) return;

    const client = createSupabaseInstance(url, anonKey);
    const storagePath = `${kind}/${safeSupabaseStorageKey(key)}.jpg`;
    await client.storage.from(SUPABASE_BUCKET).remove([storagePath]);
  } catch {
    // ignore delete failures; local browser storage cleanup is still handled below
  }
}

export async function saveVoterPhoto(voterKey: string | number, photoDataUrl: string): Promise<void> {
  try {
    const publicUrl = await tryUploadToSupabase('voter', voterKey, photoDataUrl);
    if (publicUrl) {
      localStorage.setItem(`gp_photo_${voterKey}`, publicUrl);
    } else {
      localStorage.setItem(`gp_photo_${voterKey}`, photoDataUrl);
    }
  } catch {
    localStorage.setItem(`gp_photo_${voterKey}`, photoDataUrl);
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(photoDataUrl, String(voterKey));
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Could not save photo to IndexedDB:', err);
    try {
      localStorage.setItem(`gp_photo_${voterKey}`, photoDataUrl);
    } catch {
      // LocalStorage quota might be exceeded
    }
  }
}

export async function getVoterPhoto(voterKey: string | number): Promise<string | null> {
  const localValue = localStorage.getItem(`gp_photo_${voterKey}`);
  if (localValue) return localValue;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(String(voterKey));
      req.onsuccess = () => {
        if (req.result) {
          resolve(req.result);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteVoterPhoto(voterKey: string | number): Promise<void> {
  await tryDeleteFromSupabase('voter', voterKey);
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(String(voterKey));
    localStorage.removeItem(`gp_photo_${voterKey}`);
  } catch {
    localStorage.removeItem(`gp_photo_${voterKey}`);
  }
}

// Compress image to ~300x300 JPEG to keep performance fast
export function compressImage(source: string | HTMLVideoElement | HTMLImageElement, quality = 0.8): string {
  const canvas = document.createElement('canvas');
  const targetDim = 360;

  let width = targetDim;
  let height = targetDim;

  if (source instanceof HTMLVideoElement) {
    const vWidth = source.videoWidth || 640;
    const vHeight = source.videoHeight || 480;
    // Square crop from center
    const minDim = Math.min(vWidth, vHeight);
    canvas.width = targetDim;
    canvas.height = targetDim;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const sx = (vWidth - minDim) / 2;
      const sy = (vHeight - minDim) / 2;
      ctx.drawImage(source, sx, sy, minDim, minDim, 0, 0, targetDim, targetDim);
    }
  } else if (source instanceof HTMLImageElement) {
    const minDim = Math.min(source.naturalWidth, source.naturalHeight);
    canvas.width = targetDim;
    canvas.height = targetDim;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const sx = (source.naturalWidth - minDim) / 2;
      const sy = (source.naturalHeight - minDim) / 2;
      ctx.drawImage(source, sx, sy, minDim, minDim, 0, 0, targetDim, targetDim);
    }
  }

  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Generates an SVG dummy voter portrait picture based on the voter's name and ID.
 * Works 100% offline, zero latency, and renders natively in <img> tags.
 */
export function generateDummyVoterPhoto(id: number | string, name?: string, _gender?: string): string {
  let hash = 0;
  const safeName = (name || 'Voter').trim();
  const seedStr = `${safeName}-${id || '0'}`;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0;
  }
  const h = Math.abs(hash);

  const skinTones = ['#5a331e', '#6d4025', '#7f4d2e', '#8f5c3a', '#a06a46', '#b37a54'];
  const skin = skinTones[h % skinTones.length];
  const hairTones = ['#15100c', '#201610', '#110b07', '#2b1f17'];
  const hair = hairTones[(h >> 2) % hairTones.length];

  const bgPairs = [
    ['#1e3a8a', '#172554'], // Navy
    ['#065f46', '#022c22'], // Emerald
    ['#4c1d95', '#2e1065'], // Purple
    ['#9a3412', '#431407'], // Rust
    ['#0f766e', '#134e4a'], // Teal
    ['#374151', '#111827'], // Slate
    ['#831843', '#500724'], // Rose
    ['#1e40af', '#1e1b4b'], // Royal
  ];
  const [bg1, bg2] = bgPairs[(h >> 3) % bgPairs.length];

  const shirtColors = [
    '#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed',
    '#0891b2', '#475569', '#ea580c', '#0284c7', '#16a34a'
  ];
  const shirt = shirtColors[(h >> 5) % shirtColors.length];

  const initials = safeName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'V';

  const hairStyle = h % 3;
  const uniqueId = String(id).replace(/[^a-zA-Z0-9]/g, '_') || '0';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <radialGradient id="bg_${uniqueId}" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${bg1}" />
      <stop offset="100%" stop-color="${bg2}" />
    </radialGradient>
    <linearGradient id="shirt_${uniqueId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${shirt}" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.4" />
    </linearGradient>
  </defs>

  <!-- Studio Background -->
  <rect width="200" height="200" fill="url(#bg_${uniqueId})" />

  <!-- Soft vignette highlight -->
  <circle cx="100" cy="80" r="75" fill="#ffffff" opacity="0.08" />

  <!-- Body / Shoulders -->
  <path d="M20 200 C30 145, 60 135, 100 135 C140 135, 170 145, 180 200 Z" fill="url(#shirt_${uniqueId})" />

  <!-- Collar / Neckline -->
  <path d="M80 135 L100 160 L120 135 Z" fill="${skin}" />
  <path d="M78 135 L100 160 L122 135" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.35" />

  <!-- Neck -->
  <rect x="86" y="110" width="28" height="30" rx="6" fill="${skin}" />

  <!-- Head Base -->
  <ellipse cx="100" cy="82" rx="40" ry="48" fill="${skin}" />

  <!-- Ears -->
  <ellipse cx="58" cy="85" rx="7" ry="11" fill="${skin}" />
  <ellipse cx="142" cy="85" rx="7" ry="11" fill="${skin}" />

  <!-- Hair Styles -->
  ${hairStyle === 0 ? `
    <path d="M56 75 C50 45, 70 30, 100 30 C130 30, 150 45, 144 75 C140 60, 130 45, 100 45 C70 45, 60 60, 56 75 Z" fill="${hair}" />
    <circle cx="100" cy="44" r="38" fill="${hair}" opacity="0.95" />
  ` : hairStyle === 1 ? `
    <path d="M58 72 C55 48, 75 36, 100 36 C125 36, 145 48, 142 72 C135 52, 125 44, 100 44 C75 44, 65 52, 58 72 Z" fill="${hair}" />
  ` : `
    <ellipse cx="100" cy="46" rx="42" ry="26" fill="${hair}" />
  `}

  <!-- Eyes -->
  <ellipse cx="85" cy="82" rx="4" ry="4.5" fill="#15100c" />
  <ellipse cx="115" cy="82" rx="4" ry="4.5" fill="#15100c" />
  <circle cx="86" cy="80.5" r="1.3" fill="#ffffff" />
  <circle cx="116" cy="80.5" r="1.3" fill="#ffffff" />

  <!-- Eyebrows -->
  <path d="M78 74 Q86 71 93 74" stroke="${hair}" stroke-width="2.5" stroke-linecap="round" fill="none" />
  <path d="M107 74 Q114 71 122 74" stroke="${hair}" stroke-width="2.5" stroke-linecap="round" fill="none" />

  <!-- Nose -->
  <path d="M98 84 Q100 96 95 99 Q100 101 105 99 Q102 96 102 84" fill="#000000" opacity="0.2" />

  <!-- Smile -->
  <path d="M88 108 Q100 118 112 108" stroke="#3b1808" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.75" />

  <!-- Official ID Photo Badge Ribbon -->
  <rect x="0" y="174" width="200" height="26" fill="#0f172a" fill-opacity="0.88" />
  <text x="100" y="191" text-anchor="middle" fill="#38bdf8" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="800" letter-spacing="0.5">VOTER ID • #${id}</text>

  <!-- Initials Chip -->
  <rect x="8" y="8" width="28" height="18" rx="4" fill="#ffffff" fill-opacity="0.25" />
  <text x="22" y="21" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="9" font-weight="bold">${initials}</text>
</svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ─── Ward Photo Storage ───────────────────────────────────────────────────────
// Uses the same IndexedDB store, but with a "ward_" prefix on the key so ward
// photos never collide with voter photos.

function wardKey(wardName: string): string {
  return 'ward_' + wardName.trim().toLowerCase().replace(/\s+/g, '_');
}

export async function saveWardPhoto(wardName: string, photoDataUrl: string): Promise<void> {
  const key = wardKey(wardName);
  try {
    const publicUrl = await tryUploadToSupabase('ward', key, photoDataUrl);
    if (publicUrl) {
      localStorage.setItem(`gp_ward_photo_${key}`, publicUrl);
    } else {
      localStorage.setItem(`gp_ward_photo_${key}`, photoDataUrl);
    }
  } catch {
    localStorage.setItem(`gp_ward_photo_${key}`, photoDataUrl);
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(photoDataUrl, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    try { localStorage.setItem(`gp_ward_photo_${key}`, photoDataUrl); } catch { /* quota */ }
  }
}

export async function getWardPhoto(wardName: string): Promise<string | null> {
  const key = wardKey(wardName);
  const localValue = localStorage.getItem(`gp_ward_photo_${key}`);
  if (localValue) return localValue;

  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function deleteWardPhoto(wardName: string): Promise<void> {
  const key = wardKey(wardName);
  await tryDeleteFromSupabase('ward', key);
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch { /* ignore */ }
  localStorage.removeItem(`gp_ward_photo_${key}`);
}

/**
 * Generates an SVG dummy ward portrait/badge based on ward name.
 * Works 100% offline, zero latency, renders natively in <img> tags.
 */
export function generateDummyWardPhoto(wardName: string): string {
  let hash = 0;
  const safeName = (wardName || 'Ward').trim();
  for (let i = 0; i < safeName.length; i++) {
    hash = (hash << 5) - hash + safeName.charCodeAt(i);
    hash |= 0;
  }
  const h = Math.abs(hash);

  const bgPairs = [
    ['#4338ca', '#312e81'], // Indigo
    ['#7e22ce', '#581c87'], // Purple
    ['#0f766e', '#134e4a'], // Teal
    ['#0369a1', '#0c4a6e'], // Sky
    ['#b45309', '#78350f'], // Amber
    ['#be185d', '#831843'], // Pink
    ['#15803d', '#14532d'], // Emerald
  ];
  const [bg1, bg2] = bgPairs[h % bgPairs.length];

  const matchNum = safeName.match(/^\d+/);
  const wardNum = matchNum ? matchNum[0] : String((h % 54) + 1);
  const cleaned = safeName.replace(/^\d+\.\s*/, '').trim();
  const initials = cleaned
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || 'WD';

  const uniqueId = safeName.replace(/[^a-zA-Z0-9]/g, '_') || 'ward';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs>
    <radialGradient id="wbg_${uniqueId}" cx="50%" cy="35%" r="65%">
      <stop offset="0%" stop-color="${bg1}" />
      <stop offset="100%" stop-color="${bg2}" />
    </radialGradient>
  </defs>

  <rect width="200" height="200" fill="url(#wbg_${uniqueId})" />
  <circle cx="100" cy="80" r="75" fill="#ffffff" opacity="0.08" />
  <circle cx="100" cy="80" r="50" fill="#ffffff" opacity="0.08" />
  <circle cx="100" cy="80" r="25" fill="#ffffff" opacity="0.08" />

  <g transform="translate(100, 75)">
    <path d="M 0 -35 C -20 -35, -32 -18, -32 5 C -32 25, 0 52, 0 52 C 0 52, 32 25, 32 5 C 32 -18, 20 -35, 0 -35 Z" fill="#ffffff" opacity="0.95" />
    <circle cx="0" cy="3" r="14" fill="${bg1}" />
    <text x="0" y="8" text-anchor="middle" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="900">${initials}</text>
  </g>

  <rect x="0" y="156" width="200" height="44" fill="#0f172a" fill-opacity="0.92" />
  <text x="100" y="176" text-anchor="middle" fill="#38bdf8" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="800" letter-spacing="0.5">WARD #${wardNum}</text>
  <text x="100" y="191" text-anchor="middle" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="8" font-weight="600" letter-spacing="0.3">MENDI CENTRAL OPEN</text>

  <rect x="8" y="8" width="34" height="18" rx="4" fill="#ffffff" fill-opacity="0.25" />
  <text x="25" y="21" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="9" font-weight="bold">#${wardNum}</text>
</svg>`;

  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

import { createClient } from '@supabase/supabase-js';

export interface Voter {
  id?: number | string;
  full_name: string;
  phone?: string | null;
  ward: string;
  village?: string | null;
  support_status: 'Supporter' | 'Undecided' | 'Opposed';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WardRecord {
  id?: number | string;
  name: string;
  created_at?: string;
}

export const DEFAULT_SUPABASE_URL = 'https://twtabchsgjgqnihbhbue.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_r4HVQn0YfR8jBrzyR1OeXg_G8osAaB_';

const BLOCKED_WARDS = new Set(['pinj 1', 'pinj 2', 'piro 1', 'piro 2']);

export const WARD_NUMBER_MAP: Record<string, string> = {
  'kiburubox a': '1. Kiburu Box A',
  'kiburu box a': '1. Kiburu Box A',
  'kiburudbox a': '1. Kiburu Box A',
  'kiburud box a': '1. Kiburu Box A',
  '1.kiburudbox a': '1. Kiburu Box A',
  '1. kiburudbox a': '1. Kiburu Box A',
  '1.kiburud box a': '1. Kiburu Box A',
  '1. kiburud box a': '1. Kiburu Box A',
  '1.kiburu box a': '1. Kiburu Box A',
  '1. kiburu box a': '1. Kiburu Box A',
  'kiburubox b': '42. Kiburu Box B',
  'kiburu box b': '42. Kiburu Box B',
  'kiburudbox b': '42. Kiburu Box B',
  'kiburud box b': '42. Kiburu Box B',
  '42.kiburudbox b': '42. Kiburu Box B',
  '42. kiburudbox b': '42. Kiburu Box B',
  '42.kiburud box b': '42. Kiburu Box B',
  '42. kiburud box b': '42. Kiburu Box B',
  '42.kiburu box b': '42. Kiburu Box B',
  '42. kiburu box b': '42. Kiburu Box B',
  'kiburu box c - oiyarip': '2. Kiburu Box C',
  'kiburu box c': '2. Kiburu Box C',
  '2. kiburu box c': '2. Kiburu Box C',
  '2.kiburu box c': '2. Kiburu Box C',
  'tubiri': '5. Tubiri',
  'eskampe (tepe)': '6. Eskampe (Tepe)',
  'eskampe (tep': '6. Eskampe (Tepe)',
  'eskampe (tep)': '6. Eskampe (Tepe)',
  'eskampe tepe': '6. Eskampe (Tepe)',
  '6. eskampe (tepe)': '6. Eskampe (Tepe)',
  '6. eskampe (tep': '6. Eskampe (Tepe)',
  'una-kos1': '7. Una Kos1',
  'una kos1': '7. Una Kos1',
  'endawa (kos 2)': '8. Endawa (Kos 2)',
  'endawa (kos)': '8. Endawa (Kos 2)',
  'endawe (kos': '8. Endawa (Kos 2)',
  'endawa kos 2': '8. Endawa (Kos 2)',
  '8. endawa (kos 2)': '8. Endawa (Kos 2)',
  '8. endawe (kos': '8. Endawa (Kos 2)',
  'teta': '9. Teta',
  'mendi urban ward1': '10. Mendi Urban Ward 1',
  'mendi urban ward 1': '10. Mendi Urban Ward 1',
  '10. mendi urban': '10. Mendi Urban Ward 1',
  '10. mendi urban ward 1': '10. Mendi Urban Ward 1',
  'mendi urban ward3': '11. Mendi Urban Ward 3',
  'mendi urban ward 3': '11. Mendi Urban Ward 3',
  '11. mendi urban': '11. Mendi Urban Ward 3',
  '11. mendi urban ward 3': '11. Mendi Urban Ward 3',
  'yaken': '12. Yalam',
  'yalam': '12. Yalam',
  'yebi 2a': '13. Yebi 2A',
  'yebi 2b': '14. Yebi 2B',
  'yebi 1': '15. Yebi 1',
  'umbiala pundia': '16. Umbwia Pundia',
  'umbwia pun': '16. Umbwia Pundia',
  'umbwia pundia': '16. Umbwia Pundia',
  '16. umbwia pun': '16. Umbwia Pundia',
  '16. umbwia pundia': '16. Umbwia Pundia',
  'tutam lumbi box a lumbi': '17. Tulam Lumbi Box A',
  '17.tulam lumbi': '17. Tulam Lumbi Box A',
  '17. tulam lumbi': '17. Tulam Lumbi Box A',
  'tulam lumbi box a': '17. Tulam Lumbi Box A',
  '17. tulam lumbi box a': '17. Tulam Lumbi Box A',
  'tutam lumbi b tutam': '18. Tulam Lumbi Box B',
  '18.tulam lumbi': '18. Tulam Lumbi Box B',
  '18. tulam lumbi': '18. Tulam Lumbi Box B',
  'tulam lumbi box b': '18. Tulam Lumbi Box B',
  '18. tulam lumbi box b': '18. Tulam Lumbi Box B',
  'bui ebi cis': '20. Bui Ela CIS',
  'bui ela cis': '20. Bui Ela CIS',
  'polomanda unjamap': '21. Poromanda Unjamap',
  'poromanda unjamap': '21. Poromanda Unjamap',
  '21. poromanda u': '21. Poromanda Unjamap',
  '21. poromanda unjamap': '21. Poromanda Unjamap',
  'tente ward 1 6mile': '22. Tente Ward 1 (6mile)',
  'tente ward 1': '22. Tente Ward 1 (6mile)',
  '22. tente ward': '22. Tente Ward 1 (6mile)',
  '22. tente ward 1 (6mile)': '22. Tente Ward 1 (6mile)',
  'urban ward 2 yc-magani': '23. Urban Ward 2 (YC-Magani)',
  'urban ward': '23. Urban Ward 2 (YC-Magani)',
  '23. urban ward': '23. Urban Ward 2 (YC-Magani)',
  '23. urban ward 2 (yc-magani)': '23. Urban Ward 2 (YC-Magani)',
  'tente ward 2 5mile': '24. Tente Ward 2 (5mile)',
  'tente ward 2 (5mile)': '24. Tente Ward 2 (5mile)',
  '24. tente ward': '24. Tente Ward 2 (5mile)',
  '24. tente ward 2 (5mile)': '24. Tente Ward 2 (5mile)',
  'yaria': '25. Yaria',
  'sumia 1': '26. Sumia Ward 1',
  'sumia ward 1': '26. Sumia Ward 1',
  'sumia ward1': '26. Sumia Ward 1',
  'sumia ward': '26. Sumia Ward 1',
  '26. sumia ward': '26. Sumia Ward 1',
  '26. sumia ward 1': '26. Sumia Ward 1',
  'sumia 2': '27. Sumia Ward 2',
  'sumia ward 2': '27. Sumia Ward 2',
  'sumia ward2': '27. Sumia Ward 2',
  '27. sumia ward': '27. Sumia Ward 2',
  '27. sumia ward 2': '27. Sumia Ward 2',
  'sumia 3': '34. Sumia Ward 3',
  'sumia ward 3': '34. Sumia Ward 3',
  'sumia ward3': '34. Sumia Ward 3',
  '34. sumia ward': '34. Sumia Ward 3',
  '34. sumia ward 3': '34. Sumia Ward 3',
  'sumia 4': '35. Sumia Ward 4',
  'sumia ward 4': '35. Sumia Ward 4',
  'sumia ward4': '35. Sumia Ward 4',
  '35. sumia ward': '35. Sumia Ward 4',
  '35. sumia ward 4': '35. Sumia Ward 4',
  'onne': '28. Onne',
  'longo kave box a': '29. Longo Kave Box A',
  '29. longo kave': '29. Longo Kave Box A',
  '29. longo kave box a': '29. Longo Kave Box A',
  'longo kave box b': '30. Longo Kave Box B',
  '30. longo kave': '30. Longo Kave Box B',
  '30. longo kave box b': '30. Longo Kave Box B',
  'porolo box a': '31. Porolo Box A',
  '31. porolo box': '31. Porolo Box A',
  '31. porolo box a': '31. Porolo Box A',
  'porolo box b': '32. Porolo Box B',
  '32. porolo box': '32. Porolo Box B',
  '32. porolo box b': '32. Porolo Box B',
  'asisa 2 papera': '33. Asisa 2 Papera',
  'asisa 2 pap': '33. Asisa 2 Papera',
  '33. asisa 2 pap': '33. Asisa 2 Papera',
  '33. asisa 2 papera': '33. Asisa 2 Papera',
  'ibia': '36. Ibia',
  '36. ibia': '36. Ibia',
  'yameriga': '37. Yameriga',
  'umbimi': '38. Umbimi',
  'wakwak box a': '39. Wakwak Box A',
  '39. wakwak box': '39. Wakwak Box A',
  '39. wakwak box a': '39. Wakwak Box A',
  'wakwak box b': '40. Wakwak Box B',
  '40. wakwak box': '40. Wakwak Box B',
  '40. wakwak box b': '40. Wakwak Box B',
  '41. ibia': '41. Ibia',
};

export function cleanWardName(ward: string | null | undefined): string {
  if (!ward) return '';
  let cleaned = ward.trim();
  cleaned = cleaned
    .replace(/kiburud\s*box/gi, 'Kiburu Box')
    .replace(/kiburudbox/gi, 'Kiburu Box')
    .replace(/kiburud/gi, 'Kiburu')
    .replace(/^1\.\s*kiburu\s*box\s*a/gi, '1. Kiburu Box A')
    .replace(/^42\.\s*kiburu\s*box\s*b/gi, '42. Kiburu Box B')
    .replace(/^1\.\s*kiburudbox\s*a/gi, '1. Kiburu Box A')
    .replace(/^42\.\s*kiburudbox\s*b/gi, '42. Kiburu Box B');

  // Normalize spacing after leading number e.g. "1.Kiburu" -> "1. Kiburu"
  cleaned = cleaned.replace(/^(\d+)\.\s*/, (_match, p1) => `${p1}. `);
  return cleaned;
}

export function formatWardDisplay(ward: string | null | undefined): string {
  if (!ward) return '-';
  const trimmed = cleanWardName(ward);
  const key = trimmed.toLowerCase();
  if (WARD_NUMBER_MAP[key]) return WARD_NUMBER_MAP[key];

  // Try matching without leading digits e.g. "1. Kiburu Box A" -> "kiburu box a"
  const withoutNumberKey = key.replace(/^\d+\.\s*/, '').trim();
  if (WARD_NUMBER_MAP[withoutNumberKey]) return WARD_NUMBER_MAP[withoutNumberKey];

  if (/^sumia\s*(ward)?\s*1$/i.test(withoutNumberKey)) return '26. Sumia Ward 1';
  if (/^sumia\s*(ward)?\s*2$/i.test(withoutNumberKey)) return '27. Sumia Ward 2';
  if (/^sumia\s*(ward)?\s*3$/i.test(withoutNumberKey)) return '34. Sumia Ward 3';
  if (/^sumia\s*(ward)?\s*4$/i.test(withoutNumberKey)) return '35. Sumia Ward 4';

  if (/^\d+\./.test(trimmed)) return trimmed;
  return trimmed;
}

export function normalizeWardKey(ward: string | null | undefined): string {
  if (!ward) return '';
  return formatWardDisplay(ward)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export const INITIAL_FALLBACK_WARDS = [
  '1. Kiburu Box A',
  '2. Kiburu Box C',
  '5. Tubiri',
  '6. Eskampe (Tepe)',
  '7. Una Kos1',
  '8. Endawa (Kos 2)',
  '9. Teta',
  '10. Mendi Urban Ward 1',
  '11. Mendi Urban Ward 3',
  '12. Yalam',
  '13. Yebi 2A',
  '14. Yebi 2B',
  '15. Yebi 1',
  '16. Umbwia Pundia',
  '17. Tulam Lumbi Box A',
  '18. Tulam Lumbi Box B',
  '20. Bui Ela CIS',
  '21. Poromanda Unjamap',
  '22. Tente Ward 1 (6mile)',
  '23. Urban Ward 2 (YC-Magani)',
  '24. Tente Ward 2 (5mile)',
  '25. Yaria',
  '26. Sumia Ward 1',
  '27. Sumia Ward 2',
  '28. Onne',
  '29. Longo Kave Box A',
  '30. Longo Kave Box B',
  '31. Porolo Box A',
  '32. Porolo Box B',
  '33. Asisa 2 Papera',
  '34. Sumia Ward 3',
  '35. Sumia Ward 4',
  '36. Ibia',
  '37. Yameriga',
  '38. Umbimi',
  '39. Wakwak Box A',
  '40. Wakwak Box B',
  '41. Ibia',
  '42. Kiburu Box B',
];

export function getStoredWardRenames(): Record<string, string> {
  try {
    const raw = localStorage.getItem('gp_ward_renames');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveWardRename(oldName: string, newName: string): void {
  try {
    const renames = getStoredWardRenames();
    const cleanNew = cleanWardName(newName).trim();
    if (!cleanNew) return;
    const oldFmt = formatWardDisplay(oldName).toLowerCase();
    const oldRaw = oldName.trim().toLowerCase();
    renames[oldFmt] = cleanNew;
    renames[oldRaw] = cleanNew;
    // Also store stripped version
    const oldWithoutNum = oldRaw.replace(/^\d+\.\s*/, '').trim();
    if (oldWithoutNum) {
      renames[oldWithoutNum] = cleanNew;
    }
    localStorage.setItem('gp_ward_renames', JSON.stringify(renames));
  } catch {
    // ignore
  }
}

export function getStoredDeletedWards(): string[] {
  try {
    const raw = localStorage.getItem('gp_deleted_wards');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDeletedWard(wardName: string): void {
  try {
    const deleted = getStoredDeletedWards();
    const target = formatWardDisplay(wardName).toLowerCase();
    const rawLower = wardName.trim().toLowerCase();
    if (!deleted.includes(target)) deleted.push(target);
    if (!deleted.includes(rawLower)) deleted.push(rawLower);
    localStorage.setItem('gp_deleted_wards', JSON.stringify(deleted));
  } catch {
    // ignore
  }
}

/**
 * Merges wards from multiple sources (fallbacks, database records, custom additions),
 * applies persistent user renames, filters deleted wards, and deduplicates to guarantee
 * NO DUPLICATE WARDS can ever appear.
 */
export function resolveWards(sources: (string[] | undefined | null)[]): string[] {
  const renames = getStoredWardRenames();
  const deletedList = getStoredDeletedWards();
  const deletedSet = new Set(deletedList.map((d) => formatWardDisplay(d).toLowerCase()));

  const seenCanonical = new Set<string>();
  const result: string[] = [];

  for (const list of sources) {
    if (!list) continue;
    for (const raw of list) {
      if (!raw || typeof raw !== 'string') continue;
      let name = cleanWardName(raw);
      if (!name) continue;

      // Check if this ward was renamed by the user
      const oldFmt = formatWardDisplay(name).toLowerCase();
      const rawLower = name.toLowerCase();
      const withoutNum = rawLower.replace(/^\d+\.\s*/, '').trim();

      if (renames[oldFmt]) {
        name = renames[oldFmt];
      } else if (renames[rawLower]) {
        name = renames[rawLower];
      } else if (renames[withoutNum]) {
        name = renames[withoutNum];
      }

      const canonical = formatWardDisplay(name).toLowerCase();
      if (deletedSet.has(canonical) || deletedSet.has(rawLower) || deletedSet.has(withoutNum)) {
        continue;
      }

      if (BLOCKED_WARDS.has(canonical) || BLOCKED_WARDS.has(rawLower) || BLOCKED_WARDS.has(withoutNum)) {
        continue;
      }

      // Deduplicate so duplicate of same ward is strictly impossible
      if (!seenCanonical.has(canonical)) {
        seenCanonical.add(canonical);
        result.push(formatWardDisplay(name));
      }
    }
  }

  // Sort logically: numbered wards first (1..50), then alphabetical for custom unnumbered
  return result.sort((a, b) => {
    const numA = parseInt(a.match(/^(\d+)\./)?.[1] || '9999', 10);
    const numB = parseInt(b.match(/^(\d+)\./)?.[1] || '9999', 10);
    if (numA !== numB) return numA - numB;
    return a.localeCompare(b);
  });
}

export function getStoredSupabaseConfig() {
  const url = localStorage.getItem('gp_supabase_url') || import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('gp_supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  return { url: url.trim(), key: key.trim() };
}

export function saveStoredSupabaseConfig(url: string, key: string) {
  localStorage.setItem('gp_supabase_url', url.trim());
  localStorage.setItem('gp_supabase_key', key.trim());
}

export function resetStoredSupabaseConfig() {
  localStorage.removeItem('gp_supabase_url');
  localStorage.removeItem('gp_supabase_key');
}

export function createSupabaseInstance(url = DEFAULT_SUPABASE_URL, key = DEFAULT_SUPABASE_KEY) {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });
}

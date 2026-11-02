import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { logout, type User } from '@netlify/identity';
import { createSupabaseInstance, getStoredSupabaseConfig, type Voter } from './lib/supabase';
import { UserManagementModal } from './components/UserManagementModal';
import {
  compressImage,
  deleteVoterPhoto,
  getVoterPhoto,
  onPhotosChanged,
  saveVoterPhoto,
  startPhotoSync,
} from './lib/photoStorage';

type Tab = 'dash' | 'voters' | 'add' | 'ward';
type Status = Voter['support_status'];

const STATUSES: Status[] = ['Supporter', 'Undecided', 'Opposed'];
// Stored values stay as they are in the database; only the labels shown on screen change.
const LABEL: Record<Status, string> = { Supporter: 'Voter 1', Undecided: 'Voter 2', Opposed: 'Voter 3' };
const STATUS_CLASS: Record<Status, string> = { Supporter: 'c1', Undecided: 'c2', Opposed: 'c3' };
const PAGE = 1000;
// Wards typed in on the Add ward tab are saved in the database with a date on or after this one.
const WARD_ADDED_AFTER = '2026-11-01';
const LOCAL_WARDS = 'gp_added_wards';

function readLocalWards(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_WARDS) || '[]');
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// The 51 wards. The Add voter list and the ward filter use exactly these names.
const WARDS = [
  'Kiburu Box A', 'Kiburu Box B', 'Kiburu Box C', 'Kiburu Box D', 'Pinj (1)', 'Pinj (2)', 'Tubiri',
  'Eskampe (Tepe)', 'Una Kos1', 'Endawa (Kos 2)', 'Teta', 'Mendi Urban Ward 1', 'Mendi Urban Ward 3',
  'Urban Ward 2 (YC-Magani)', 'Yalam', 'Yebi 1', 'Yebi 2A', 'Yebi 2B', 'Yabi 4', 'Umbwia Pundia',
  'Tulam Lumbi Box A', 'Tulam Lumbi Box B', 'Bui Ela CIS', 'Yaria', 'Yaria Box C', 'Poromanda Unjamap',
  'Unjamap', 'Tente Ward 1 (6mile)', 'Tente Ward 2 (5mile)', 'Sumia Ward 1', 'Sumia Ward 2',
  'Sumia Ward 4', 'Honne', 'Longo Kave Box A', 'Longo Kave Box B', 'Porolo Box A', 'Porolo Box B',
  'Asisa 2 Papera', 'Omai (Asisa 1)', 'Ibia', 'Yameriga', 'Umbimi', 'Wakwak Box A', 'Wakwak Box B',
  'Usa', 'Usa Ward 6', 'Payamo', 'Meggie', 'WaMes', 'Tigiri Box A', 'Yore',
];

const wardKey = (w: string) =>
  w.toLowerCase().replace(/^\s*\d+\s*\.\s*/, '').replace(/[^a-z0-9]+/g, '');

// Older records were typed in different spellings; these map onto the names above.
const WARD_LOOKUP = new Map<string, string>([
  ...WARDS.map((w) => [wardKey(w), w] as [string, string]),
  ['buiebicis', 'Bui Ela CIS'],
  ['umbialapundia', 'Umbwia Pundia'],
  ['yaken', 'Yalam'],
  ['yameria', 'Yameriga'],
  ['tutamlumbiboxalumbi', 'Tulam Lumbi Box A'],
  ['tutamlumbiboxa', 'Tulam Lumbi Box A'],
  ['tutamlumbiboxb', 'Tulam Lumbi Box B'],
  ['tutamlumbibtutam', 'Tulam Lumbi Box B'],
  ['tutamlumbiboxbtutam', 'Tulam Lumbi Box B'],
]);

function canon(ward: string | null | undefined): string {
  const raw = (ward ?? '').trim();
  if (!raw) return '';
  return WARD_LOOKUP.get(wardKey(raw)) ?? raw.replace(/^\s*\d+\s*\.\s*/, '');
}

const supabase = (() => {
  const { url, key } = getStoredSupabaseConfig();
  return createSupabaseInstance(url, key);
})();

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function isAdminUser(user: User) {
  const u = user as unknown as { roles?: string[]; app_metadata?: { roles?: string[] } };
  return Boolean(u.roles?.includes('admin') || u.app_metadata?.roles?.includes('admin'));
}

function fileToPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(compressImage(img, 0.85));
      img.onerror = () => reject(new Error('Could not read the image.'));
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function usePhoto(id: Voter['id']) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (id == null) return;
    let alive = true;
    const run = () =>
      getVoterPhoto(id)
        .then((u) => alive && setUrl(u))
        .catch(() => undefined);
    run();
    const off = onPhotosChanged(run);
    return () => {
      alive = false;
      off();
    };
  }, [id]);
  return url;
}

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="60%" height="60%" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="8" r="4.2" />
      <path d="M3.5 21c.6-4.6 4-7.2 8.5-7.2s7.9 2.6 8.5 7.2z" />
    </svg>
  );
}

/** The voter's photo, or a person-shaped placeholder until one is added. */
function VoterPhoto({ id, name, big = false }: { id: Voter['id']; name: string; big?: boolean }) {
  const url = usePhoto(id);
  const size = big ? 'av big' : 'av';
  return url ? (
    <img className={`${size} photo`} src={url} alt={`Photo of ${name}`} loading="lazy" />
  ) : (
    <span className={`${size} ph`} role="img" aria-label="No photo yet">
      <PersonIcon />
    </span>
  );
}

function Badge({ status }: { status: Status }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? 'c2'}`}>{LABEL[status]}</span>;
}

export default function App({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('dash');
  const [voters, setVoters] = useState<Voter[]>([]);
  const [wardNames, setWardNames] = useState<string[]>(WARDS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedId, setSelectedId] = useState<Voter['id'] | null>(null);
  const [showUsers, setShowUsers] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const userName =
    (user as unknown as { name?: string; user_metadata?: { full_name?: string }; email?: string })
      ?.user_metadata?.full_name ||
    (user as unknown as { name?: string }).name ||
    (user as unknown as { email?: string }).email ||
    'Coordinator';

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2400);
  }, []);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const all: Voter[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('voters')
          .select('id, full_name, phone, ward, village, support_status, notes, created_at, updated_at')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        all.push(...((data as Voter[]) ?? []));
        if (!data || data.length < PAGE) break;
      }
      setVoters(all);

      const { data: wardRows } = await supabase.from('wards').select('name').gte('created_at', WARD_ADDED_AFTER);
      const added = [...(wardRows ?? []).map((w: { name: string }) => w.name), ...readLocalWards()];
      const extras = new Set<string>();
      [...all.map((v) => v.ward), ...added].forEach((raw) => {
        const c = canon(raw);
        if (c && !WARDS.includes(c)) extras.add(c);
      });
      setWardNames([...WARDS, ...[...extras].sort()]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load voters.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => startPhotoSync(supabase), []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('voters-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voters' }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const selected = useMemo(
    () => voters.find((v) => v.id === selectedId) ?? null,
    [voters, selectedId],
  );

  const updateVoter = async (id: Voter['id'], patch: Partial<Voter>, message: string) => {
    const { error } = await supabase
      .from('voters')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      showToast(`Could not save: ${error.message}`);
      return;
    }
    setVoters((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
    showToast(message);
  };

  const deleteVoter = async (id: Voter['id']) => {
    if (!window.confirm('Delete this voter record? This cannot be undone.')) return;
    const { error } = await supabase.from('voters').delete().eq('id', id);
    if (error) {
      showToast(`Could not delete: ${error.message}`);
      return;
    }
    setVoters((list) => list.filter((v) => v.id !== id));
    setSelectedId(null);
    showToast('Voter deleted');
  };

  const addVoter = async (v: Omit<Voter, 'id'>, photo: string | null) => {
    const { data, error } = await supabase.from('voters').insert(v).select('id').single();
    if (error) {
      showToast(`Could not save: ${error.message}`);
      return false;
    }
    if (photo && data?.id != null) await saveVoterPhoto(data.id, photo);
    showToast('Voter saved');
    await load();
    setTab('voters');
    return true;
  };

  const addWard = async (name: string, notes: string): Promise<'saved' | 'local' | 'exists' | 'empty'> => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return 'empty';
    if (wardNames.some((w) => wardKey(w) === wardKey(clean))) return 'exists';
    const { error } = await supabase.from('wards').insert({ name: clean, notes: notes.trim() || null });
    if (error) {
      try {
        localStorage.setItem(LOCAL_WARDS, JSON.stringify([...readLocalWards(), clean]));
      } catch {
        /* storage unavailable */
      }
      setWardNames((list) => [...list, clean]);
      return 'local';
    }
    showToast('Ward added');
    await load();
    return 'saved';
  };

  const goTab = (t: Tab) => {
    setTab(t);
    window.scrollTo(0, 0);
  };

  return (
    <div className="sh">
      <header className="top">
        <div>
          <h1>
            Advanced Voter Database
            <small>Gibson Palipe · Mendi Central Open | Complete Voter Management System</small>
          </h1>
        </div>
        <div className="right">
          <span className="pill">{userName}</span>
          {isAdminUser(user) && (
            <button className="btn ghost" onClick={() => setShowUsers(true)}>
              Users
            </button>
          )}
          <button className="btn ghost" onClick={() => logout().then(() => window.location.reload())}>
            Sign out
          </button>
        </div>
      </header>

      <nav aria-label="Sections">
        {(
          [
            ['dash', 'Dashboard'],
            ['voters', 'Voters'],
            ['add', 'Add voter'],
            ['ward', 'Add ward'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => goTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      <main>
        {loadError && (
          <div className="banner error">
            {loadError} <button className="linklike" onClick={load}>Try again</button>
          </div>
        )}
        {tab === 'dash' && <Dashboard voters={voters} loading={loading} />}
        {tab === 'voters' && (
          <VoterList voters={voters} wards={wardNames} loading={loading} onOpen={setSelectedId} />
        )}
        {tab === 'add' && <AddVoter wards={wardNames} onSave={addVoter} />}
        {tab === 'ward' && <AddWard wards={wardNames} voters={voters} onSave={addWard} />}
      </main>

      {selected && (
        <VoterDialog
          voter={selected}
          onClose={() => setSelectedId(null)}
          onStatus={(s) => updateVoter(selected.id!, { support_status: s }, `Preference saved: ${LABEL[s]}`)}
          onNotes={(n) => updateVoter(selected.id!, { notes: n }, 'Notes saved')}
          onDelete={() => deleteVoter(selected.id!)}
          onToast={showToast}
        />
      )}

      {showUsers && (
        <UserManagementModal
          currentUserId={(user as unknown as { id: string }).id}
          onClose={() => setShowUsers(false)}
        />
      )}

      {toast && (
        <div id="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Dashboard ---------------------------------- */

function Dashboard({ voters, loading }: { voters: Voter[]; loading: boolean }) {
  const total = voters.length;
  const count = (s: Status) => voters.filter((v) => v.support_status === s).length;
  const pc = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const byWard = useMemo(() => {
    const map = new Map<string, Record<Status, number> & { total: number }>();
    voters.forEach((v) => {
      const key = canon(v.ward) || 'No ward';
      const row = map.get(key) ?? { Supporter: 0, Undecided: 0, Opposed: 0, total: 0 };
      if (v.support_status in row) row[v.support_status] += 1;
      row.total += 1;
      map.set(key, row);
    });
    return [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [voters]);

  const recent = voters.slice(0, 6);

  if (loading) return <p className="count">Loading voters…</p>;

  return (
    <section>
      <h2>Campaign progress</h2>
      <div className="stats">
        <div className="card stat">
          <b>{total.toLocaleString()}</b>
          <span>Voters recorded</span>
        </div>
        {STATUSES.map((s, i) => (
          <div key={s} className={`card stat s${i + 1}`}>
            <b>{count(s).toLocaleString()}</b>
            <span>
              {LABEL[s]} &middot; {pc(count(s))}%
            </span>
          </div>
        ))}
      </div>

      <div className="cols">
        <div className="card">
          <h3>Voter preference by ward</h3>
          <div className="legend">
            {STATUSES.map((s) => (
              <span key={s}>
                <i className={`dot ${STATUS_CLASS[s]}`} />
                {LABEL[s]}
              </span>
            ))}
          </div>
          {byWard.length === 0 && <p className="muted">No voters yet.</p>}
          {byWard.map(([ward, row]) => (
            <div className="drow" key={ward}>
              <span>{ward}</span>
              <div
                className="bar"
                role="img"
                aria-label={`${ward}: ${row.Supporter} Voter 1, ${row.Undecided} Voter 2, ${row.Opposed} Voter 3`}
              >
                {STATUSES.map((s) => (
                  <i key={s} className={STATUS_CLASS[s]} style={{ width: `${(row[s] / row.total) * 100}%` }} />
                ))}
              </div>
              <span>{row.total}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Recently added</h3>
          {recent.length === 0 && <p className="muted">No voters yet.</p>}
          {recent.map((v) => (
            <div className="act" key={v.id}>
              <b>{v.full_name}</b>, {v.village || canon(v.ward)}
              <span>
                {v.created_at ? v.created_at.slice(0, 10) : ''} &middot; {LABEL[v.support_status] ?? v.support_status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- Voter list ----------------------------------- */

function VoterList({
  voters,
  wards,
  loading,
  onOpen,
}: {
  voters: Voter[];
  wards: string[];
  loading: boolean;
  onOpen: (id: Voter['id']) => void;
}) {
  const [q, setQ] = useState('');
  const [ward, setWard] = useState('');
  const [status, setStatus] = useState('');
  const [limit, setLimit] = useState(60);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return voters.filter(
      (v) =>
        (!ward || canon(v.ward) === ward) &&
        (!status || v.support_status === status) &&
        (!needle || `${v.full_name} ${v.village ?? ''} ${v.phone ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [voters, q, ward, status]);

  useEffect(() => setLimit(60), [q, ward, status]);

  return (
    <section>
      <h2>Voters</h2>
      <div className="filters">
        <input
          type="search"
          placeholder="Search by name, village or phone"
          aria-label="Search voters"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label="Ward" value={ward} onChange={(e) => setWard(e.target.value)}>
          <option value="">All wards</option>
          {wards.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
        <select aria-label="Preference" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All preferences</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{LABEL[s]}</option>
          ))}
        </select>
      </div>
      <div className="count">
        {loading ? 'Loading…' : `${filtered.length.toLocaleString()} of ${voters.length.toLocaleString()} voters`}
      </div>
      <div className="vlist">
        {!loading && filtered.length === 0 && (
          <div className="card">No voters match. Clear the search or choose &ldquo;All wards&rdquo;.</div>
        )}
        {filtered.slice(0, limit).map((v) => (
          <button key={v.id} className="voter" onClick={() => onOpen(v.id)}>
            <VoterPhoto id={v.id} name={v.full_name} />
            <span>
              <b>{v.full_name}</b>
              <small>
                {[v.village, canon(v.ward)].filter((x) => x && x !== '-').join(', ')}
              </small>
            </span>
            <Badge status={v.support_status} />
          </button>
        ))}
      </div>
      {filtered.length > limit && (
        <button className="btn ghost more" onClick={() => setLimit((n) => n + 60)}>
          Show more ({filtered.length - limit} left)
        </button>
      )}
    </section>
  );
}

/* --------------------------------- Voter dialog --------------------------------- */

function VoterDialog({
  voter,
  onClose,
  onStatus,
  onNotes,
  onDelete,
  onToast,
}: {
  voter: Voter;
  onClose: () => void;
  onStatus: (s: Status) => void;
  onNotes: (n: string) => void;
  onDelete: () => void;
  onToast: (m: string) => void;
}) {
  const hasPhoto = usePhoto(voter.id) !== null;
  const ref = useRef<HTMLDialogElement>(null);
  const [notes, setNotes] = useState(voter.notes ?? '');

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => setNotes(voter.notes ?? ''), [voter.id, voter.notes]);

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="vhead">
        <VoterPhoto id={voter.id} name={voter.full_name} big />
        <div>
          <h2>{voter.full_name}</h2>
          <div className="row tight">
            <label className="btn ghost small">
              {hasPhoto ? 'Change photo' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  try {
                    const data = await fileToPhoto(file);
                    const ok = await saveVoterPhoto(voter.id!, data);
                    onToast(ok ? 'Photo saved' : 'Photo kept on this device and will upload when online');
                  } catch (err) {
                    onToast(err instanceof Error ? err.message : 'Could not save the photo.');
                  }
                }}
              />
            </label>
            {hasPhoto && (
              <button className="btn ghost small" onClick={() => deleteVoterPhoto(voter.id!)}>
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      <dl>
        <dt>Ward</dt>
        <dd>{canon(voter.ward) || '-'}</dd>
        <dt>Village</dt>
        <dd>{voter.village || '-'}</dd>
        <dt>Phone</dt>
        <dd>{voter.phone || 'Not given'}</dd>
      </dl>
      <b>Preference</b>
      <div className="prefs">
        {STATUSES.map((s) => (
          <button key={s} aria-pressed={voter.support_status === s} onClick={() => onStatus(s)}>
            {LABEL[s]}
          </button>
        ))}
      </div>
      <label htmlFor="vn">Notes</label>
      <textarea id="vn" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row">
        <button className="btn" onClick={() => onNotes(notes.trim())}>
          Save notes
        </button>
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
        <button className="btn ghost danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </dialog>
  );
}

/* ----------------------------------- Add voter ----------------------------------- */

function AddVoter({
  wards,
  onSave,
}: {
  wards: string[];
  onSave: (v: Omit<Voter, 'id'>, photo: string | null) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [ward, setWard] = useState('');
  const [village, setVillage] = useState('');
  const [status, setStatus] = useState<Status>('Supporter');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ward && wards.length) setWard(wards[0]);
  }, [wards, ward]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await onSave({
      full_name: name.trim(),
      phone: phone.trim(),
      ward,
      village: village.trim(),
      support_status: status,
      notes: notes.trim() || null,
    }, photo);
    setSaving(false);
    if (ok) {
      setPhoto(null);
      setName('');
      setPhone('');
      setVillage('');
      setNotes('');
      setStatus('Supporter');
    }
  };

  return (
    <section>
      <h2>Add a voter</h2>
      <form className="card" onSubmit={submit}>
        <div className="vhead">
          {photo ? (
            <img className="av big photo" src={photo} alt="Voter photo preview" />
          ) : (
            <span className="av big ph" role="img" aria-label="No photo yet">
              <PersonIcon />
            </span>
          )}
          <div>
            <b>Voter photo</b>
            <div className="row tight">
              <label className="btn ghost small">
                {photo ? 'Change photo' : 'Add photo'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      setPhoto(await fileToPhoto(file));
                      setPhotoError('');
                    } catch (err) {
                      setPhotoError(err instanceof Error ? err.message : 'Could not read the image.');
                    }
                  }}
                />
              </label>
              {photo && (
                <button type="button" className="btn ghost small" onClick={() => setPhoto(null)}>
                  Remove
                </button>
              )}
            </div>
            {photoError && <div className="muted">{photoError}</div>}
          </div>
        </div>
        <div className="grid2">
          <div>
            <label htmlFor="fn">Full name</label>
            <input id="fn" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="fph">Phone</label>
            <input
              id="fph"
              inputMode="tel"
              placeholder="+675"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="fw">Ward</label>
            <select id="fw" value={ward} onChange={(e) => setWard(e.target.value)}>
              {wards.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fv">Village</label>
            <input id="fv" value={village} onChange={(e) => setVillage(e.target.value)} />
          </div>
        </div>
        <label htmlFor="fpr">Preference</label>
        <select id="fpr" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{LABEL[s]}</option>
          ))}
        </select>
        <label htmlFor="fno">Notes</label>
        <textarea id="fno" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="btn" style={{ marginTop: 18 }} type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save voter'}
        </button>
      </form>
    </section>
  );
}

/* ------------------------------------ Add ward ------------------------------------ */

function AddWard({
  wards,
  voters,
  onSave,
}: {
  wards: string[];
  voters: Voter[];
  onSave: (name: string, notes: string) => Promise<'saved' | 'local' | 'exists' | 'empty'>;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    voters.forEach((v) => {
      const c = canon(v.ward);
      m.set(c, (m.get(c) ?? 0) + 1);
    });
    return m;
  }, [voters]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const result = await onSave(name, notes);
    setSaving(false);
    if (result === 'exists') {
      setMessage({ kind: 'warn', text: 'That ward is already in the list.' });
      return;
    }
    if (result === 'empty') return;
    setMessage(
      result === 'local'
        ? {
            kind: 'warn',
            text: 'Added on this device only. The database did not accept the new ward, so other devices will not see it.',
          }
        : { kind: 'ok', text: `${name.trim()} added. It now appears in Add voter and the Voters filter.` },
    );
    setName('');
    setNotes('');
  };

  return (
    <section>
      <h2>Add a ward</h2>
      <form className="card" onSubmit={submit}>
        <label htmlFor="wn">Ward name</label>
        <input id="wn" required value={name} onChange={(e) => setName(e.target.value)} />
        <label htmlFor="wno">Notes</label>
        <textarea id="wno" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {message && <div className={`banner note ${message.kind}`}>{message.text}</div>}
        <button className="btn" style={{ marginTop: 18 }} type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save ward'}
        </button>
      </form>

      <h3 style={{ marginTop: 28 }}>All wards ({wards.length})</h3>
      <div className="chips">
        {wards.map((w) => (
          <div className="chip" key={w}>
            {w}
            <span>{counts.get(w) ?? 0}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

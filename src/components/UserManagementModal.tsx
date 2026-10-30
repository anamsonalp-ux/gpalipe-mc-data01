import React, { useEffect, useState } from 'react';
import { X, UserPlus, Trash2, AlertCircle, CheckCircle, Shield, RefreshCw, KeyRound } from 'lucide-react';
import { normalizeUsername } from '../lib/username';

interface ManagedUser {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  roles: string[];
  createdAt?: string;
  lastSignInAt?: string;
}

interface UserManagementModalProps {
  currentUserId: string;
  onClose: () => void;
}

const API = '/api/admin/users';

async function readError(res: Response) {
  const body = await res.json().catch(() => null);
  return body?.error || `Request failed (${res.status})`;
}

export function UserManagementModal({ currentUserId, onClose }: UserManagementModalProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch(API, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, admin: makeAdmin }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNotice(`Account created for ${normalizeUsername(username)}. Share the username and password with them securely.`);
      setName('');
      setUsername('');
      setPassword('');
      setMakeAdmin(false);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (user: ManagedUser) => {
    if (!window.confirm(`Delete the account for ${user.username || user.email}? They will no longer be able to sign in.`)) return;
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API}?id=${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(await readError(res));
      setNotice(`Deleted ${user.username || user.email}.`);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete user.');
    }
  };

  const handleResetPassword = async (user: ManagedUser) => {
    const label = user.username || user.email;
    const newPassword = window.prompt(`Enter a new password for ${label} (min. 8 characters):`);
    if (newPassword === null) return;
    setError('');
    setNotice('');
    try {
      const res = await fetch(API, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, password: newPassword }),
      });
      if (!res.ok) throw new Error(await readError(res));
      setNotice(`Password updated for ${label}. Share it with them securely.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reset password.');
    }
  };

  const inputClass =
    'w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-slate-900">User accounts</h3>
            <p className="text-xs text-slate-500">Only administrators can create accounts for this app</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50">
            <h4 className="text-sm font-bold text-slate-800">Create a new account</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Full name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${inputClass}`} />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Username</span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}"
                  title="3–32 characters: letters, numbers, dots, dashes or underscores"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="e.g. jsmith"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600">Password (min. 8 characters)</span>
                <input
                  type="text"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} />
              Make this user an administrator
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {submitting ? 'Creating…' : 'Create account'}
            </button>
          </form>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-bold text-slate-800">Existing accounts ({users.length})</h4>
              <button onClick={loadUsers} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer" title="Refresh">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
              {!loading && users.length === 0 && <li className="p-3 text-sm text-slate-500">No accounts yet.</li>}
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate flex items-center gap-1.5">
                      {u.name || u.username || u.email}
                      {u.roles.includes('admin') && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                          <Shield className="w-3 h-3" /> Admin
                        </span>
                      )}
                    </p>
                    {u.name && <p className="text-xs text-slate-500 truncate">{u.username || u.email}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleResetPassword(u)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                      title="Reset password"
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>
                    {u.id !== currentUserId && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                      title="Delete account"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

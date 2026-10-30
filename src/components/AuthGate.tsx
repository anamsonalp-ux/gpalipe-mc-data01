import React, { useEffect, useState } from 'react';
import { Database, Lock, User as UserIcon, Mail, AlertCircle, CheckCircle, LogIn, KeyRound } from 'lucide-react';
import {
  AuthError,
  MissingIdentityError,
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  onAuthChange,
  requestPasswordRecovery,
  updateUser,
  type User,
} from '@netlify/identity';
import { toLoginEmail } from '../lib/username';

type Mode = 'login' | 'forgot' | 'reset' | 'invite';

function describeError(error: unknown): string {
  if (error instanceof MissingIdentityError) {
    return 'Login is not available yet. Identity has not been enabled for this site.';
  }
  if (error instanceof AuthError) {
    switch (error.status) {
      case 401:
        return 'Invalid username or password.';
      case 403:
        return 'Self sign-up is disabled. Ask an administrator to create your account.';
      case 422:
        return 'Please check your details (passwords need at least 8 characters).';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

interface AuthGateProps {
  children: (user: User) => React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('login');
  const [inviteToken, setInviteToken] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await handleAuthCallback();
        if (result?.type === 'recovery') {
          setMode('reset');
          setNotice('Choose a new password for your account.');
        } else if (result?.type === 'invite') {
          setInviteToken(result.token ?? null);
          setMode('invite');
          setNotice('You have been invited. Set a password to activate your account.');
        } else if (result?.type === 'confirmation') {
          setNotice('Email confirmed. Welcome!');
        }
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      }

      const current = await getUser();
      if (!cancelled) {
        // During recovery the user is signed in but must set a new password first
        setUser(current);
        setChecking(false);
      }
    })();

    const unsubscribe = onAuthChange((_event, nextUser) => setUser(nextUser));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setNotice('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        setUser(await login(toLoginEmail(email), password));
      } else if (mode === 'forgot') {
        await requestPasswordRecovery(email.trim());
        setNotice('If that email has an account, a password reset link is on its way.');
      } else if (mode === 'reset') {
        const updated = await updateUser({ password });
        setMode('login');
        setPassword('');
        setUser(updated);
      } else if (mode === 'invite' && inviteToken) {
        setUser(await acceptInvite(inviteToken, password));
        setMode('login');
      }
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user && mode !== 'reset' && mode !== 'invite') {
    return <>{children(user)}</>;
  }

  const titles: Record<Mode, { title: string; subtitle: string; button: string }> = {
    login: { title: 'Sign in', subtitle: 'Access the voter database', button: 'Sign in' },
    forgot: { title: 'Reset password', subtitle: 'For accounts that use an email address', button: 'Send reset link' },
    reset: { title: 'Set new password', subtitle: 'Enter a new password for your account', button: 'Save password' },
    invite: { title: 'Accept invitation', subtitle: 'Set a password to finish creating your account', button: 'Activate account' },
  };
  const copy = titles[mode];
  const needsEmail = mode === 'login' || mode === 'forgot';
  const needsPassword = mode !== 'forgot';

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200/90 overflow-hidden">
        <div className="bg-[#0f172a] text-white px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <Database className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Advanced Voter Database</h1>
            <p className="text-slate-400 text-xs">Gibson Palipe · Mendi Central Open</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{copy.title}</h2>
            <p className="text-sm text-slate-500">{copy.subtitle}</p>
          </div>

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

          {mode === 'forgot' && (
            <p className="text-xs text-slate-500">
              Signed in with a username? Ask the administrator to reset your password.
            </p>
          )}

          {needsEmail && (
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">{mode === 'login' ? 'Username' : 'Email'}</span>
              <div className="mt-1 relative">
                {mode === 'login' ? (
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                ) : (
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                )}
                <input
                  type={mode === 'login' ? 'text' : 'email'}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete={mode === 'login' ? 'username' : 'email'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </label>
          )}

          {needsPassword && (
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                {mode === 'login' ? 'Password' : 'New password'}
              </span>
              <div className="mt-1 relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={mode === 'login' ? undefined : 8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </label>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            {mode === 'login' ? <LogIn className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
            {submitting ? 'Please wait…' : copy.button}
          </button>

          <div className="flex flex-col items-center gap-1.5 text-sm pt-1">
            {mode === 'login' && (
              <>
                <button type="button" onClick={() => switchMode('forgot')} className="text-emerald-700 hover:underline cursor-pointer">
                  Forgot your password?
                </button>
                <span className="text-slate-500 text-xs text-center">
                  Accounts are created by the administrator.
                </span>
              </>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => switchMode('login')} className="text-emerald-700 hover:underline cursor-pointer">
                Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

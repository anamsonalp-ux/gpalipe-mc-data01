import React, { useEffect, useState } from 'react';
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
      <div id="login">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  if (user && mode !== 'reset' && mode !== 'invite') {
    return <>{children(user)}</>;
  }

  const titles: Record<Mode, { title: string; subtitle: string; button: string }> = {
    login: { title: 'Advanced Voter Database', subtitle: 'Gibson Palipe · Mendi Central Open. Sign in to view and update voter records.', button: 'Sign in' },
    forgot: { title: 'Reset password', subtitle: 'For accounts that use an email address.', button: 'Send reset link' },
    reset: { title: 'Set new password', subtitle: 'Enter a new password for your account.', button: 'Save password' },
    invite: { title: 'Accept invitation', subtitle: 'Set a password to finish creating your account.', button: 'Activate account' },
  };
  const copy = titles[mode];
  const needsEmail = mode === 'login' || mode === 'forgot';
  const needsPassword = mode !== 'forgot';

  return (
    <div id="login">
      <form className="card" onSubmit={handleSubmit}>
        <h1>{copy.title}</h1>
        <p>{copy.subtitle}</p>

        {error && <div className="msg err" role="alert">{error}</div>}
        {notice && <div className="msg ok" role="status">{notice}</div>}

        {mode === 'forgot' && (
          <p>Signed in with a username? Ask the administrator to reset your password.</p>
        )}

        {needsEmail && (
          <>
            <label htmlFor="u">{mode === 'login' ? 'Username' : 'Email'}</label>
            <input
              id="u"
              type={mode === 'login' ? 'text' : 'email'}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete={mode === 'login' ? 'username' : 'email'}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </>
        )}

        {needsPassword && (
          <>
            <label htmlFor="p">{mode === 'login' ? 'Password' : 'New password'}</label>
            <input
              id="p"
              type="password"
              required
              minLength={mode === 'login' ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </>
        )}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Please wait…' : copy.button}
        </button>

        <div className="alt">
          {mode === 'login' && (
            <>
              <button type="button" className="linklike" onClick={() => switchMode('forgot')}>
                Forgot your password?
              </button>
              <span>Accounts are created by the administrator.</span>
            </>
          )}
          {mode === 'forgot' && (
            <button type="button" className="linklike" onClick={() => switchMode('login')}>
              Back to sign in
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

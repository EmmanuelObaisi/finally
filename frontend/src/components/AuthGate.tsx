'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';

export const AuthGate = ({ children }: { children: ReactNode }) => {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const expired = () => { setAuthenticated(false); setPassword(''); };
    window.addEventListener('finally-session-expired', expired);
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to check your session. Refresh to retry.');
        const session = await response.json();
        setAuthenticated(session.authenticated);
        if (!session.configured) setError('Login needs to be configured by the app owner.');
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
    return () => window.removeEventListener('finally-session-expired', expired);
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || 'Sign-in failed.');
      setPassword(''); setAuthenticated(true);
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center text-terminal-dim">Checking session…</main>;
  if (authenticated) return <>{children}</>;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-md border border-terminal-border bg-terminal-panel p-6 shadow-glow">
        <div><h1 className="text-xl font-semibold text-terminal-blue">FinAlly</h1><p className="mt-2 text-sm text-terminal-dim">Sign in to your trading workstation.</p></div>
        <label className="block text-sm text-terminal-text">Username<input required autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} className="mt-2 w-full rounded border border-terminal-border bg-terminal-bg p-2" /></label>
        <label className="block text-sm text-terminal-text">Password<input required type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded border border-terminal-border bg-terminal-bg p-2" /></label>
        {error && <p role="alert" className="text-sm text-terminal-negative">{error}</p>}
        <button disabled={busy} type="submit" className="w-full rounded bg-terminal-violet p-2 font-semibold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
};

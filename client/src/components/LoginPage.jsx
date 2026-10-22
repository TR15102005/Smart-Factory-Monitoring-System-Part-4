import { useState } from 'react';
import { api } from '../api.js';

const DEFAULT_CREDS = { username: 'admin', password: 'admin123' };

export default function LoginPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ ...DEFAULT_CREDS, fullName: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = key => e => setForm({ ...form, [key]: e.target.value });

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const result = mode === 'login'
        ? await api.login(form.username, form.password)
        : await api.register(form.username, form.password, form.fullName);
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">SF</div>
        <h1>Smart Factory Monitoring</h1>
        <p className="subtitle">
          {mode === 'login' ? 'Sign in to the operations dashboard' : 'Create an operator account'}
        </p>

        {mode === 'register' && (
          <label className="field">
            <span>Full name</span>
            <input value={form.fullName} onChange={set('fullName')} placeholder="Jane Doe" />
          </label>
        )}
        <label className="field">
          <span>User ID</span>
          <input value={form.username} onChange={set('username')} autoComplete="username" required minLength={3} />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={6} />
        </label>
        {mode === 'register' && (
          <label className="field">
            <span>Confirm password</span>
            <input type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required />
          </label>
        )}

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
        </button>

        <div className="login-divider"><span>or</span></div>

        <button
          className="btn btn-block"
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        >
          {mode === 'login' ? 'Create New User' : 'Back to Log In'}
        </button>

        <div className="login-hint">
          Default admin credentials — user ID <code>admin</code>, password <code>admin123</code>
          <button
            type="button"
            className="link-btn"
            onClick={() => { setMode('login'); setForm({ ...form, ...DEFAULT_CREDS }); setError(''); }}
          >
            fill
          </button>
          <br />
          Demo safety officer — <code>safety</code> / <code>safety123</code>
        </div>
      </form>
    </div>
  );
}

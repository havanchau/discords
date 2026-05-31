import { FormEvent } from 'react';

interface AuthScreenProps {
  error: string | null;
  mode: 'login' | 'register';
  setMode: (mode: 'login' | 'register') => void;
  submitAuth: (event: FormEvent<HTMLFormElement>) => void;
  submitVerification: (event: FormEvent<HTMLFormElement>) => void;
  verificationHint: string | null;
  verificationToken: string;
  setVerificationToken: (value: string) => void;
}

export function AuthScreen({
  error,
  mode,
  setMode,
  submitAuth,
  submitVerification,
  verificationHint,
  verificationToken,
  setVerificationToken
}: AuthScreenProps) {
  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">D</div>
          <h1>Welcome back!</h1>
          <p>We're so excited to see you again!</p>
        </div>

        <div className="segmented" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Register
          </button>
        </div>

        <form onSubmit={submitAuth} className="stack">
          <label>
            Email
            <input name="email" type="email" required placeholder="demo@example.com" />
          </label>
          {mode === 'register' ? (
            <>
              <label>
                Username
                <input name="username" required minLength={3} placeholder="demo" />
              </label>
              <label>
                Display name
                <input name="displayName" placeholder="Demo User" />
              </label>
            </>
          ) : null}
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="Demo@123456"
              pattern={mode === 'register' ? '(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{8,}' : undefined}
              title={
                mode === 'register'
                  ? 'Use at least 8 characters with uppercase, lowercase, number, and special character.'
                  : undefined
              }
            />
          </label>
          {mode === 'register' ? (
            <p className="form-hint">Use uppercase, lowercase, number, and special character.</p>
          ) : null}
          {verificationHint ? <p className="success-note">{verificationHint}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <button className="primary" type="submit">
            {mode === 'login' ? 'Log In' : 'Continue'}
          </button>
        </form>
        <form onSubmit={submitVerification} className="verify-box">
          <label>
            Verification token
            <input
              value={verificationToken}
              onChange={(event) => setVerificationToken(event.target.value)}
              placeholder="Paste token from email"
            />
          </label>
          <button className="primary" type="submit" disabled={!verificationToken.trim()}>
            Verify email
          </button>
        </form>
      </section>
    </main>
  );
}

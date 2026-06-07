import { BadgeCheck, Lock, Mail, User, UserRound } from 'lucide-react';
import { FormEvent } from 'react';
import { Button, TextField } from './ui';

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
  const isLogin = mode === 'login';
  const showVerification = Boolean(verificationHint || verificationToken.trim());

  return (
    <main className="auth-screen">
      <section className="auth-illustration" aria-hidden="true">
        <div className="auth-logo">
          <span className="auth-logo-mark">D</span>
          <span>
            <strong>Discords</strong>
            <small>REALTIME</small>
          </span>
        </div>
        <div className="space-scene">
          <span className="planet planet-large" />
          <span className="planet planet-small" />
          <span className="planet planet-orbit" />
          <span className="meteor meteor-one" />
          <span className="meteor meteor-two" />
          <span className="star star-one" />
          <span className="star star-two" />
          <span className="star star-three" />
        </div>
        <div className="auth-adventure-copy">
          <strong>{isLogin ? 'SIGN IN TO YOUR' : 'START YOUR'}</strong>
          <span>{isLogin ? 'ADVENTURE!' : 'SERVER!'}</span>
        </div>
      </section>

      <section className="auth-panel">
        <div className="brand-lockup">
          <div className="brand-mark">D</div>
          <h1>{isLogin ? 'Sign in' : 'Sign up'}</h1>
          <p>
            {isLogin
              ? 'Sign in with your email address'
              : 'Create your account and jump into the server.'}
          </p>
        </div>

        <div className="segmented" aria-label="Authentication mode">
          <Button variant="ghost" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
            Login
          </Button>
          <Button variant="ghost" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
            Register
          </Button>
        </div>

        <form onSubmit={submitAuth} className="stack">
          <TextField
            fieldClassName="auth-field"
            shellClassName="auth-input-shell"
            label="Email"
            name="email"
            type="email"
            required
            placeholder="demo@example.com"
            leadingIcon={<Mail size={20} aria-hidden="true" />}
          />
          {mode === 'register' ? (
            <>
              <TextField
                fieldClassName="auth-field"
                shellClassName="auth-input-shell"
                label="Username"
                name="username"
                required
                minLength={3}
                placeholder="demo"
                leadingIcon={<User size={20} aria-hidden="true" />}
              />
              <TextField
                fieldClassName="auth-field"
                shellClassName="auth-input-shell"
                label="Display name"
                name="displayName"
                placeholder="Demo User"
                leadingIcon={<UserRound size={20} aria-hidden="true" />}
              />
            </>
          ) : null}
          <TextField
            fieldClassName="auth-field"
            shellClassName="auth-input-shell"
            label="Password"
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
            leadingIcon={<Lock size={20} aria-hidden="true" />}
          />
          {mode === 'register' ? (
            <p className="form-hint">Use uppercase, lowercase, number, and special character.</p>
          ) : null}
          {verificationHint ? <p className="success-note">{verificationHint}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <Button className="auth-submit" type="submit">
            {isLogin ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="auth-divider">
          <span>Or continue with</span>
        </div>
        <div className="social-row">
          <Button variant="secondary" disabled title="Google login is not configured">
            <span className="google-mark">G</span>
            Google
          </Button>
          <Button variant="secondary" disabled title="Facebook login is not configured">
            <span className="facebook-mark">f</span>
            Facebook
          </Button>
        </div>

        {showVerification ? (
          <form onSubmit={submitVerification} className="verify-box">
            <TextField
              fieldClassName="auth-field"
              shellClassName="auth-input-shell"
              label="Verification token"
              value={verificationToken}
              onChange={(event) => setVerificationToken(event.target.value)}
              placeholder="Paste token from email"
              leadingIcon={<BadgeCheck size={20} aria-hidden="true" />}
            />
            <Button className="auth-submit" type="submit" disabled={!verificationToken.trim()}>
              Verify email
            </Button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

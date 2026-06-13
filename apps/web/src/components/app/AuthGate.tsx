import type { FormEvent, ReactNode } from 'react';
import { AuthScreen } from '../AuthScreen';
import { AuthProvider, ThemeProvider } from '../../contexts/appContexts';
import type { AuthState } from '../../api';
import type { UiTheme } from '../settings/types';

interface AuthGateProps {
  auth: AuthState | null;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  children: ReactNode;
  authScreen: {
    error: string | null;
    mode: 'login' | 'register';
    setMode: (mode: 'login' | 'register') => void;
    submitAuth: (event: FormEvent<HTMLFormElement>) => void;
    submitVerification: (event: FormEvent<HTMLFormElement>) => void;
    verificationHint: string | null;
    verificationToken: string;
    setVerificationToken: (value: string) => void;
  };
}

export function AuthGate({ auth, uiTheme, setUiTheme, children, authScreen }: AuthGateProps) {
  if (!auth) {
    return (
      <AuthProvider auth={auth}>
        <ThemeProvider uiTheme={uiTheme} setUiTheme={setUiTheme}>
          <AuthScreen {...authScreen} />
        </ThemeProvider>
      </AuthProvider>
    );
  }

  return <>{children}</>;
}

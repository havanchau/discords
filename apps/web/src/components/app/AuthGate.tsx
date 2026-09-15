import type { ReactNode } from 'react';
import { AuthScreen, type AuthScreenProps } from '../AuthScreen';
import { AuthProvider, ThemeProvider } from '../../contexts/appContexts';
import type { AuthState } from '../../api';
import type { UiTheme } from '../settings/types';

interface AuthGateProps {
  auth: AuthState | null;
  uiTheme: UiTheme;
  setUiTheme: (theme: UiTheme) => void;
  children: ReactNode;
  authScreen: AuthScreenProps;
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

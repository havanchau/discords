import type { ReactNode } from 'react';
import { AuthScreen, type AuthScreenProps } from '@/components/AuthScreen';
import { AuthProvider, ThemeProvider } from '@/contexts/appContexts';
import type { AuthState } from '@/api';
import type { UiTheme } from '@/components/settings/types';

interface AuthGateProps {
  auth: AuthState | null;
  uiTheme: UiTheme;
  resolvedTheme: 'light' | 'dark';
  setUiTheme: (theme: UiTheme) => void;
  children: ReactNode;
  authScreen: AuthScreenProps;
}

export function AuthGate({
  auth,
  uiTheme,
  resolvedTheme,
  setUiTheme,
  children,
  authScreen,
}: AuthGateProps) {
  if (!auth) {
    return (
      <AuthProvider auth={auth}>
        <ThemeProvider uiTheme={uiTheme} resolvedTheme={resolvedTheme} setUiTheme={setUiTheme}>
          <AuthScreen {...authScreen} />
        </ThemeProvider>
      </AuthProvider>
    );
  }

  return <>{children}</>;
}

import { createContext, PropsWithChildren, useContext } from 'react';
import { Socket } from 'socket.io-client';
import { AuthState } from '@/api';

export type UiTheme = 'light' | 'dark' | 'system';

interface AuthContextValue {
  auth: AuthState | null;
}

interface SocketContextValue {
  socket: Socket | null;
}

interface ThemeContextValue {
  uiTheme: UiTheme;
  /* What is actually on screen: `uiTheme` with `system` already resolved against the OS setting. */
  resolvedTheme: 'light' | 'dark';
  setUiTheme: (theme: UiTheme) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SocketContext = createContext<SocketContextValue | null>(null);
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AuthProvider({ auth, children }: PropsWithChildren<AuthContextValue>) {
  return <AuthContext.Provider value={{ auth }}>{children}</AuthContext.Provider>;
}

export function SocketProvider({ socket, children }: PropsWithChildren<SocketContextValue>) {
  return <SocketContext.Provider value={{ socket }}>{children}</SocketContext.Provider>;
}

export function ThemeProvider({
  uiTheme,
  resolvedTheme,
  setUiTheme,
  children,
}: PropsWithChildren<ThemeContextValue>) {
  return (
    <ThemeContext.Provider value={{ uiTheme, resolvedTheme, setUiTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used inside AuthProvider');
  return context;
}

export function useSocketContext() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocketContext must be used inside SocketProvider');
  return context;
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useThemeContext must be used inside ThemeProvider');
  return context;
}

import { AppShell } from './AppShell';
import { LocaleProvider } from './i18n/LocaleProvider';

export function App() {
  return (
    <LocaleProvider>
      <AppShell />
    </LocaleProvider>
  );
}

import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AppShell } from './AppShell';
import { LocaleProvider } from './i18n/LocaleProvider';
import { createQueryClient } from './query/queryClient';

export function App() {
  // Created once per app instance: a client rebuilt on render would throw the cache away.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AppShell />
      </LocaleProvider>
    </QueryClientProvider>
  );
}

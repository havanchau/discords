import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api';

/** A 4xx is the server's answer, not a hiccup; only transport and 5xx failures are worth retrying. */
function shouldRetry(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Most lists here are also kept live by socket events, so refetching on focus is noise.
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: shouldRetry,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

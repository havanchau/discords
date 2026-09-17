import { RE2JS, RE2JSException } from 're2js';

/** A user-supplied pattern compiled by RE2, so matching is linear in the input and cannot hang. */
export interface SafeRegex {
  test(input: string): boolean;
}

/**
 * Compiles an AutoMod pattern with `re2js`. Returns null for a pattern RE2 cannot run in linear time
 * (backreferences, lookaround) or cannot parse. Native `RegExp` is never used for these patterns: its
 * backtracking runs synchronously on the event loop and cannot be interrupted once it starts.
 */
export function compileSafeRegex(pattern: string): SafeRegex | null {
  let compiled: RE2JS;
  try {
    compiled = RE2JS.compile(pattern);
  } catch (error) {
    // Every syntax refusal is an RE2JSException subclass; anything else is a real fault.
    if (error instanceof RE2JSException) return null;
    throw error;
  }
  return { test: (input) => compiled.test(input) };
}

/**
 * The client's view of a server type after JSON serialization: a `Date` has become an ISO string.
 *
 * The contract types are declared the way the server holds them, so a service can be annotated with
 * one directly and the compiler checks it. The web imports the `Json<...>` form of the same type, so
 * both ends are generated from a single declaration and cannot drift.
 */
export type Json<T> = T extends Date
  ? string
  : T extends (infer Item)[]
    ? Json<Item>[]
    : T extends object
      ? { [Key in keyof T]: Json<T[Key]> }
      : T;

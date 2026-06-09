# UI Event Ownership Map

Phase 0B extraction keeps event ownership narrow so realtime state does not move into broad React contexts.

| Event or side effect                                                                                       | Owning hook                                       | State touched                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| `auth/refresh` configuration, login, register, email verification, logout cleanup                          | `useAuthSession`                                  | auth state and auth screen state                                 |
| `message:created`, `reaction:updated`, channel message fetch/search/pagination, local E2EE decrypt/encrypt | `useMessages`                                     | channel messages, typing users, pinned messages, encryption keys |
| `typing:start`, `typing:stop` outgoing composer events                                                     | `useMessages`                                     | typing timeout, socket emit only                                 |
| `unread:get`, `unread:updated`, `unread:cleared`, `presence:update`, `voice:active`, `voice:ended`         | `useRealtimeSocket`                               | socket reference, channel badges, members, active calls          |
| `channel:join`, `unread:clear`                                                                             | `useMessages`                                     | active call summary for joined channel, channel badges           |
| Server list, server open/create/join/invite, channel create/update, role/member-role updates               | `useServers`                                      | servers, active server, active channel, invite, role/admin state |
| Friend list, DM list, open/start/send DM                                                                   | `useDirectMessages`                               | friends summary, conversations, active conversation, DM messages |
| Theme persistence                                                                                          | `useTheme`                                        | theme state and body data attribute                              |
| Low-frequency global reads                                                                                 | `AuthProvider`, `SocketProvider`, `ThemeProvider` | auth value, socket reference, theme value                        |

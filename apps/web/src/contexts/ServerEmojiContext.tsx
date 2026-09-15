import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { assetUrl, type ServerEmoji } from '../api';

interface ServerEmojiContextValue {
  emojis: ServerEmoji[];
  resolveEmoji: (name: string) => string | undefined;
}

const EMPTY_EMOJIS: ServerEmoji[] = [];
const noCustomEmoji = () => undefined;

// Outside a server (Home, DMs) there are no custom emoji; shortcodes stay text.
const ServerEmojiContext = createContext<ServerEmojiContextValue>({
  emojis: EMPTY_EMOJIS,
  resolveEmoji: noCustomEmoji,
});

export function ServerEmojiProvider({
  emojis,
  children,
}: PropsWithChildren<{ emojis: ServerEmoji[] }>) {
  const value = useMemo(() => {
    const urlByName = new Map(emojis.map((emoji) => [emoji.name, assetUrl(emoji.url)]));
    return { emojis, resolveEmoji: (name: string) => urlByName.get(name) };
  }, [emojis]);

  return <ServerEmojiContext.Provider value={value}>{children}</ServerEmojiContext.Provider>;
}

export function useServerEmojiContext() {
  return useContext(ServerEmojiContext);
}

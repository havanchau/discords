import { useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { Channel } from '../api';

interface UseTypingIndicatorOptions {
  channel: Channel | null;
  socket: Socket | null;
}

export function useTypingIndicator({ channel, socket }: UseTypingIndicatorOptions) {
  const typingTimeoutRef = useRef<number | null>(null);

  function handleComposerInput() {
    if (!channel || !socket?.connected) return;
    socket.emit('typing:start', { channelId: channel.id });
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      socket.emit('typing:stop', { channelId: channel.id });
    }, 1400);
  }

  return { handleComposerInput };
}

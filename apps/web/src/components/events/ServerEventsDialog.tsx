import { useState } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import type { ServerDetail } from '../../api';
import type { ServerEventsState } from '../../hooks/useServerEvents';
import { Button, DialogContent, DialogRoot } from '../ui';
import { EventCard } from './EventCard';
import { EventForm } from './EventForm';
import styles from './ServerEvents.module.css';

interface ServerEventsDialogProps {
  open: boolean;
  server: ServerDetail;
  canManage: boolean;
  serverEvents: ServerEventsState;
  onOpenChange: (open: boolean) => void;
}

export function ServerEventsDialog({
  open,
  server,
  canManage,
  serverEvents,
  onOpenChange,
}: ServerEventsDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const { events, isLoading, error, pendingEventId } = serverEvents;
  const channelsById = new Map(server.channels.map((channel) => [channel.id, channel]));

  return (
    <DialogRoot
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setIsCreating(false);
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent title="Events" description={`Upcoming events in ${server.name}`}>
        <div className={styles.dialogBody}>
          {canManage && !isCreating ? (
            <Button type="button" variant="secondary" onClick={() => setIsCreating(true)}>
              <CalendarPlus size={16} aria-hidden="true" />
              Create event
            </Button>
          ) : null}
          {isCreating ? (
            <EventForm
              channels={server.channels}
              isSubmitting={pendingEventId === 'new'}
              onSubmit={serverEvents.createEvent}
              onCancel={() => setIsCreating(false)}
            />
          ) : null}
          {error ? (
            <p className="empty-note" role="alert">
              {error}
            </p>
          ) : null}
          {isLoading && !events.length ? (
            <p className="empty-note" role="status">
              <Loader2 className="spin" size={14} aria-hidden="true" /> Loading events
            </p>
          ) : events.length ? (
            <div className={styles.list}>
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  channel={event.channelId ? channelsById.get(event.channelId) : undefined}
                  canManage={canManage}
                  isPending={pendingEventId === event.id}
                  onToggleInterest={serverEvents.setInterest}
                  onCancel={serverEvents.cancelEvent}
                />
              ))}
            </div>
          ) : (
            <p className="empty-note">No upcoming events.</p>
          )}
        </div>
      </DialogContent>
    </DialogRoot>
  );
}

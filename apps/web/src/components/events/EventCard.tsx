import { CalendarClock, Hash, MapPin, Star, Volume2 } from 'lucide-react';
import type { Channel, ServerEventView } from '../../api';
import { Badge, Button } from '../ui';
import styles from './ServerEvents.module.css';

interface EventCardProps {
  event: ServerEventView;
  channel: Channel | undefined;
  canManage: boolean;
  isPending: boolean;
  onToggleInterest: (eventId: string, interested: boolean) => Promise<void>;
  onCancel: (eventId: string) => Promise<void>;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function EventCard({
  event,
  channel,
  canManage,
  isPending,
  onToggleInterest,
  onCancel,
}: EventCardProps) {
  return (
    <article className={styles.card} data-testid="server-event">
      <div className={styles.cardMeta}>
        <CalendarClock size={14} aria-hidden="true" />
        <span>
          {dateFormatter.format(new Date(event.startAt))}
          {event.endAt ? ` – ${dateFormatter.format(new Date(event.endAt))}` : ''}
        </span>
        {event.status === 'ACTIVE' ? <Badge variant="success">Happening now</Badge> : null}
      </div>
      <strong className={styles.cardTitle}>{event.name}</strong>
      {channel ? (
        <span className={styles.cardDetail}>
          {channel.type === 'VOICE' ? (
            <Volume2 size={14} aria-hidden="true" />
          ) : (
            <Hash size={14} aria-hidden="true" />
          )}
          {channel.name}
        </span>
      ) : null}
      {event.location ? (
        <span className={styles.cardDetail}>
          <MapPin size={14} aria-hidden="true" />
          {event.location}
        </span>
      ) : null}
      {event.description ? <p className={styles.cardDescription}>{event.description}</p> : null}
      <div className={styles.cardActions}>
        <span className={styles.cardDetail}>
          {event.interestedCount} interested · by {event.creator.displayName}
        </span>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => void onCancel(event.id)}
          >
            Cancel event
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={event.interested ? 'primary' : 'secondary'}
          aria-pressed={event.interested}
          disabled={isPending}
          onClick={() => void onToggleInterest(event.id, !event.interested)}
        >
          <Star size={14} aria-hidden="true" />
          {event.interested ? 'Interested' : 'Mark interested'}
        </Button>
      </div>
    </article>
  );
}

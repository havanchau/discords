import { CalendarClock, Hash, MapPin, Star, Volume2 } from 'lucide-react';
import type { Channel, ServerEventView } from '../../api';
import { useTranslation } from '../../i18n/LocaleProvider';
import { useDateFormat } from '../../i18n/useDateFormat';
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

export function EventCard({
  event,
  channel,
  canManage,
  isPending,
  onToggleInterest,
  onCancel,
}: EventCardProps) {
  const t = useTranslation();
  const dates = useDateFormat();

  return (
    <article className={styles.card} data-testid="server-event">
      <div className={styles.cardMeta}>
        <CalendarClock size={14} aria-hidden="true" />
        <span>
          {dates.absolute(event.startAt)}
          {event.endAt ? ` – ${dates.absolute(event.endAt)}` : ''}
        </span>
        {event.status === 'ACTIVE' ? (
          <Badge variant="success">{t('events.happeningNow')}</Badge>
        ) : null}
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
          {t('events.interestedBy', {
            count: event.interestedCount,
            author: event.creator.displayName,
          })}
        </span>
        {canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => void onCancel(event.id)}
          >
            {t('events.action.cancel')}
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
          {event.interested ? t('events.interested') : t('events.markInterested')}
        </Button>
      </div>
    </article>
  );
}

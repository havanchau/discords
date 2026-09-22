import { Megaphone } from 'lucide-react';
import type { Message } from '@/api';
import { Badge, ContextMenuItem, IconButton, Tooltip } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import type { ChatPanelMessageActions } from './types';

type PublishActions = Pick<ChatPanelMessageActions, 'canPublish' | 'publish'>;

/**
 * Publish is offered once per top-level message of an ANNOUNCEMENT channel. A crossposted copy is
 * never publishable (the API refuses it too), and an encrypted message would crosspost ciphertext.
 */
export function canPublishMessage(message: Message, actions: PublishActions) {
  return (
    actions.canPublish &&
    !message.publishedAt &&
    !message.isCrosspost &&
    !message.threadId &&
    !message.deletedAt &&
    !message.isEncrypted
  );
}

export function PublishActionButton({
  message,
  actions,
}: {
  message: Message;
  actions: PublishActions;
}) {
  const t = useTranslation();
  return (
    <Tooltip content={t('announcement.publish.action')}>
      <IconButton
        label={t('announcement.publish.action')}
        onClick={() => void actions.publish(message.id)}
      >
        <Megaphone size={14} aria-hidden="true" />
      </IconButton>
    </Tooltip>
  );
}

export function PublishMenuItem({
  message,
  actions,
}: {
  message: Message;
  actions: PublishActions;
}) {
  const t = useTranslation();
  return (
    <ContextMenuItem onClick={() => void actions.publish(message.id)}>
      <Megaphone size={14} aria-hidden="true" /> {t('announcement.publish.menu')}
    </ContextMenuItem>
  );
}

/** "Published" on a source message, "Crossposted" on a copy delivered to a follower. */
export function AnnouncementBadges({
  message,
  className,
}: {
  message: Message;
  className: string;
}) {
  const t = useTranslation();
  if (message.isCrosspost) {
    return (
      <Badge variant="neutral" className={className} title={t('announcement.badge.crosspostLabel')}>
        {t('announcement.badge.crosspost')}
      </Badge>
    );
  }
  if (message.publishedAt) {
    return (
      <Badge variant="neutral" className={className} title={t('announcement.badge.publishedLabel')}>
        {t('announcement.badge.published')}
      </Badge>
    );
  }
  return null;
}

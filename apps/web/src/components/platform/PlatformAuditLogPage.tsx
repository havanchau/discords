import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { platformAuditActions, type PlatformAuditAction } from '@discord-clone/shared';
import { Badge, Button, TextField } from '@/components/ui';
import { usePlatformAuditLogs } from '@/hooks/usePlatformAuditLogs';
import { useTranslation } from '@/i18n/LocaleProvider';
import { useDateFormat } from '@/i18n/useDateFormat';
import { cn } from '@/utils/cn';
import styles from './Platform.module.css';

/**
 * Admin-only browser for `PlatformAuditLog` — rows that outlive the server/report/account they
 * describe (docs/features/platform-audit-log.md). Rendered as a sibling section inside
 * `PlatformReportsPage`'s dialog, next to the report queue.
 */
export function PlatformAuditLogPage() {
  const t = useTranslation();
  const dates = useDateFormat();
  const [action, setAction] = useState<PlatformAuditAction | ''>('');
  const [targetIdDraft, setTargetIdDraft] = useState('');
  const [targetId, setTargetId] = useState('');
  const [actorIdDraft, setActorIdDraft] = useState('');
  const [actorId, setActorId] = useState('');
  const logs = usePlatformAuditLogs(action, targetId, actorId);

  return (
    <div className={styles.browser}>
      <div className={styles.tabs} role="group" aria-label={t('platform.auditLog.actionFilter')}>
        <button
          type="button"
          className={cn(styles.tab, action === '' && styles.selected)}
          aria-pressed={action === ''}
          onClick={() => setAction('')}
        >
          {t('platform.auditLog.action.ALL')}
        </button>
        {platformAuditActions.map((value) => (
          <button
            key={value}
            type="button"
            className={cn(styles.tab, action === value && styles.selected)}
            aria-pressed={action === value}
            onClick={() => setAction(value)}
          >
            {t(`platform.auditLog.action.${value}`)}
          </button>
        ))}
      </div>
      <form
        className={styles.filterRow}
        onSubmit={(event) => {
          event.preventDefault();
          setTargetId(targetIdDraft.trim());
          setActorId(actorIdDraft.trim());
        }}
      >
        <TextField
          aria-label={t('platform.auditLog.filter.targetIdLabel')}
          placeholder={t('platform.auditLog.filter.targetIdPlaceholder')}
          value={targetIdDraft}
          onChange={(event) => setTargetIdDraft(event.target.value)}
        />
        <TextField
          aria-label={t('platform.auditLog.filter.actorIdLabel')}
          placeholder={t('platform.auditLog.filter.actorIdPlaceholder')}
          value={actorIdDraft}
          onChange={(event) => setActorIdDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('platform.filter.apply')}
        </Button>
      </form>
      <div className={styles.results}>
        {logs.isLoading ? (
          <p className="empty-note" role="status">
            <Loader2 className="spin" size={14} aria-hidden="true" />{' '}
            {t('platform.auditLog.loading')}
          </p>
        ) : logs.error ? (
          <p className="empty-note" role="alert">
            {logs.error instanceof Error ? logs.error.message : t('platform.auditLog.error.load')}
          </p>
        ) : logs.logs.length ? (
          logs.logs.map((log) => (
            <div key={log.id} className={styles.row}>
              <div className={styles.rowBody}>
                <strong>{t(`platform.auditLog.action.${log.action}`)}</strong>
                <small>
                  {t('platform.auditLog.row.summary', {
                    actor: log.actorDisplayName ?? t('platform.auditLog.row.unknownActor'),
                    target: log.targetName ?? log.targetId,
                    date: dates.absolute(log.createdAt),
                  })}
                </small>
              </div>
              <Badge variant="neutral">{t(`platform.auditLog.targetType.${log.targetType}`)}</Badge>
            </div>
          ))
        ) : (
          <p className="empty-note">{t('platform.auditLog.empty')}</p>
        )}
        {logs.hasNextPage ? (
          <Button
            variant="secondary"
            fullWidth
            disabled={logs.isFetchingNextPage}
            onClick={() => void logs.fetchNextPage()}
          >
            {logs.isFetchingNextPage ? (
              <Loader2 className="spin" size={16} aria-hidden="true" />
            ) : null}
            {t('platform.loadMore')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

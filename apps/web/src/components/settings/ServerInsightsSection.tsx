import { useMemo, useState, type ReactNode } from 'react';
import { Hash, Loader2, Megaphone, MessagesSquare } from 'lucide-react';
import { insightsRanges } from '@discord-clone/shared';
import type { InsightsRange, ServerInsights } from '@/api';
import { Button } from '@/components/ui';
import { useServerInsights } from '@/hooks/useServerInsights';
import { useLocale, useTranslation } from '@/i18n/LocaleProvider';
import settingsStyles from '@/components/SettingsModal.module.css';
import styles from './ServerInsightsSection.module.css';

interface ServerInsightsSectionProps {
  serverId: string;
}

type SummaryKey = 'membersJoined' | 'membersLeft' | 'membersKicked' | 'membersBanned';
const memberSummaryKeys: SummaryKey[] = [
  'membersJoined',
  'membersLeft',
  'membersKicked',
  'membersBanned',
];

/** Read-only activity counts. Rendered only for MANAGE_SERVER holders; the API re-checks. */
export function ServerInsightsSection({ serverId }: ServerInsightsSectionProps) {
  const t = useTranslation();
  const [range, setRange] = useState<InsightsRange>('7d');
  const { insights, isLoading, error } = useServerInsights(serverId, range);

  return (
    <section className={settingsStyles.settingsSection} aria-labelledby="server-insights-title">
      <div className={settingsStyles.settingsSectionHeading}>
        <strong id="server-insights-title">{t('insights.section.title')}</strong>
        <span>{t('insights.section.hint')}</span>
      </div>
      <div className={styles.ranges} role="group" aria-label={t('insights.rangeFilter')}>
        {insightsRanges.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={range === value ? 'secondary' : 'ghost'}
            aria-pressed={range === value}
            onClick={() => setRange(value)}
          >
            {t(`insights.range.${value}`)}
          </Button>
        ))}
      </div>
      {isLoading ? (
        <p className="empty-note" role="status">
          <Loader2 className="spin" size={14} aria-hidden="true" /> {t('insights.loading')}
        </p>
      ) : error || !insights ? (
        <p className="empty-note" role="alert">
          {error instanceof Error ? error.message : t('error.fallback.cannot-load-insights')}
        </p>
      ) : hasActivity(insights) ? (
        <InsightsBody insights={insights} />
      ) : (
        <p className="empty-note">{t(`insights.empty.${insights.range}`)}</p>
      )}
    </section>
  );
}

function hasActivity(insights: ServerInsights) {
  return (
    insights.messagesPerDay.total > 0 ||
    memberSummaryKeys.some((key) => insights[key].total > 0) ||
    insights.topChannels.length > 0
  );
}

function InsightsBody({ insights }: { insights: ServerInsights }) {
  const t = useTranslation();
  const { locale } = useLocale();
  // Series days are UTC calendar days, so they are labelled in UTC too, not shifted to local time.
  const dayFormat = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
    [locale],
  );
  const maxDaily = Math.max(0, ...insights.messagesPerDay.series.map((day) => day.count));
  const maxChannel = Math.max(0, ...insights.topChannels.map((channel) => channel.messageCount));

  return (
    <div className={styles.body}>
      <dl className={styles.summary}>
        {memberSummaryKeys.map((key) => (
          <div key={key} className={styles.stat}>
            <dt>{t(`insights.metric.${key}`)}</dt>
            <dd>{insights[key].total}</dd>
          </div>
        ))}
        <div className={styles.stat}>
          <dt>{t('insights.metric.messages')}</dt>
          <dd>{insights.messagesPerDay.total}</dd>
        </div>
      </dl>

      <div className={styles.group}>
        <strong className={styles.groupTitle}>{t('insights.messagesPerDay.title')}</strong>
        <ol className={styles.bars}>
          {insights.messagesPerDay.series.map((day) => (
            <BarRow
              key={day.date}
              label={dayFormat.format(new Date(`${day.date}T00:00:00Z`))}
              count={day.count}
              max={maxDaily}
            />
          ))}
        </ol>
      </div>

      <div className={styles.group}>
        <strong className={styles.groupTitle}>{t('insights.topChannels.title')}</strong>
        {insights.topChannels.length ? (
          <ol className={styles.bars}>
            {insights.topChannels.map((channel) => (
              <BarRow
                key={channel.channelId}
                label={
                  <>
                    {channel.type === 'FORUM' ? (
                      <MessagesSquare size={14} aria-hidden="true" />
                    ) : channel.type === 'ANNOUNCEMENT' ? (
                      <Megaphone size={14} aria-hidden="true" />
                    ) : (
                      <Hash size={14} aria-hidden="true" />
                    )}
                    <span className={styles.channelName}>{channel.name}</span>
                  </>
                }
                count={channel.messageCount}
                max={maxChannel}
              />
            ))}
          </ol>
        ) : (
          <p className="empty-note">{t('insights.topChannels.empty')}</p>
        )}
      </div>
      <small className={styles.footnote}>{t('insights.utcNote')}</small>
    </div>
  );
}

function BarRow({ label, count, max }: { label: ReactNode; count: number; max: number }) {
  const percent = max > 0 ? (count / max) * 100 : 0;
  return (
    <li className={styles.barRow}>
      <span className={styles.barLabel}>{label}</span>
      <span className={styles.barTrack} aria-hidden="true">
        <span className={styles.barFill} style={{ width: `${percent}%` }} />
      </span>
      <span className={styles.barCount}>{count}</span>
    </li>
  );
}

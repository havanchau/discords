import { useMemo } from 'react';
import type { Locale } from '@discord-clone/shared';
import { useLocale, type Translate } from './LocaleProvider';

export interface DateFormatters {
  /** Clock time only, e.g. 14:05. */
  time: (value: string) => string;
  /** Relative day plus clock time, e.g. "Today at 14:05". */
  dateTime: (value: string) => string;
  /** Day heading in a message list, e.g. "Yesterday". */
  dayDivider: (value: string) => string;
  /** Absolute date and time, for audit rows and expiry stamps. */
  absolute: (value: string | Date) => string;
}

export function buildDateFormatters(locale: Locale, t: Translate): DateFormatters {
  const timeFormat = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const shortDateFormat = new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const longDateFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const absoluteFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const time = (value: string) => timeFormat.format(new Date(value));

  return {
    time,
    dateTime(value) {
      const day = relativeDay(new Date(value));
      if (day === 'today') return t('date.todayAt', { time: time(value) });
      if (day === 'yesterday') return t('date.yesterdayAt', { time: time(value) });
      return `${shortDateFormat.format(new Date(value))} ${time(value)}`;
    },
    dayDivider(value) {
      const day = relativeDay(new Date(value));
      if (day === 'today') return t('date.today');
      if (day === 'yesterday') return t('date.yesterday');
      return longDateFormat.format(new Date(value));
    },
    absolute(value) {
      return absoluteFormat.format(typeof value === 'string' ? new Date(value) : value);
    },
  };
}

export function useDateFormat(): DateFormatters {
  const { locale, t } = useLocale();
  return useMemo(() => buildDateFormatters(locale, t), [locale, t]);
}

function relativeDay(date: Date): 'today' | 'yesterday' | 'other' {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return date.toDateString() === yesterday.toDateString() ? 'yesterday' : 'other';
}

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import styles from './Feedback.module.css';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'danger' | 'neutral' | 'success';
};

export function Badge({ className, variant = 'danger', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        styles.badge,
        variant === 'neutral' && styles.badgeNeutral,
        variant === 'success' && styles.badgeSuccess,
        className
      )}
      {...props}
    />
  );
}

export type SkeletonProps = HTMLAttributes<HTMLSpanElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <span className={cn(styles.skeleton, className)} aria-hidden="true" {...props} />;
}

export type BannerProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'info' | 'success' | 'danger';
  children: ReactNode;
};

export function Banner({ className, variant = 'info', children, ...props }: BannerProps) {
  return (
    <div
      className={cn(
        styles.banner,
        variant === 'info' && styles.bannerInfo,
        variant === 'success' && styles.bannerSuccess,
        variant === 'danger' && styles.bannerDanger,
        className
      )}
      role={variant === 'danger' ? 'alert' : 'status'}
      {...props}
    >
      {children}
    </div>
  );
}

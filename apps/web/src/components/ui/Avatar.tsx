import { cn } from '../../utils/cn';
import styles from './Avatar.module.css';

export type AvatarProps = {
  src?: string | null;
  alt: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

export function Avatar({ src, alt, fallback, size = 'md', className }: AvatarProps) {
  const initials = fallback ?? alt.slice(0, 2);

  return (
    <span className={cn(styles.avatar, styles[size], className)}>
      {src ? <img className={styles.image} src={src} alt={alt} /> : <span className={styles.fallback}>{initials}</span>}
    </span>
  );
}

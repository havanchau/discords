import { assetUrl, type User } from '../../api';
import { initials } from '../../helpers';
import { Avatar } from '../ui';

type UserAvatarProps = {
  user: Pick<User, 'avatarUrl' | 'displayName'>;
};

export function UserAvatar({ user }: UserAvatarProps) {
  return <Avatar size="sm" src={user.avatarUrl ? assetUrl(user.avatarUrl) : undefined} alt={user.displayName} fallback={initials(user.displayName)} />;
}

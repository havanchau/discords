import { DialogContent, DialogRoot } from '@/components/ui';
import { useTranslation } from '@/i18n/LocaleProvider';
import { MemberSidebar, type MemberSidebarProps } from './MemberSidebar';
import styles from './MemberListDrawer.module.css';

interface MemberListDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: MemberSidebarProps;
}

/**
 * Below 1100px `MemberSidebar` hides itself from the shell grid; this right-anchored drawer, opened
 * from the chat header's Members button, is where the list lives on tablets and phones.
 */
export function MemberListDrawer({ open, onOpenChange, members }: MemberListDrawerProps) {
  const t = useTranslation();

  // Both open another surface (a DM, the manage dialog); the drawer closes so it is not left behind.
  const drawerMembers: MemberSidebarProps = {
    ...members,
    onManageMember: (memberId) => {
      onOpenChange(false);
      members.onManageMember(memberId);
    },
    onDirectMessage: (userId) => {
      onOpenChange(false);
      members.onDirectMessage(userId);
    },
  };

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t('members.drawerTitle')}
        className={styles.drawer}
        bodyClassName={styles.drawerBody}
      >
        <MemberSidebar {...drawerMembers} />
      </DialogContent>
    </DialogRoot>
  );
}

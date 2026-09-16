import { ChatPanel, type ChatPanelProps } from '@/components/ChatPanel';
import { HomePanel } from '@/components/HomePanel';
import { IncomingCallDialog } from '@/components/home/IncomingCallDialog';
import { MemberSidebar, type MemberSidebarProps } from '@/components/MemberSidebar';
import { SettingsModal } from '@/components/SettingsModal';
import { WorkspaceSidebar, type WorkspaceSidebarProps } from '@/components/WorkspaceSidebar';
import { TooltipProvider } from '@/components/ui';
import { cn } from '@/utils/cn';
import styles from './AppLayout.module.css';
import { AuthProvider, SocketProvider, ThemeProvider } from '@/contexts/appContexts';
import { ServerEmojiProvider } from '@/contexts/ServerEmojiContext';
import type { AuthState, ServerDetail, ServerEmoji } from '@/api';
import type { SettingsModalProps } from '@/components/settings/types';
import type { HomePanelProps } from '@/components/home/types';
import type { ComponentProps } from 'react';
import type { Socket } from 'socket.io-client';

interface AuthenticatedWorkspaceProps {
  auth: AuthState;
  socket: Socket | null;
  uiTheme: SettingsModalProps['theme']['uiTheme'];
  setUiTheme: SettingsModalProps['actions']['setUiTheme'];
  server: ServerDetail | null;
  workspace: WorkspaceSidebarProps;
  chat: ChatPanelProps;
  members: MemberSidebarProps;
  home: HomePanelProps;
  settings: SettingsModalProps;
  incomingCall: ComponentProps<typeof IncomingCallDialog>;
  serverEmojis: ServerEmoji[];
}

export function AuthenticatedWorkspace({
  auth,
  socket,
  uiTheme,
  setUiTheme,
  server,
  workspace,
  chat,
  members,
  home,
  settings,
  incomingCall,
  serverEmojis,
}: AuthenticatedWorkspaceProps) {
  return (
    <AuthProvider auth={auth}>
      <SocketProvider socket={socket}>
        <ThemeProvider uiTheme={uiTheme} setUiTheme={setUiTheme}>
          <ServerEmojiProvider emojis={serverEmojis}>
            <TooltipProvider>
              <main className={cn(styles.shell, !server && styles.homeShell)}>
                <WorkspaceSidebar {...workspace} />
                {server ? (
                  <>
                    <ChatPanel {...chat} />
                    <MemberSidebar {...members} />
                  </>
                ) : (
                  <HomePanel {...home} />
                )}
                <SettingsModal {...settings} />
                <IncomingCallDialog {...incomingCall} />
              </main>
            </TooltipProvider>
          </ServerEmojiProvider>
        </ThemeProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

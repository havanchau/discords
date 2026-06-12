import { ChatPanel, type ChatPanelProps } from '../ChatPanel';
import { HomePanel } from '../HomePanel';
import { MemberSidebar, type MemberSidebarProps } from '../MemberSidebar';
import { SettingsModal } from '../SettingsModal';
import { WorkspaceSidebar, type WorkspaceSidebarProps } from '../WorkspaceSidebar';
import { TooltipProvider } from '../ui';
import { AuthProvider, SocketProvider, ThemeProvider } from '../../contexts/appContexts';
import type { AuthState, ServerDetail } from '../../api';
import type { SettingsModalProps } from '../settings/types';
import type { HomePanelProps } from '../home/types';
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
}: AuthenticatedWorkspaceProps) {
  return (
    <AuthProvider auth={auth}>
      <SocketProvider socket={socket}>
        <ThemeProvider uiTheme={uiTheme} setUiTheme={setUiTheme}>
          <TooltipProvider>
            <main className="app-shell">
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
            </main>
          </TooltipProvider>
        </ThemeProvider>
      </SocketProvider>
    </AuthProvider>
  );
}

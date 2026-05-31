import { FormEvent } from 'react';
import { MessageSquare, UserPlus } from 'lucide-react';
import {
  assetUrl,
  AuthState,
  DirectConversation,
  DirectMessage,
  FriendRequestEntry,
  FriendsSummary,
} from '../api';
import { accentClass, formatDate, initials } from '../helpers';

interface HomePanelProps {
  auth: AuthState;
  friendsSummary: FriendsSummary | null;
  conversations: DirectConversation[];
  activeConversation: DirectConversation | null;
  directMessages: DirectMessage[];
  pendingAction: string | null;
  requestFriend: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  respondFriendRequest: (
    request: FriendRequestEntry,
    status: 'ACCEPTED' | 'REJECTED' | 'BLOCKED',
  ) => Promise<void>;
  openDirectConversation: (conversation: DirectConversation) => Promise<void>;
  startDirectConversation: (userId: string) => Promise<void>;
  sendDirectMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export function HomePanel({
  auth,
  friendsSummary,
  conversations,
  activeConversation,
  directMessages,
  pendingAction,
  requestFriend,
  respondFriendRequest,
  openDirectConversation,
  startDirectConversation,
  sendDirectMessage,
}: HomePanelProps) {
  const dmPartner = activeConversation?.members[0]?.user;

  return (
    <section className="home-panel">
      <aside className="home-sidebar">
        <header>
          <strong>Direct Messages</strong>
          <span>Friends and private chats</span>
        </header>
        <form className="home-add-friend" onSubmit={requestFriend}>
          <input name="usernameOrEmail" placeholder="Username or email" minLength={3} required />
          <button className="primary compact-primary" disabled={pendingAction === 'friend-request'}>
            <UserPlus size={15} />
            Add
          </button>
        </form>

        <div className="home-section-title">Friends</div>
        <div className="home-list">
          {friendsSummary?.friends.length ? (
            friendsSummary.friends.map((friend) => (
              <button
                key={friend.user.id}
                type="button"
                className="home-person"
                onClick={() => void startDirectConversation(friend.user.id)}
              >
                <span className={`avatar small ${accentClass(friend.user.id)}`}>
                  {friend.user.avatarUrl ? (
                    <img src={assetUrl(friend.user.avatarUrl)} alt={friend.user.displayName} />
                  ) : (
                    initials(friend.user.displayName)
                  )}
                </span>
                <span>
                  <strong>{friend.user.displayName}</strong>
                  <small>{friend.user.status ?? 'OFFLINE'}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="empty-note">No friends yet.</div>
          )}
        </div>

        {friendsSummary?.pendingIncoming.length ? (
          <>
            <div className="home-section-title">Requests</div>
            <div className="home-list">
              {friendsSummary.pendingIncoming.map((request) => (
                <div key={request.id} className="home-request">
                  <span>{request.requester?.displayName ?? 'Friend request'}</span>
                  <div>
                    <button onClick={() => void respondFriendRequest(request, 'ACCEPTED')}>
                      Accept
                    </button>
                    <button onClick={() => void respondFriendRequest(request, 'REJECTED')}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}

        <div className="home-section-title">Recent DMs</div>
        <div className="home-list">
          {conversations.map((conversation) => {
            const partner = conversation.members[0]?.user;
            if (!partner) return null;
            return (
              <button
                key={conversation.id}
                type="button"
                className={`home-person ${activeConversation?.id === conversation.id ? 'selected' : ''}`}
                onClick={() => void openDirectConversation(conversation)}
              >
                <span className={`avatar small ${accentClass(partner.id)}`}>
                  {partner.avatarUrl ? (
                    <img src={assetUrl(partner.avatarUrl)} alt={partner.displayName} />
                  ) : (
                    initials(partner.displayName)
                  )}
                </span>
                <span>
                  <strong>{partner.displayName}</strong>
                  <small>{conversation.messages[0]?.content ?? 'No messages yet'}</small>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="dm-chat">
        {activeConversation && dmPartner ? (
          <>
            <header className="dm-chat-header">
              <span className={`avatar small ${accentClass(dmPartner.id)}`}>
                {dmPartner.avatarUrl ? (
                  <img src={assetUrl(dmPartner.avatarUrl)} alt={dmPartner.displayName} />
                ) : (
                  initials(dmPartner.displayName)
                )}
              </span>
              <div>
                <strong>{dmPartner.displayName}</strong>
                <span>@{dmPartner.username}</span>
              </div>
            </header>
            <div className="dm-message-list">
              {directMessages.length ? (
                directMessages.map((message) => {
                  const mine = message.authorId === auth.user.id;
                  return (
                    <article key={message.id} className={`dm-message ${mine ? 'mine' : ''}`}>
                      <strong>{mine ? auth.user.displayName : dmPartner.displayName}</strong>
                      <p>{message.content}</p>
                      <span>{formatDate(message.createdAt)}</span>
                    </article>
                  );
                })
              ) : (
                <div className="state-panel">
                  <MessageSquare size={24} />
                  Start the conversation with {dmPartner.displayName}.
                </div>
              )}
            </div>
            <form className="dm-composer" onSubmit={sendDirectMessage}>
              <input
                name="content"
                placeholder={`Message @${dmPartner.username}`}
                autoComplete="off"
              />
              <button
                className="primary compact-primary"
                disabled={pendingAction === 'direct-message'}
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="state-panel">
            <MessageSquare size={28} />
            <strong>Your direct messages</strong>
            <span>Add a friend or select a recent DM.</span>
          </div>
        )}
      </main>
    </section>
  );
}

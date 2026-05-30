import React, { useEffect, useMemo, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { Bell, Check, File, Info, LogOut, MessageCircle, Moon, Paperclip, Plus, Reply, Search, Send, Shield, Smile, Sun, Trash2, Users, X } from 'lucide-react';
import { api } from './api.js';
import { createSocket } from './socket.js';

const emptyAuth = { name: '', email: '', password: '' };
const maxAttachmentSize = 6 * 1024 * 1024;

function getInitials(name = 'User') {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatMessageTime(date) {
  return new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

function getMessagePreview(message) {
  if (!message) return '';
  if (message.isDeleted) return 'This message was unsent';
  if (message.text?.trim()) return message.text;
  if (message.attachmentName) return message.attachmentName;
  if (message.attachmentUrl) return 'Attachment';
  return 'Message';
}

function getMessageChatId(message) {
  return (message?.chat?._id || message?.chat || '').toString();
}

function getMessageId(message) {
  return (message?._id || message || '').toString();
}

function getStoredSession() {
  const token = localStorage.getItem('chat_token');
  const user = localStorage.getItem('chat_user');

  if (!token || !user) return null;

  try {
    return { token, user: JSON.parse(user) };
  } catch (_error) {
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_user');
    return null;
  }
}

export default function App() {
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(emptyAuth);
  const [session, setSession] = useState(getStoredSession);
  const [users, setUsers] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [membersToAdd, setMembersToAdd] = useState([]);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('vibe_theme') || 'dark');
  const socketRef = useRef(null);
  const activeChatRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const groupNameRef = useRef(null);
  const messageInputRef = useRef(null);
  const typingTimerRef = useRef(null);

  const currentUserId = session?.user?.id || session?.user?._id;

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (!session) return;
    refreshData();

    const socket = createSocket(session.token);
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      setError('');
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('connect_error', () => {
      setSocketConnected(false);
      setError('Realtime connection is not available. Messages will use backup sending.');
    });

    socket.on('message:new', (message) => {
      addMessageToView(message);
    });

    socket.on('message:deleted', (message) => {
      setMessages((current) => current.map((item) => item._id === message._id ? message : item));
      updateChatLastMessage(message);
    });

    socket.on('typing:update', ({ chatId, userId, name, isTyping }) => {
      if (chatId !== activeChatRef.current?._id || userId === currentUserId) return;
      setTypingUsers((current) => {
        const filtered = current.filter((user) => user.userId !== userId);
        return isTyping ? [...filtered, { userId, name }] : filtered;
      });
    });

    socket.on('notification:new', (notification) => {
      setNotifications((current) => [notification, ...current].slice(0, 8));
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`New message from ${notification.from}`, { body: notification.text });
      }
    });

    socket.on('presence:update', ({ userId, isOnline, lastSeen }) => {
      setUsers((current) => current.map((user) => user._id === userId ? { ...user, isOnline, lastSeen } : user));
      setChats((current) => current.map((chat) => ({
        ...chat,
        members: chat.members?.map((member) => member._id === userId ? { ...member, isOnline, lastSeen } : member)
      })));
    });

    return () => socket.disconnect();
  }, [session]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (groupPanelOpen) {
      window.setTimeout(() => groupNameRef.current?.focus(), 0);
    }
  }, [groupPanelOpen]);

  useEffect(() => {
    localStorage.setItem('vibe_theme', theme);
  }, [theme]);

  async function refreshData() {
    const [usersRes, chatsRes] = await Promise.all([api.get('/users'), api.get('/chats')]);
    setUsers(usersRes.data);
    setChats(chatsRes.data);

    if (session.user.role === 'admin') {
      const [statsRes, adminUsersRes] = await Promise.all([api.get('/admin/stats'), api.get('/admin/users')]);
      setAdminStats(statsRes.data);
      setAdminUsers(adminUsersRes.data);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError('');

    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      const { data } = await api.post(endpoint, payload);

      localStorage.setItem('chat_token', data.token);
      localStorage.setItem('chat_user', JSON.stringify(data.user));
      setSession(data);

      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong');
    }
  }

  function logout() {
    localStorage.removeItem('chat_token');
    localStorage.removeItem('chat_user');
    setSession(null);
    setActiveChat(null);
    setMessages([]);
    socketRef.current?.disconnect();
  }

  async function openDirectChat(userId) {
    const { data } = await api.post('/chats/direct', { userId });
    setActiveChat(data);
    socketRef.current?.emit('chat:join', data._id);
    await loadMessages(data);
    setChats((current) => current.some((chat) => chat._id === data._id) ? current : [data, ...current]);
  }

  async function createGroup(event) {
    event?.preventDefault();
    const name = groupName.trim();
    if (!name || selectedGroupMembers.length === 0) return;

    try {
      const { data } = await api.post('/chats/group', { name, memberIds: selectedGroupMembers });
      setChats((current) => [data, ...current]);
      setActiveChat(data);
      setGroupPanelOpen(false);
      setGroupName('');
      setGroupSearch('');
      setSelectedGroupMembers([]);
      setError('');
      await loadMessages(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create group');
    }
  }

  function toggleGroupMember(userId) {
    setSelectedGroupMembers((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  }

  function toggleMemberToAdd(userId) {
    setMembersToAdd((current) => current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId]);
  }

  async function addMembersToGroup(event) {
    event.preventDefault();
    if (!activeChat?.isGroup || membersToAdd.length === 0) return;

    try {
      const { data } = await api.patch(`/chats/${activeChat._id}/members`, { memberIds: membersToAdd });
      setActiveChat(data);
      setChats((current) => current.map((chat) => chat._id === data._id ? data : chat));
      setAddMembersOpen(false);
      setMembersToAdd([]);
      setAddMemberSearch('');
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add members');
    }
  }

  async function loadMessages(chat) {
    setActiveChat(chat);
    setAddMembersOpen(false);
    setGroupInfoOpen(false);
    setMembersToAdd([]);
    setAddMemberSearch('');
    setTypingUsers([]);
    setReplyingTo(null);
    socketRef.current?.emit('chat:join', chat._id);
    const { data } = await api.get(`/messages/${chat._id}`);
    setMessages(data);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const finalAttachmentUrl = attachment?.url || attachmentUrl.trim();
    if (!activeChat || (!messageText.trim() && !finalAttachmentUrl)) return;

    const payload = {
      chatId: activeChat._id,
      text: messageText,
      attachmentUrl: finalAttachmentUrl,
      attachmentName: attachment?.name,
      attachmentType: attachment?.type,
      replyTo: replyingTo?._id
    };

    try {
      if (socketRef.current?.connected) {
        const result = await new Promise((resolve) => {
          socketRef.current.emit('message:send', payload, resolve);
          window.setTimeout(() => resolve({ ok: false, message: 'Realtime send timed out' }), 7000);
        });

        if (!result?.ok) throw new Error(result?.message || 'Message failed');
        if (result.message) addMessageToView(result.message);
      } else {
        const { data } = await api.post('/messages', payload);
        addMessageToView(data);
      }

      setMessageText('');
      setAttachmentUrl('');
      setAttachment(null);
      setReplyingTo(null);
      setEmojiPickerOpen(false);
      setError('');
      window.clearTimeout(typingTimerRef.current);
      socketRef.current?.emit('typing:stop', activeChat._id);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      try {
        const { data } = await api.post('/messages', payload);
        addMessageToView(data);
        setMessageText('');
        setAttachmentUrl('');
        setAttachment(null);
        setReplyingTo(null);
        setEmojiPickerOpen(false);
        setError('');
        window.clearTimeout(typingTimerRef.current);
        socketRef.current?.emit('typing:stop', activeChat._id);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (fallbackErr) {
        setError(fallbackErr.response?.data?.message || err.message || 'Message failed');
      }
    }
  }

  function startReply(message) {
    setReplyingTo(message);
    setError('');
    window.setTimeout(() => messageInputRef.current?.focus(), 0);
  }

  function addMessageToView(message) {
    setMessages((current) => {
      if (getMessageChatId(message) !== activeChatRef.current?._id) return current;
      if (current.some((item) => item._id === message._id)) return current;
      return [...current, message];
    });
    updateChatLastMessage(message);
  }

  function updateChatLastMessage(message) {
    setChats((current) => current.map((chat) => {
      const isSameChat = chat._id === getMessageChatId(message);
      const isSameLastMessage = getMessageId(chat.lastMessage) === getMessageId(message);
      return isSameChat || isSameLastMessage ? { ...chat, lastMessage: message } : chat;
    }));
  }

  function handleMessageInput(value) {
    setMessageText(value);
    if (!activeChat?._id || !socketRef.current?.connected) return;

    socketRef.current.emit('typing:start', activeChat._id);
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      socketRef.current?.emit('typing:stop', activeChat._id);
    }, 1100);
  }

  async function unsendMessage(message) {
    try {
      const { data } = await api.post(`/messages/${message._id}/unsend`);
      setMessages((current) => current.map((item) => item._id === data._id ? data : item));
      updateChatLastMessage(data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Could not unsend message');
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > maxAttachmentSize) {
      setError('Please choose a file smaller than 6 MB');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setError('');
      setAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        url: reader.result
      });
      setAttachmentUrl('');
    };
    reader.readAsDataURL(file);
  }

  function renderAttachment(message) {
    if (!message.attachmentUrl) return null;

    const type = message.attachmentType || '';
    const name = message.attachmentName || 'Open attachment';

    if (type.startsWith('image/')) {
      return <img className="message-media" src={message.attachmentUrl} alt={name} />;
    }

    if (type.startsWith('video/')) {
      return <video className="message-media" src={message.attachmentUrl} controls />;
    }

    if (type.startsWith('audio/')) {
      return <audio className="message-audio" src={message.attachmentUrl} controls />;
    }

    return (
      <a className="file-link" href={message.attachmentUrl} download={message.attachmentName} target="_blank" rel="noreferrer">
        <File size={16} />
        {name}
      </a>
    );
  }

  async function toggleBlock(user) {
    const { data } = await api.patch(`/admin/users/${user._id}/block`, { isBlocked: !user.isBlocked });
    setAdminUsers((current) => current.map((item) => item._id === data._id ? data : item));
  }

  const filteredUsers = useMemo(() => {
    const term = query.toLowerCase();
    return users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(term));
  }, [users, query]);

  const groupUsers = useMemo(() => {
    const term = groupSearch.toLowerCase();
    return users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(term));
  }, [users, groupSearch]);

  const selectedGroupNames = users
    .filter((user) => selectedGroupMembers.includes(user._id))
    .map((user) => user.name);

  const addableMembers = useMemo(() => {
    if (!activeChat?.isGroup) return [];
    const existingIds = new Set(activeChat.members?.map((member) => member._id) || []);
    const term = addMemberSearch.toLowerCase();
    return users.filter((user) => !existingIds.has(user._id) && `${user.name} ${user.email}`.toLowerCase().includes(term));
  }, [activeChat, users, addMemberSearch]);

  const activeGroupAdmin = activeChat?.isGroup
    && activeChat.admins?.some((adminId) => (adminId._id || adminId).toString() === currentUserId);

  const chatTitle = activeChat
    ? activeChat.isGroup
      ? activeChat.name
      : activeChat.members?.find((member) => member._id !== currentUserId)?.name || 'Direct chat'
    : 'Select a chat';

  if (!session) {
    return (
      <main className="auth-screen">
        <div className="color-field color-field-one" />
        <div className="color-field color-field-two" />
        <section className="auth-panel">
          <div className="auth-copy">
            <div className="brand-mark">
              <span>V</span>
              <strong>Vibe</strong>
            </div>
            <p className="eyebrow">Real-time chat</p>
            <h1>Chat brighter, faster, and closer.</h1>
            <p className="auth-subtitle">A colorful space for private chats, groups, live status, notifications, and saved message history.</p>
            <div className="feature-strip">
              <span>Instant</span>
              <span>Secure</span>
              <span>Social</span>
            </div>
          </div>

          <form onSubmit={handleAuth} className="auth-form">
            <div className="segmented">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Login</button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Register</button>
            </div>

            {authMode === 'register' && (
              <label>
                Name
                <input value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} required />
              </label>
            )}
            <label>
              Email
              <input type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} required />
            </label>
            <label>
              Password
              <input type="password" minLength="6" value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit">{authMode === 'login' ? 'Login' : 'Create account'}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${theme === 'light' ? 'light-mode' : 'dark-mode'}`}>
      <aside className="sidebar">
        <div className="app-brand">
          <div className="brand-mark compact">
            <span>V</span>
            <strong>Vibe</strong>
          </div>
          <button className="theme-toggle" title="Toggle theme" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </div>

        <div className="profile">
          <span className="avatar">{getInitials(session.user.name)}</span>
          <div>
            <strong>{session.user.name}</strong>
            <span>{session.user.role}</span>
          </div>
          <button title="Logout" className="icon-button" onClick={logout}><LogOut size={18} /></button>
        </div>

        <div className="search">
          <Search size={17} />
          <input placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>

        <div className="sidebar-header">
          <span>People</span>
          <button title="Create group" className="icon-button" onClick={() => setGroupPanelOpen(true)}><Plus size={18} /></button>
        </div>

        {groupPanelOpen && (
          <form className="group-panel" onSubmit={createGroup}>
            <div className="group-panel-head">
              <div>
                <p className="eyebrow">New group</p>
                <strong>Create a Vibe circle</strong>
              </div>
              <button type="button" title="Close group creator" onClick={() => setGroupPanelOpen(false)}><X size={17} /></button>
            </div>

            <label>
              Group name
              <input
                ref={groupNameRef}
                type="text"
                name="groupName"
                autoComplete="off"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
                placeholder="Type group name"
              />
            </label>

            <div className="group-search">
              <Search size={16} />
              <input value={groupSearch} onChange={(event) => setGroupSearch(event.target.value)} placeholder="Search members" />
            </div>

            <div className="selected-members">
              {selectedGroupMembers.length === 0
                ? <span>Select at least one member</span>
                : selectedGroupNames.map((name) => <span key={name}>{name}</span>)}
            </div>

            <div className="group-member-list">
              {groupUsers.map((user) => {
                const selected = selectedGroupMembers.includes(user._id);
                return (
                  <button type="button" className={selected ? 'selected' : ''} key={user._id} onClick={() => toggleGroupMember(user._id)}>
                    <span className={user.isOnline ? 'status online' : 'status'} />
                    <span>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </span>
                    <span className="member-check">{selected && <Check size={15} />}</span>
                  </button>
                );
              })}
            </div>

            <button className="primary group-create" type="submit" disabled={!groupName.trim() || selectedGroupMembers.length === 0}>
              Create group
            </button>
          </form>
        )}

        <div className="user-list">
          {filteredUsers.map((user) => (
            <div className="user-row" key={user._id}>
              <button onClick={() => openDirectChat(user._id)}>
                <span className="avatar small">{getInitials(user.name)}</span>
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.isOnline ? 'Online' : 'Offline'}</small>
                </span>
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeChat?.isGroup ? 'Group vibe' : 'Conversation'}</p>
            <h2>{chatTitle}</h2>
            {activeChat?.isGroup && <small>{activeChat.members?.length || 0} members</small>}
          </div>
          <div className="top-actions">
            {activeChat?.isGroup && (
              <button title="Group info" className="header-action subtle" onClick={() => setGroupInfoOpen((open) => !open)}>
                <Info size={17} />
                Info
              </button>
            )}
            {activeGroupAdmin && (
              <button title="Add members" className="header-action" onClick={() => setAddMembersOpen((open) => !open)}>
                <Users size={17} />
                Add
              </button>
            )}
            <Bell size={18} />
            <span>{notifications.length}</span>
            <span className={socketConnected ? 'connection live' : 'connection'}>{socketConnected ? 'Live' : 'Backup'}</span>
          </div>
        </header>

        {groupInfoOpen && activeChat?.isGroup && (
          <section className="group-info-panel">
            <div>
              <p className="eyebrow">Group info</p>
              <h3>{activeChat.name}</h3>
            </div>
            <div className="member-grid">
              {activeChat.members?.map((member) => (
                <span key={member._id}><span className="avatar mini">{getInitials(member.name)}</span>{member.name}</span>
              ))}
            </div>
          </section>
        )}

        {addMembersOpen && (
          <form className="add-members-panel" onSubmit={addMembersToGroup}>
            <div className="group-search">
              <Search size={16} />
              <input value={addMemberSearch} onChange={(event) => setAddMemberSearch(event.target.value)} placeholder="Search people to add" />
            </div>

            <div className="selected-members">
              {membersToAdd.length === 0
                ? <span>Select users to add to this group</span>
                : users.filter((user) => membersToAdd.includes(user._id)).map((user) => <span key={user._id}>{user.name}</span>)}
            </div>

            <div className="group-member-list add-member-list">
              {addableMembers.length === 0 && <p className="empty-members">No more users to add</p>}
              {addableMembers.map((user) => {
                const selected = membersToAdd.includes(user._id);
                return (
                  <button type="button" className={selected ? 'selected' : ''} key={user._id} onClick={() => toggleMemberToAdd(user._id)}>
                    <span className={user.isOnline ? 'status online' : 'status'} />
                    <span>
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                    </span>
                    <span className="member-check">{selected && <Check size={15} />}</span>
                  </button>
                );
              })}
            </div>

            <div className="member-panel-actions">
              <button type="button" onClick={() => setAddMembersOpen(false)}>Cancel</button>
              <button className="primary" type="submit" disabled={membersToAdd.length === 0}>Add members</button>
            </div>
          </form>
        )}

        <div className="chat-layout">
          <nav className="chat-list">
            <p className="section-title"><MessageCircle size={16} /> Chats</p>
            {chats.map((chat) => (
              <button key={chat._id} className={activeChat?._id === chat._id ? 'selected' : ''} onClick={() => loadMessages(chat)}>
                <strong>{chat.isGroup ? chat.name : chat.members?.find((member) => member._id !== currentUserId)?.name || 'Direct chat'}</strong>
                <small>{chat.lastMessage ? getMessagePreview(chat.lastMessage) : 'No messages yet'}</small>
              </button>
            ))}
          </nav>

          <div className="conversation">
            {!activeChat ? (
              <section className="welcome-panel">
                <div className="brand-mark">
                  <span>V</span>
                  <strong>Vibe</strong>
                </div>
                <h2>Welcome to your real-time chat workspace.</h2>
                <p>Select a person, create a group, send emojis, share media, and show the live MongoDB-backed workflow in your exhibition.</p>
                <div className="welcome-actions">
                  <span>Private chats</span>
                  <span>Groups</span>
                  <span>Media</span>
                  <span>Typing</span>
                </div>
              </section>
            ) : (
              <>
            <div className="messages">
              {messages.map((message) => {
                const mine = (message.sender?._id || message.sender) === currentUserId;
                return (
                      <article className={mine ? 'bubble mine' : 'bubble'} key={message._id}>
                        <div className="message-meta">
                          <span className="avatar mini">{getInitials(message.sender?.name)}</span>
                          <small>{message.sender?.name || 'User'} - {formatMessageTime(message.createdAt)}</small>
                        </div>
                        {message.replyTo && (
                          <div className="reply-card">
                            <strong>{message.replyTo.sender?.name || 'User'}</strong>
                            <span>{getMessagePreview(message.replyTo)}</span>
                          </div>
                        )}
                        {message.isDeleted ? (
                          <p className="deleted-message">This message was unsent</p>
                        ) : (
                          <>
                            {message.text && <p>{message.text}</p>}
                            {renderAttachment(message)}
                            <div className="message-actions">
                              <button type="button" onClick={() => startReply(message)} title="Reply to message"><Reply size={14} /> Reply</button>
                              {mine && <button type="button" onClick={() => unsendMessage(message)} title="Unsend message"><Trash2 size={14} /> Unsend</button>}
                            </div>
                          </>
                        )}
                      </article>
                );
              })}
              {typingUsers.length > 0 && <p className="typing-indicator">{typingUsers.map((user) => user.name).join(', ')} typing...</p>}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              {error && <p className="composer-error">{error}</p>}
              {replyingTo && (
                <div className="reply-preview">
                  <div>
                    <strong>Replying to {replyingTo.sender?.name || 'User'}</strong>
                    <span>{getMessagePreview(replyingTo)}</span>
                  </div>
                  <button type="button" title="Cancel reply" onClick={() => setReplyingTo(null)}><X size={16} /></button>
                </div>
              )}
              {attachment && (
                <div className="attachment-preview">
                  <span><Paperclip size={16} /> {attachment.name}</span>
                  <div className="attachment-actions">
                    <button type="submit" title="Send attachment"><Send size={16} /></button>
                    <button type="button" title="Remove attachment" onClick={() => setAttachment(null)}><X size={16} /></button>
                  </div>
                </div>
              )}

              <div className="composer-row">
                <div className="emoji-picker-wrap">
                  <button type="button" title="Open emoji picker" className="tool-button" onClick={() => setEmojiPickerOpen((open) => !open)}>
                    <Smile size={19} />
                  </button>
                  {emojiPickerOpen && (
                    <div className="emoji-popover">
                      <EmojiPicker
                        width="100%"
                        height={390}
                        lazyLoadEmojis
                        searchPlaceholder="Search emoji"
                        previewConfig={{ showPreview: false }}
                        onEmojiClick={(emojiData) => setMessageText((current) => `${current}${emojiData.emoji}`)}
                      />
                    </div>
                  )}
                </div>
                <button type="button" title="Attach file" className="tool-button" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip size={19} />
                </button>
                <input ref={fileInputRef} className="hidden-file" type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" onChange={handleFileChange} />
                <input ref={messageInputRef} placeholder="Type a message or add emojis" value={messageText} onChange={(event) => handleMessageInput(event.target.value)} />
                <button title="Send message" className="send-button" type="submit"><Send size={19} /></button>
              </div>
            </form>
              </>
            )}
          </div>
        </div>
      </section>

      {session.user.role === 'admin' && (
        <aside className="admin-panel">
          <p className="section-title"><Shield size={16} /> Admin</p>
          {adminStats && (
            <div className="stats-grid">
              <span><strong>{adminStats.users}</strong> Users</span>
              <span><strong>{adminStats.onlineUsers}</strong> Online</span>
              <span><strong>{adminStats.chats}</strong> Chats</span>
              <span><strong>{adminStats.messages}</strong> Messages</span>
            </div>
          )}
          <p className="section-title"><Users size={16} /> Manage users</p>
          <div className="admin-users">
            {adminUsers.map((user) => (
              <button key={user._id} onClick={() => toggleBlock(user)}>
                <span>{user.name}</span>
                <small>{user.isBlocked ? 'Unblock' : 'Block'}</small>
              </button>
            ))}
          </div>
        </aside>
      )}
    </main>
  );
}

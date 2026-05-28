import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, LogOut, MessageCircle, Plus, Search, Send, Shield, Sparkles, Users } from 'lucide-react';
import { api } from './api.js';
import { createSocket } from './socket.js';

const emptyAuth = { name: '', email: '', password: '' };

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
  const [notifications, setNotifications] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const activeChatRef = useRef(null);
  const bottomRef = useRef(null);

  const currentUserId = session?.user?.id || session?.user?._id;

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    if (!session) return;
    refreshData();

    const socket = createSocket(session.token);
    socketRef.current = socket;

    socket.on('message:new', (message) => {
      setMessages((current) => {
        if (message.chat !== activeChatRef.current?._id) return current;
        if (current.some((item) => item._id === message._id)) return current;
        return [...current, message];
      });
      setChats((current) => current.map((chat) => chat._id === message.chat ? { ...chat, lastMessage: message } : chat));
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

  async function createGroup() {
    const selectedUsers = users.filter((user) => user.selected).map((user) => user._id);
    const name = window.prompt('Group name');
    if (!name || selectedUsers.length === 0) return;

    const { data } = await api.post('/chats/group', { name, memberIds: selectedUsers });
    setChats((current) => [data, ...current]);
    setActiveChat(data);
    await loadMessages(data);
  }

  async function loadMessages(chat) {
    setActiveChat(chat);
    socketRef.current?.emit('chat:join', chat._id);
    const { data } = await api.get(`/messages/${chat._id}`);
    setMessages(data);
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!activeChat || (!messageText.trim() && !attachmentUrl.trim())) return;

    socketRef.current?.emit('message:send', {
      chatId: activeChat._id,
      text: messageText,
      attachmentUrl
    }, (result) => {
      if (!result?.ok) setError(result?.message || 'Message failed');
    });

    setMessageText('');
    setAttachmentUrl('');
  }

  async function toggleBlock(user) {
    const { data } = await api.patch(`/admin/users/${user._id}/block`, { isBlocked: !user.isBlocked });
    setAdminUsers((current) => current.map((item) => item._id === data._id ? data : item));
  }

  const filteredUsers = useMemo(() => {
    const term = query.toLowerCase();
    return users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(term));
  }, [users, query]);

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
    <main className="app-shell">
      <aside className="sidebar">
        <div className="app-brand">
          <div className="brand-mark compact">
            <span>V</span>
            <strong>Vibe</strong>
          </div>
          <Sparkles size={18} />
        </div>

        <div className="profile">
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
          <button title="Create group" className="icon-button" onClick={createGroup}><Plus size={18} /></button>
        </div>

        <div className="user-list">
          {filteredUsers.map((user) => (
            <div className="user-row" key={user._id}>
              <button onClick={() => openDirectChat(user._id)}>
                <span className={user.isOnline ? 'status online' : 'status'} />
                <span>
                  <strong>{user.name}</strong>
                  <small>{user.isOnline ? 'Online' : 'Offline'}</small>
                </span>
              </button>
              <input type="checkbox" title="Select for group" onChange={(event) => {
                setUsers((current) => current.map((item) => item._id === user._id ? { ...item, selected: event.target.checked } : item));
              }} />
            </div>
          ))}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeChat?.isGroup ? 'Group vibe' : 'Conversation'}</p>
            <h2>{chatTitle}</h2>
          </div>
          <div className="top-actions">
            <Bell size={18} />
            <span>{notifications.length}</span>
          </div>
        </header>

        <div className="chat-layout">
          <nav className="chat-list">
            <p className="section-title"><MessageCircle size={16} /> Chats</p>
            {chats.map((chat) => (
              <button key={chat._id} className={activeChat?._id === chat._id ? 'selected' : ''} onClick={() => loadMessages(chat)}>
                <strong>{chat.isGroup ? chat.name : chat.members?.find((member) => member._id !== currentUserId)?.name || 'Direct chat'}</strong>
                <small>{chat.lastMessage?.text || 'No messages yet'}</small>
              </button>
            ))}
          </nav>

          <div className="conversation">
            <div className="messages">
              {messages.map((message) => {
                const mine = (message.sender?._id || message.sender) === currentUserId;
                return (
                  <article className={mine ? 'bubble mine' : 'bubble'} key={message._id}>
                    <small>{message.sender?.name || 'User'}</small>
                    {message.text && <p>{message.text}</p>}
                    {message.attachmentUrl && <a href={message.attachmentUrl} target="_blank" rel="noreferrer">Open attachment</a>}
                  </article>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <input placeholder="Attachment URL" value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} />
              <input placeholder="Type a message" value={messageText} onChange={(event) => setMessageText(event.target.value)} />
              <button title="Send message" className="send-button" type="submit"><Send size={19} /></button>
            </form>
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

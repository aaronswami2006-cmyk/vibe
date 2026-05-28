import { Server } from 'socket.io';
import Chat from './models/Chat.js';
import Message from './models/Message.js';
import User from './models/User.js';
import { verifyToken } from './lib/jwt.js';

const onlineSockets = new Map();

export function configureSocket(httpServer) {
  const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyToken(token);
      const user = await User.findById(payload.id).select('-password');

      if (!user || user.isBlocked) {
        return next(new Error('Unauthorized'));
      }

      socket.user = user;
      next();
    } catch (_error) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    onlineSockets.set(userId, socket.id);
    socket.join(userId);

    await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() });
    io.emit('presence:update', { userId, isOnline: true });

    const chats = await Chat.find({ members: userId }).select('_id');
    chats.forEach((chat) => socket.join(chat._id.toString()));

    socket.on('chat:join', async (chatId) => {
      const chat = await Chat.findOne({ _id: chatId, members: userId });
      if (chat) socket.join(chatId);
    });

    socket.on('message:send', async ({ chatId, text, attachmentUrl }, callback) => {
      try {
        const chat = await Chat.findOne({ _id: chatId, members: userId });
        if (!chat) throw new Error('Chat not found');
        if (!text?.trim() && !attachmentUrl?.trim()) throw new Error('Message text or attachment is required');

        let message = await Message.create({
          chat: chatId,
          sender: userId,
          text,
          attachmentUrl,
          readBy: [userId]
        });

        chat.lastMessage = message._id;
        await chat.save();
        message = await message.populate('sender', 'name email');

        io.to(chatId).emit('message:new', message);
        chat.members
          .map((member) => member.toString())
          .filter((memberId) => memberId !== userId)
          .forEach((memberId) => {
            io.to(memberId).emit('notification:new', {
              chatId,
              messageId: message._id,
              from: socket.user.name,
              text: message.text || 'Sent an attachment'
            });
          });

        callback?.({ ok: true, message });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on('disconnect', async () => {
      onlineSockets.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
      io.emit('presence:update', { userId, isOnline: false, lastSeen: new Date() });
    });
  });

  return io;
}

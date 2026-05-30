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
    maxHttpBufferSize: 12 * 1024 * 1024,
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

    socket.on('message:send', async ({ chatId, text, attachmentUrl, attachmentName, attachmentType, replyTo }, callback) => {
      try {
        const chat = await Chat.findOne({ _id: chatId, members: userId });
        if (!chat) throw new Error('Chat not found');
        if (!text?.trim() && !attachmentUrl?.trim()) throw new Error('Message text or attachment is required');

        if (replyTo) {
          const original = await Message.findOne({ _id: replyTo, chat: chatId }).select('_id');
          if (!original) throw new Error('Reply message not found in this chat');
        }

        let message = await Message.create({
          chat: chatId,
          sender: userId,
          text,
          attachmentUrl,
          attachmentName,
          attachmentType,
          replyTo,
          readBy: [userId]
        });

        chat.lastMessage = message._id;
        await chat.save();
        message = await message.populate([
          { path: 'sender', select: 'name email' },
          {
            path: 'replyTo',
            select: 'text attachmentName attachmentType isDeleted sender',
            populate: { path: 'sender', select: 'name email' }
          }
        ]);

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

    socket.on('typing:start', async (chatId) => {
      const chat = await Chat.findOne({ _id: chatId, members: userId }).select('_id');
      if (chat) socket.to(chatId).emit('typing:update', { chatId, userId, name: socket.user.name, isTyping: true });
    });

    socket.on('typing:stop', async (chatId) => {
      const chat = await Chat.findOne({ _id: chatId, members: userId }).select('_id');
      if (chat) socket.to(chatId).emit('typing:update', { chatId, userId, name: socket.user.name, isTyping: false });
    });

    socket.on('message:delete', async ({ messageId }, callback) => {
      try {
        let message = await Message.findById(messageId);
        if (!message) throw new Error('Message not found');

        const chat = await Chat.findOne({ _id: message.chat, members: userId });
        if (!chat) throw new Error('Chat not found');
        if (message.sender.toString() !== userId) throw new Error('You can only unsend your own messages');

        message.text = '';
        message.attachmentUrl = undefined;
        message.attachmentName = undefined;
        message.attachmentType = undefined;
        message.isDeleted = true;
        message.deletedAt = new Date();
        await message.save();
        message = await message.populate('sender', 'name email');

        io.to(chat._id.toString()).emit('message:deleted', message);
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

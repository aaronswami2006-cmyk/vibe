import { Router } from 'express';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/:chatId', requireAuth, async (req, res, next) => {
  try {
    const chat = await Chat.findOne({ _id: req.params.chatId, members: req.user._id });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const messages = await Message.find({ chat: chat._id })
      .populate('sender', 'name email')
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { chatId, text, attachmentUrl, attachmentName, attachmentType } = req.body;
    const chat = await Chat.findOne({ _id: chatId, members: req.user._id });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!text?.trim() && !attachmentUrl?.trim()) {
      return res.status(400).json({ message: 'Message text or attachment is required' });
    }

    let message = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text,
      attachmentUrl,
      attachmentName,
      attachmentType,
      readBy: [req.user._id]
    });

    chat.lastMessage = message._id;
    await chat.save();

    message = await message.populate('sender', 'name email');
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

export default router;

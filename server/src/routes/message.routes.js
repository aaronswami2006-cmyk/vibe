import { Router } from 'express';
import mongoose from 'mongoose';
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
      .populate({
        path: 'replyTo',
        select: 'text attachmentName attachmentType isDeleted sender',
        populate: { path: 'sender', select: 'name email' }
      })
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    next(error);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { chatId, text, attachmentUrl, attachmentName, attachmentType, replyTo } = req.body;
    const chat = await Chat.findOne({ _id: chatId, members: req.user._id });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!text?.trim() && !attachmentUrl?.trim()) {
      return res.status(400).json({ message: 'Message text or attachment is required' });
    }

    if (replyTo) {
      if (!mongoose.isValidObjectId(replyTo)) {
        return res.status(400).json({ message: 'Reply message not found in this chat' });
      }

      const original = await Message.findOne({ _id: replyTo, chat: chat._id });
      if (!original) {
        return res.status(400).json({ message: 'Reply message not found in this chat' });
      }
    }

    let message = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text,
      attachmentUrl,
      attachmentName,
      attachmentType,
      replyTo,
      readBy: [req.user._id]
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
    res.status(201).json(message);
  } catch (error) {
    next(error);
  }
});

router.delete('/:messageId', requireAuth, async (req, res, next) => {
  try {
    let message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const chat = await Chat.findOne({ _id: message.chat, members: req.user._id });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only unsend your own messages' });
    }

    message.text = '';
    message.attachmentUrl = undefined;
    message.attachmentName = undefined;
    message.attachmentType = undefined;
    message.isDeleted = true;
    message.deletedAt = new Date();
    await message.save();
    message = await message.populate([
      { path: 'sender', select: 'name email' },
      {
        path: 'replyTo',
        select: 'text attachmentName attachmentType isDeleted sender',
        populate: { path: 'sender', select: 'name email' }
      }
    ]);

    res.json(message);
  } catch (error) {
    next(error);
  }
});

export default router;

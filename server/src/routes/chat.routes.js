import { Router } from 'express';
import Chat from '../models/Chat.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const chats = await Chat.find({ members: req.user._id })
      .populate('members', 'name email isOnline lastSeen')
      .populate({ path: 'lastMessage', populate: { path: 'sender', select: 'name' } })
      .sort({ updatedAt: -1 });

    res.json(chats);
  } catch (error) {
    next(error);
  }
});

router.post('/direct', requireAuth, async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId || userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'A different user is required' });
    }

    let chat = await Chat.findOne({
      isGroup: false,
      members: { $all: [req.user._id, userId], $size: 2 }
    });

    if (!chat) {
      chat = await Chat.create({ members: [req.user._id, userId] });
    }

    await chat.populate('members', 'name email isOnline lastSeen');
    res.status(201).json(chat);
  } catch (error) {
    next(error);
  }
});

router.post('/group', requireAuth, async (req, res, next) => {
  try {
    const { name, memberIds = [] } = req.body;
    const members = [...new Set([req.user._id.toString(), ...memberIds])];

    if (!name || members.length < 2) {
      return res.status(400).json({ message: 'Group name and at least one member are required' });
    }

    const chat = await Chat.create({
      name,
      isGroup: true,
      members,
      admins: [req.user._id]
    });

    await chat.populate('members', 'name email isOnline lastSeen');
    res.status(201).json(chat);
  } catch (error) {
    next(error);
  }
});

export default router;

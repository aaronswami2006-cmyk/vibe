import { Router } from 'express';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import Message from '../models/Message.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', async (_req, res, next) => {
  try {
    const [users, onlineUsers, chats, messages] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isOnline: true }),
      Chat.countDocuments(),
      Message.countDocuments()
    ]);

    res.json({ users, onlineUsers, chats, messages });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/block', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBlocked: Boolean(req.body.isBlocked), isOnline: false },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;

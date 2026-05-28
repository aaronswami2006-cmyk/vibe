import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id }, isBlocked: false })
      .select('name email role isOnline lastSeen')
      .sort({ isOnline: -1, name: 1 });

    res.json(users);
  } catch (error) {
    next(error);
  }
});

export default router;

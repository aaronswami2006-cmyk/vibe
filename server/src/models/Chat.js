import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    isGroup: { type: Boolean, default: false },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
  },
  { timestamps: true }
);

export default mongoose.model('Chat', chatSchema);

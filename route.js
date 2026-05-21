
import { Router } from "express";

Router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

Router.post('/api/users/join', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });
    const user = await User.findOneAndUpdate(
      { username },
      { lastSeen: new Date() },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

Router.get('/api/messages/:room', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const messages = await Message.find({ room: req.params.room })
      .sort({ timestamp: -1 }).limit(limit).lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

Router.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Message.distinct('room');
    if (!rooms.includes('general')) rooms.unshift('general');
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default 'router';
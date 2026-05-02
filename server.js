const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Load .env only in local dev — Railway injects env vars directly
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Connection ────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('FATAL: MONGO_URI environment variable is not set.');
  process.exit(1);
}

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // Exit so Railway restarts the container
  });

mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

// ─── Models ────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  avatar:   { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeen:  { type: Date, default: Date.now }
});

const messageSchema = new mongoose.Schema({
  room:      { type: String, required: true, default: 'general' },
  username:  { type: String, required: true },
  text:      { type: String, required: true, trim: true },
  avatar:    { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

const User    = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

// ─── REST Routes ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

app.post('/api/users/join', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const user = await User.findOneAndUpdate(
      { username },
      { lastSeen: new Date() },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }  // fixed deprecated option
    );

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/:room', async (req, res) => {
  try {
    const { room } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const messages = await Message.find({ room })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await Message.distinct('room');
    if (!rooms.includes('general')) rooms.unshift('general');
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback — serve index.html for any non-API route (SPA support)
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(200).send('Server is running.');
  });
});

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join', async ({ username, room = 'general' }) => {
    socket.join(room);
    onlineUsers.set(socket.id, { username, room });

    const messages = await Message.find({ room })
      .sort({ timestamp: -1 }).limit(50).lean();
    socket.emit('history', messages.reverse());

    io.to(room).emit('userJoined', { username, room });
    io.to(room).emit('onlineUsers', getOnlineInRoom(room));
    console.log(`${username} joined room: ${room}`);
  });

  socket.on('message', async ({ username, text, room = 'general', avatar = '' }) => {
    try {
      const msg = await Message.create({ room, username, text, avatar });
      io.to(room).emit('message', msg);
    } catch (err) {
      socket.emit('error', { message: 'Failed to save message' });
    }
  });

  socket.on('switchRoom', async ({ username, oldRoom, newRoom }) => {
    socket.leave(oldRoom);
    socket.join(newRoom);
    onlineUsers.set(socket.id, { username, room: newRoom });

    const messages = await Message.find({ room: newRoom })
      .sort({ timestamp: -1 }).limit(50).lean();
    socket.emit('history', messages.reverse());

    io.to(oldRoom).emit('onlineUsers', getOnlineInRoom(oldRoom));
    io.to(newRoom).emit('onlineUsers', getOnlineInRoom(newRoom));
    io.to(newRoom).emit('userJoined', { username, room: newRoom });
  });

  socket.on('typing',     ({ username, room }) => socket.to(room).emit('typing', { username }));
  socket.on('stopTyping', ({ username, room }) => socket.to(room).emit('stopTyping', { username }));

  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      io.to(user.room).emit('userLeft', { username: user.username });
      io.to(user.room).emit('onlineUsers', getOnlineInRoom(user.room));
      onlineUsers.delete(socket.id);
    }
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

function getOnlineInRoom(room) {
  return [...onlineUsers.values()]
    .filter(u => u.room === room)
    .map(u => u.username);
}

// ─── Graceful Shutdown (required for Railway) ─────────────────────────────────
function shutdown(signal) {
  console.log(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed. Exiting.');
      process.exit(0);
    });
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    console.error('Forced exit after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {   // 0.0.0.0 required on Railway
  console.log(`Server running on port ${PORT}`);
});
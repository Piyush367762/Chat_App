
import Message from "model.js";
import {Server} from 'socket.io';

const onlineUsers = new Map();

export default function sokcetController(server) {const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});


io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('join', async ({ username, room = 'general' }) => {
    socket.join(room);

    onlineUsers.set(socket.id, { username, room });
    const messages = await Message.find({ room })
      .sort({ timestamp: -1 }).limit(50).lean();
    socket.emit('history', messages.reverse());
    io.to(room).emit('userJoined', { username, room });
    io.to(room).emit('onlineUsers', getOnlineInRoom(room));
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
  });
});

function getOnlineInRoom(room) {
  return [...onlineUsers.values()]
    .filter(u => u.room === room)
    .map(u => u.username);
}



function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  server.close(() => {
    mongoose.connection.close(false).then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
}
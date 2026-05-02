
const API = 'http://localhost:3000';
let socket, currentUser, currentRoom = 'general';
let typingTimeout;
const COLORS = ['#7c6af7','#f472b6','#34d399','#60a5fa','#fb923c','#a78bfa','#38bdf8'];

function colorFor(name) {
  let h = 0;
  for (let c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length;
  return COLORS[h];
}
function initials(name) { return name.slice(0,2).toUpperCase(); }
function timeStr(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function joinChat() {
  const username = document.getElementById('username-input').value.trim();
  const room = document.getElementById('room-input').value.trim() || 'general';
  if (!username) return alert('Please enter a username');

  await fetch(`${API}/api/users/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username })
  });

  currentUser = username;
  currentRoom = room;
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('sidebar-username').textContent = username;
  document.getElementById('user-avatar').textContent = initials(username);
  document.getElementById('user-avatar').style.background = colorFor(username);

  initSocket();
  loadRooms();
}

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    socket.emit('join', { username: currentUser, room: currentRoom });
    setRoom(currentRoom);
  });

  socket.on('history', (msgs) => {
    document.getElementById('messages').innerHTML = '';
    msgs.forEach(appendMessage);
    scrollToBottom();
  });

  socket.on('message', (msg) => {
    appendMessage(msg);
    scrollToBottom();
  });

  socket.on('userJoined', ({ username }) => {
    if (username !== currentUser) appendSystem(`${username} joined the room`);
  });

  socket.on('userLeft', ({ username }) => {
    appendSystem(`${username} left the room`);
  });

  socket.on('onlineUsers', (users) => {
    document.getElementById('online-count').textContent = `${users.length} online`;
    const list = document.getElementById('online-list');
    list.innerHTML = users.map(u => `
      <div class="online-item">
        <div class="online-dot"></div>
        <span>${u}</span>
      </div>
    `).join('');
  });

  socket.on('typing', ({ username }) => {
    if (username !== currentUser) showTyping(username);
  });

  socket.on('stopTyping', () => hideTyping());
}

async function loadRooms() {
  const res = await fetch(`${API}/api/rooms`);
  const rooms = await res.json();
  renderRooms(rooms);
}

function renderRooms(rooms) {
  const list = document.getElementById('room-list');
  list.innerHTML = rooms.map(r => `
    <div class="room-item ${r === currentRoom ? 'active' : ''}" onclick="switchRoom('${r}')">
      <span class="room-hash">#</span> ${r}
    </div>
  `).join('');
}

function setRoom(room) {
  currentRoom = room;
  document.getElementById('current-room-name').textContent = room;
  document.getElementById('msg-input').placeholder = `Message #${room}`;
}

function switchRoom(room) {
  if (room === currentRoom) return;
  socket.emit('switchRoom', { username: currentUser, oldRoom: currentRoom, newRoom: room });
  const old = currentRoom;
  setRoom(room);
  document.querySelectorAll('.room-item').forEach(el => {
    el.classList.toggle('active', el.textContent.trim().slice(1).trim() === room);
  });
  document.getElementById('messages').innerHTML = '';
}

function promptNewRoom() {
  const room = prompt('Room name:')?.trim().toLowerCase().replace(/\s+/g, '-');
  if (room) switchRoom(room);
}

function appendMessage(msg) {
  const isOwn = msg.username === currentUser;
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `msg-group ${isOwn ? 'own' : ''}`;
  div.innerHTML = `
    <div class="avatar" style="background:${colorFor(msg.username)};color:#fff;">${initials(msg.username)}</div>
    <div class="msg-content">
      <div class="msg-meta">
        <span class="msg-author">${msg.username}</span>
        <span class="msg-time">${timeStr(msg.timestamp)}</span>
      </div>
      <div class="msg-bubble">${escapeHtml(msg.text)}</div>
    </div>
  `;
  msgs.appendChild(div);
}

function appendSystem(text) {
  const msgs = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  msgs.appendChild(div);
  scrollToBottom();
}

function sendMessage() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !socket) return;
  socket.emit('message', { username: currentUser, text, room: currentRoom });
  input.value = '';
  socket.emit('stopTyping', { username: currentUser, room: currentRoom });
}

document.getElementById('msg-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

document.getElementById('msg-input').addEventListener('input', () => {
  if (!socket) return;
  socket.emit('typing', { username: currentUser, room: currentRoom });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('stopTyping', { username: currentUser, room: currentRoom });
  }, 1500);
});

document.getElementById('username-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('room-input').focus();
});
document.getElementById('room-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinChat();
});

function showTyping(username) {
  document.getElementById('typing-indicator').innerHTML = `
    <span class="typing-dots"><span></span><span></span><span></span></span>
    <span>${username} is typing...</span>`;
}
function hideTyping() {
  document.getElementById('typing-indicator').innerHTML = '';
}

function scrollToBottom() {
  const m = document.getElementById('messages');
  m.scrollTop = m.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

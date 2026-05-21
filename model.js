const User = mongoose.model('User', new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true },
  avatar:    { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastSeen:  { type: Date, default: Date.now }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  room:      { type: String, required: true, default: 'general' },
  username:  { type: String, required: true },
  text:      { type: String, required: true, trim: true },
  avatar:    { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}));
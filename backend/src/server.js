require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const bookingRoutes = require('./routes/booking');
const wardenRoutes = require('./routes/warden');
const groupRoutes = require('./routes/groups');
const { cleanOrphanedHolds } = require('./services/holdService');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = socketIo(server, {
  cors: {
    origin: '*', // For development flexibility
    methods: ['GET', 'POST']
  }
});

// Attach Socket.io to request objects so route controllers can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Express Config
app.use(cors());
app.use(express.json());

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/warden', wardenRoutes);
app.use('/api/groups', groupRoutes);

// Simple health check route
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

// Real-Time Socket Connection Handlers
io.on('connection', (socket) => {
  console.log('Client connected to socket:', socket.id);

  socket.on('joinRoomFloor', ({ buildingId, floor }) => {
    const roomName = `building-${buildingId}-floor-${floor}`;
    socket.join(roomName);
    console.log(`Socket ${socket.id} joined channel ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Lazy Orphaned Holds Cleanup Cron
setInterval(async () => {
  try {
    await cleanOrphanedHolds();
  } catch (error) {
    console.error('Orphaned holds lazy cleanup error:', error.message);
  }
}, 60 * 1000); // Trigger check every 60 seconds

// Connect to MongoDB
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-hostel-allocation';
mongoose.connect(mongoUri)
  .then(() => {
    console.log('Connected to MongoDB database successfully.');
    const PORT = process.env.PORT || 5001;
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
  });

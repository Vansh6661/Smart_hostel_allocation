const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { bookingLimiter } = require('../middleware/rateLimiter');
const holdService = require('../services/holdService');
const Hold = require('../models/Hold');

// 1. Create a hold (Rate limited to prevent click-spam)
router.post('/hold', auth, bookingLimiter, async (req, res) => {
  try {
    const { roomId, bedNumber } = req.body;
    if (!roomId || !bedNumber) {
      return res.status(400).json({ error: 'Room ID and bed number are required.' });
    }

    const hold = await holdService.createHold(req.user._id, roomId, bedNumber, req.user.groupRef);

    // Emit live update to all connected clients via Socket.io
    if (req.io) {
      req.io.emit('bedStatusChanged', {
        roomId,
        bedNumber,
        status: 'held',
        studentRef: req.user._id
      });
    }

    res.status(201).json({
      message: 'Bed hold secured successfully. You have 5 minutes to confirm booking.',
      hold
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 2. Confirm booking from hold
router.post('/confirm', auth, async (req, res) => {
  try {
    const { roomId, bedNumber } = req.body;
    if (!roomId || !bedNumber) {
      return res.status(400).json({ error: 'Room ID and bed number are required.' });
    }

    const hold = await holdService.confirmBooking(req.user._id, roomId, bedNumber);

    // Emit live update to all connected clients
    if (req.io) {
      req.io.emit('bedStatusChanged', {
        roomId,
        bedNumber,
        status: 'booked',
        studentRef: req.user._id
      });
    }

    res.json({
      message: 'Booking confirmed successfully!',
      hold
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. Release active hold manually
router.post('/release', auth, async (req, res) => {
  try {
    const hold = await Hold.findOne({ studentRef: req.user._id, status: 'pending' });
    if (!hold) {
      return res.status(404).json({ error: 'No active pending hold found.' });
    }

    await holdService.releaseHold(hold._id);

    // Emit live update
    if (req.io) {
      req.io.emit('bedStatusChanged', {
        roomId: hold.roomId,
        bedNumber: hold.bedNumber,
        status: 'open',
        studentRef: null
      });
    }

    res.json({ message: 'Hold released successfully.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

const mongoose = require('mongoose');

const HoldSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true
  },
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  bedNumber: {
    type: String,
    required: true
  },
  studentRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    unique: true // A student can only hold one bed at a time
  },
  groupRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// TTL index to automatically remove the document when it expires (normally 5-10 minutes)
HoldSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Indexes for fast lookups by student or bed
HoldSchema.index({ studentRef: 1 });
HoldSchema.index({ roomId: 1, bedNumber: 1 });

module.exports = mongoose.model('Hold', HoldSchema);

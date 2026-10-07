const mongoose = require('mongoose');

const BedSchema = new mongoose.Schema({
  bedNumber: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['open', 'held', 'booked'],
    default: 'open'
  },
  studentRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    default: null
  }
});

const RoomSchema = new mongoose.Schema({
  roomNumber: {
    type: String,
    required: true,
    trim: true
  },
  building: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Building',
    required: true
  },
  floor: {
    type: Number,
    required: true
  },
  wing: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    enum: ['UG', 'PG', 'PhD'],
    required: true
  },
  capacity: {
    type: Number,
    required: true
  },
  beds: [BedSchema]
}, {
  timestamps: true
});

// Indexes for fast querying at scale
RoomSchema.index({ building: 1 });
RoomSchema.index({ category: 1 });
RoomSchema.index({ floor: 1 });
RoomSchema.index({ wing: 1 });
RoomSchema.index({ 'beds.status': 1 });
RoomSchema.index({ building: 1, floor: 1 }); // Multi-key query support for floor maps

module.exports = mongoose.model('Room', RoomSchema);

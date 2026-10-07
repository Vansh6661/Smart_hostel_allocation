const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  registerNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: ['UG', 'PG', 'PhD'],
    required: true
  },
  role: {
    type: String,
    default: 'student'
  },
  groupRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  bookedBed: {
    buildingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Building', default: null },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
    bedNumber: { type: String, default: null }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Student', StudentSchema);

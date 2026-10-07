const mongoose = require('mongoose');

const GroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  }],
  status: {
    type: String,
    enum: ['forming', 'sealed', 'allocated'],
    default: 'forming'
  },
  allocatedRooms: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Group', GroupSchema);

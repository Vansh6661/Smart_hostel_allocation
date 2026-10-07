const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  wardenId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Warden',
    required: true
  },
  action: {
    type: String,
    enum: ['assign', 'remove'],
    required: true
  },
  bedId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);

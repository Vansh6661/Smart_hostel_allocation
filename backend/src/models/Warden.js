const mongoose = require('mongoose');

const WardenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
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
  role: {
    type: String,
    default: 'warden'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Warden', WardenSchema);

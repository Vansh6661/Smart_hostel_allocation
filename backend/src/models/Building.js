const mongoose = require('mongoose');

const BuildingSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  totalFloors: {
    type: Number,
    required: true
  },
  genderRestriction: {
    type: String,
    enum: ['boys', 'girls', 'coed'],
    required: true
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Building', BuildingSchema);

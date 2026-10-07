const mongoose = require('mongoose');

const CategoryCapacityRuleSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['UG', 'PG', 'PhD'],
    required: true,
    unique: true
  },
  allowedCapacities: [{
    type: String,
    enum: ['single', 'double', 'triple']
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('CategoryCapacityRule', CategoryCapacityRuleSchema);

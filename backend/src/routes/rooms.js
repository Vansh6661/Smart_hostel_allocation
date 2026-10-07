const express = require('express');
const router = express.Router();
const Building = require('../models/Building');
const Room = require('../models/Room');
const CategoryCapacityRule = require('../models/CategoryCapacityRule');
const { auth } = require('../middleware/auth');

// Get all buildings
router.get('/buildings', auth, async (req, res) => {
  try {
    const buildings = await Building.find({});
    res.json(buildings);
  } catch (error) {
    res.status(500).json({ error: 'Server error retrieving buildings list' });
  }
});

// Get floor layout and rooms/beds
router.get('/layout/:buildingId/:floor', auth, async (req, res) => {
  try {
    const { buildingId, floor } = req.params;
    
    // Find rooms in this building on this floor
    const query = { building: buildingId, floor: parseInt(floor) };
    
    // If student, filter rooms matching their category and allowed capacity rules
    if (req.role === 'student') {
      query.category = req.user.category;
      const rule = await CategoryCapacityRule.findOne({ category: req.user.category });
      if (rule) {
        const allowedCapacitiesNumbers = rule.allowedCapacities.map(c => c === 'single' ? 1 : c === 'double' ? 2 : 3);
        query.capacity = { $in: allowedCapacitiesNumbers };
      } else {
        query.capacity = { $in: [] };
      }
    }

    const rooms = await Room.find(query).sort({ roomNumber: 1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: 'Server error retrieving layout' });
  }
});

// Get occupancy stats (for both Warden dashboard and general dashboard)
router.get('/stats', auth, async (req, res) => {
  try {
    const buildings = await Building.find({});
    const stats = [];

    for (const b of buildings) {
      const rooms = await Room.find({ building: b._id });
      let totalBeds = 0;
      let openBeds = 0;
      let heldBeds = 0;
      let bookedBeds = 0;

      rooms.forEach(r => {
        r.beds.forEach(bed => {
          totalBeds++;
          if (bed.status === 'open') openBeds++;
          else if (bed.status === 'held') heldBeds++;
          else if (bed.status === 'booked') bookedBeds++;
        });
      });

      stats.push({
        buildingId: b._id,
        name: b.name,
        totalBeds,
        openBeds,
        heldBeds,
        bookedBeds,
        occupancyRate: totalBeds > 0 ? ((bookedBeds / totalBeds) * 100).toFixed(1) : 0
      });
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Server error retrieving occupancy statistics' });
  }
});

module.exports = router;

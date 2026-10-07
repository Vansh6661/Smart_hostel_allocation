const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const Student = require('../models/Student');
const Room = require('../models/Room');
const { auth } = require('../middleware/auth');

// Get current student's group
router.get('/my-group', auth, async (req, res) => {
  try {
    if (!req.user.groupRef) {
      return res.json({ group: null });
    }

    const group = await Group.findById(req.user.groupRef).populate('members', 'name email registerNumber category');
    res.json({ group });
  } catch (error) {
    res.status(500).json({ error: 'Server error retrieving group details.' });
  }
});

// Create Group
router.post('/create', auth, async (req, res) => {
  try {
    if (req.user.groupRef) {
      return res.status(400).json({ error: 'You are already in a group.' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Group name is required.' });
    }

    // Generate unique 6-character uppercase join code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const group = new Group({
      name,
      code,
      members: [req.user._id],
      status: 'forming'
    });

    await group.save();

    // Link group to student
    req.user.groupRef = group._id;
    await req.user.save();

    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join Group via Code
router.post('/join', auth, async (req, res) => {
  try {
    if (req.user.groupRef) {
      return res.status(400).json({ error: 'You are already in a group. Leave it first.' });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ error: 'Join code is required.' });
    }

    const group = await Group.findOne({ code: code.toUpperCase() });
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    if (group.status !== 'forming') {
      return res.status(400).json({ error: 'This group is sealed and cannot accept new members.' });
    }

    // Verify student category matches other members (e.g. all UG)
    const firstMember = await Student.findById(group.members[0]);
    if (firstMember && firstMember.category !== req.user.category) {
      return res.status(400).json({
        error: `Category mismatch. This group consists of ${firstMember.category} students, you are registered as ${req.user.category}.`
      });
    }

    group.members.push(req.user._id);
    await group.save();

    req.user.groupRef = group._id;
    await req.user.save();

    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Seal Group (finalize list of members)
router.post('/seal', auth, async (req, res) => {
  try {
    if (!req.user.groupRef) {
      return res.status(400).json({ error: 'You are not in a group.' });
    }

    const group = await Group.findById(req.user.groupRef);
    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Set status to sealed
    group.status = 'sealed';
    await group.save();

    res.json({ message: 'Group sealed successfully. You can now request cluster recommendations.', group });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Suggest adjacent room clusters for large groups (e.g. 9-13+ members)
router.get('/clusters/:buildingId', auth, async (req, res) => {
  try {
    const { buildingId } = req.params;
    if (!req.user.groupRef) {
      return res.status(400).json({ error: 'You must form/join a group to search clusters.' });
    }

    const group = await Group.findById(req.user.groupRef).populate('members');
    if (group.members.length < 2) {
      return res.status(400).json({ error: 'Cluster matching requires a group of at least 2 people.' });
    }

    const studentCategory = req.user.category;
    const groupSize = group.members.length;

    // Retrieve all rooms in the building of appropriate category
    const rooms = await Room.find({
      building: buildingId,
      category: studentCategory
    });

    // Group rooms by Floor
    const floorsMap = {};
    rooms.forEach(r => {
      if (!floorsMap[r.floor]) {
        floorsMap[r.floor] = [];
      }
      // Calculate available beds count
      const availableBedsCount = r.beds.filter(b => b.status === 'open').length;
      floorsMap[r.floor].push({
        roomId: r._id,
        roomNumber: r.roomNumber,
        floor: r.floor,
        wing: r.wing,
        capacity: r.capacity,
        availableBedsCount
      });
    });

    const recommendations = [];

    // Scan each floor to see if we can find cluster groupings
    Object.keys(floorsMap).forEach(floorNum => {
      const floorRooms = floorsMap[floorNum];
      
      // Let's sort rooms numerically to suggest contiguous spaces
      floorRooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

      // Find sliding window combinations of rooms that sum up to groupSize
      for (let i = 0; i < floorRooms.length; i++) {
        let currentCluster = [];
        let totalBedsCount = 0;

        for (let j = i; j < floorRooms.length; j++) {
          const room = floorRooms[j];
          if (room.availableBedsCount > 0) {
            currentCluster.push(room);
            totalBedsCount += room.availableBedsCount;

            // If we have enough open beds, check if wing matches (adjacent wing rule)
            if (totalBedsCount >= groupSize) {
              const allSameWing = currentCluster.every(r => r.wing === currentCluster[0].wing);
              if (allSameWing) {
                recommendations.push({
                  floor: parseInt(floorNum),
                  wing: currentCluster[0].wing || 'Main',
                  roomsNeeded: currentCluster.length,
                  totalAvailableBeds: totalBedsCount,
                  rooms: currentCluster.map(r => ({
                    roomId: r.roomId,
                    roomNumber: r.roomNumber,
                    openBeds: r.availableBedsCount
                  }))
                });
              }
              break; // Break sub-loop, move to next slide
            }
          } else {
            // Room is fully occupied, break adjacency window
            break;
          }
        }
      }
    });

    // Sort suggestions by fewest rooms needed (most condensed arrangement first)
    recommendations.sort((a, b) => a.roomsNeeded - b.roomsNeeded);

    res.json({
      groupSize,
      category: studentCategory,
      suggestions: recommendations.slice(0, 5) // Return top 5 suggestions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

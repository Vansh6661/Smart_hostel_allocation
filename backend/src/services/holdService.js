const Room = require('../models/Room');
const Hold = require('../models/Hold');
const Student = require('../models/Student');
const CategoryCapacityRule = require('../models/CategoryCapacityRule');
const redis = require('./redisClient');

/**
 * Atomically create a hold on a bed for a student.
 */
async function createHold(studentId, roomId, bedNumber, groupRef = null) {
  // 1. Fetch student to verify category eligibility
  const student = await Student.findById(studentId);
  if (!student) {
    throw new Error('Student not found.');
  }

  // Fetch allowed capacities for this student's category
  const rule = await CategoryCapacityRule.findOne({ category: student.category });
  if (!rule) {
    throw new Error('Eligibility rules not found for your category.');
  }
  const allowedCapacitiesNumbers = rule.allowedCapacities.map(c => c === 'single' ? 1 : c === 'double' ? 2 : 3);

  // Check if student already has a hold or booking
  const existingHold = await Hold.findOne({ studentRef: studentId });
  if (existingHold) {
    throw new Error('You already have a bed held or booked. Release it first.');
  }

  // 2. Perform atomic update in Room collection.
  // We only claim the bed if the bed status is 'open', building matches, and room category matches student category
  const room = await Room.findOneAndUpdate(
    {
      _id: roomId,
      category: student.category,
      capacity: { $in: allowedCapacitiesNumbers },
      'beds.bedNumber': bedNumber,
      'beds.status': 'open'
    },
    {
      $set: {
        'beds.$.status': 'held',
        'beds.$.studentRef': studentId
      }
    },
    {
      new: true // Return updated document to grab bed subdocument ID
    }
  );

  if (!room) {
    throw new Error('Bed is no longer available or you are not eligible for this room category.');
  }

  // Find the specific bed ID from the returned room schema
  const bed = room.beds.find(b => b.bedNumber === bedNumber);
  const bedId = bed._id;

  // 3. Create the Hold record
  const holdDurationMs = 5 * 60 * 1000; // 5 minutes hold
  const expiresAt = new Date(Date.now() + holdDurationMs);

  let hold;
  try {
    hold = new Hold({
      roomId: room._id,
      bedId,
      bedNumber,
      studentRef: studentId,
      groupRef,
      expiresAt,
      status: 'pending'
    });
    await hold.save();

    // Cache the hold status in Redis for fast read-throughs
    const cacheKey = `hold:${roomId}:${bedNumber}`;
    await redis.set(cacheKey, JSON.stringify({ studentId, expiresAt }), 'EX', 300); // 5 mins cache
  } catch (error) {
    // ROLLBACK room bed status to open if hold registration failed
    await Room.updateOne(
      { _id: roomId, 'beds.bedNumber': bedNumber },
      {
        $set: {
          'beds.$.status': 'open',
          'beds.$.studentRef': null
        }
      }
    );
    throw new Error('Failed to register hold: ' + error.message);
  }

  return hold;
}

/**
 * Confirm a booking from an active hold.
 */
async function confirmBooking(studentId, roomId, bedNumber) {
  // Find hold
  const hold = await Hold.findOne({
    roomId,
    bedNumber,
    studentRef: studentId,
    status: 'pending'
  });

  if (!hold) {
    throw new Error('Active hold not found or expired.');
  }

  // 1. Mark bed as booked in Room
  const roomUpdate = await Room.findOneAndUpdate(
    {
      _id: roomId,
      'beds.bedNumber': bedNumber,
      'beds.studentRef': studentId
    },
    {
      $set: {
        'beds.$.status': 'booked'
      }
    },
    { new: true }
  );

  if (!roomUpdate) {
    throw new Error('Failed to update room booking status.');
  }

  // 2. Set hold status to confirmed (or delete, but keeping confirmed logs it for auditing)
  hold.status = 'confirmed';
  // Extend expiration so TTL doesn't wipe it out, or remove TTL
  hold.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Set far in future
  await hold.save();

  // 3. Link booked bed inside student profile
  await Student.findByIdAndUpdate(studentId, {
    bookedBed: {
      buildingId: roomUpdate.building,
      roomId,
      bedNumber
    }
  });

  // 4. Update Redis cache key
  const cacheKey = `hold:${roomId}:${bedNumber}`;
  await redis.set(cacheKey, JSON.stringify({ studentId, status: 'booked' }));

  return hold;
}

/**
 * Rollback/release hold. Used manually or by scheduled cleanup checks.
 */
async function releaseHold(holdId) {
  const hold = await Hold.findById(holdId);
  if (!hold) return;

  // 1. Reset Room bed status
  await Room.updateOne(
    { _id: hold.roomId, 'beds.bedNumber': hold.bedNumber, 'beds.status': 'held' },
    {
      $set: {
        'beds.$.status': 'open',
        'beds.$.studentRef': null
      }
    }
  );

  // 2. Clear Redis cache
  const cacheKey = `hold:${hold.roomId}:${hold.bedNumber}`;
  await redis.del(cacheKey);

  // 3. Delete hold document
  await Hold.findByIdAndDelete(holdId);
}

/**
 * Lazy cleanup handler. Scans rooms for 'held' status and verifies against active holds database.
 * Resets any orphaned beds back to 'open'.
 */
async function cleanOrphanedHolds() {
  const heldRooms = await Room.find({ 'beds.status': 'held' });
  for (const room of heldRooms) {
    for (const bed of room.beds) {
      if (bed.status === 'held') {
        const activeHold = await Hold.findOne({
          roomId: room._id,
          bedNumber: bed.bedNumber,
          expiresAt: { $gt: new Date() }
        });

        // If no active hold exists, revert bed status
        if (!activeHold) {
          await Room.updateOne(
            { _id: room._id, 'beds.bedNumber': bed.bedNumber },
            {
              $set: {
                'beds.$.status': 'open',
                'beds.$.studentRef': null
              }
            }
          );
          const cacheKey = `hold:${room._id}:${bed.bedNumber}`;
          await redis.del(cacheKey);
          console.log(`Reverted orphaned bed hold for Room ${room.roomNumber}, Bed ${bed.bedNumber}`);
        }
      }
    }
  }
}

module.exports = {
  createHold,
  confirmBooking,
  releaseHold,
  cleanOrphanedHolds
};

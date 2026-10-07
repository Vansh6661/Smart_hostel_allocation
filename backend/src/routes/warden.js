const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const PDFDocument = require('pdfkit');
const Building = require('../models/Building');
const Room = require('../models/Room');
const Student = require('../models/Student');
const CategoryCapacityRule = require('../models/CategoryCapacityRule');
const Hold = require('../models/Hold');
const AuditLog = require('../models/AuditLog');
const { auth, requireRole } = require('../middleware/auth');

// Restrict all routes in this file to Warden
router.use(auth, requireRole('warden'));

// 1. Create a Building
router.post('/buildings', async (req, res) => {
  try {
    const { name, totalFloors, genderRestriction, description } = req.body;
    const building = new Building({ name, totalFloors, genderRestriction, description });
    await building.save();
    res.status(201).json(building);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 2. Create a Room (automatically populates beds based on capacity)
router.post('/rooms', async (req, res) => {
  try {
    const { roomNumber, buildingId, floor, wing, category, capacity } = req.body;

    // Validate category capacity rule
    const capNum = parseInt(capacity);
    const capacityString = capNum === 1 ? 'single' : capNum === 2 ? 'double' : capNum === 3 ? 'triple' : '';
    const rule = await CategoryCapacityRule.findOne({ category });
    if (!rule || !rule.allowedCapacities.includes(capacityString)) {
      return res.status(400).json({ error: 'Invalid capacity for this student category.' });
    }

    const building = await Building.findById(buildingId);
    if (!building) {
      return res.status(400).json({ error: 'Selected building does not exist.' });
    }

    // Auto-create beds
    const beds = [];
    for (let i = 1; i <= parseInt(capacity); i++) {
      beds.push({
        bedNumber: `${roomNumber}-${String.fromCharCode(64 + i)}`, // e.g. 101-A, 101-B
        status: 'open',
        studentRef: null
      });
    }

    const room = new Room({
      roomNumber,
      building: buildingId,
      floor,
      wing,
      category,
      capacity,
      beds
    });

    await room.save();
    res.status(201).json(room);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 3. One-Click Excel Export of the Full Hostel Allocation Map
router.get('/export', async (req, res) => {
  try {
    const rooms = await Room.find({}).populate('building').populate('beds.studentRef');
    
    const rows = [];
    rooms.forEach(room => {
      room.beds.forEach(bed => {
        const student = bed.studentRef;
        rows.push({
          'Hostel Building': room.building?.name || 'N/A',
          'Gender Restriction': room.building?.genderRestriction?.toUpperCase() || 'N/A',
          'Floor': room.floor,
          'Wing': room.wing || 'Main',
          'Room Number': room.roomNumber,
          'Room Category': room.category,
          'Bed Number': bed.bedNumber,
          'Bed Status': bed.status.toUpperCase(),
          'Allotted Student': student ? student.name : 'VACANT',
          'Student Reg No': student ? student.registerNumber : 'N/A',
          'Student Email': student ? student.email : 'N/A'
        });
      });
    });

    // Create Excel Workbook
    const worksheet = xlsx.utils.json_to_sheet(rows);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Room Allocation Report');

    // Generate buffer
    const excelBuffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Hostel_Allocation_Report.xlsx"');
    res.send(excelBuffer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate Excel report: ' + error.message });
  }
});

// 4. Get Category Capacity Rules
router.get('/rules', async (req, res) => {
  try {
    const rules = await CategoryCapacityRule.find({});
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Update Category Capacity Rules
router.post('/rules', async (req, res) => {
  try {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ error: 'Rules must be an array of rule configurations.' });
    }
    for (const ruleData of rules) {
      await CategoryCapacityRule.findOneAndUpdate(
        { category: ruleData.category },
        { allowedCapacities: ruleData.allowedCapacities },
        { upsert: true, new: true }
      );
    }
    const updatedRules = await CategoryCapacityRule.find({});
    res.json(updatedRules);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 6. Get all rooms within a specific building
router.get('/buildings/:buildingId/rooms', async (req, res) => {
  try {
    const rooms = await Room.find({ building: req.params.buildingId }).sort({ roomNumber: 1 });
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Get a single room with populated occupant info
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId).populate('building').populate('beds.studentRef');
    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Search students for manual assignment
router.get('/students/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.json([]);
    }
    const students = await Student.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { registerNumber: { $regex: query, $options: 'i' } }
      ]
    }).limit(10);
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Assign student manually to a bed (bypasses hold flow)
router.post('/rooms/:roomId/beds/:bedNumber/assign', async (req, res) => {
  try {
    const { roomId, bedNumber } = req.params;
    const { studentId } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // 1. Clear any active student holds
    await Hold.deleteMany({ studentRef: studentId });

    // 2. Clear student's existing bed bookings elsewhere to avoid duplicates
    await Room.updateMany(
      { 'beds.studentRef': studentId },
      { $set: { 'beds.$.status': 'open', 'beds.$.studentRef': null } }
    );

    // 3. Place student directly in the target bed
    const room = await Room.findOneAndUpdate(
      {
        _id: roomId,
        'beds.bedNumber': bedNumber
      },
      {
        $set: {
          'beds.$.status': 'booked',
          'beds.$.studentRef': studentId
        }
      },
      { new: true }
    ).populate('building').populate('beds.studentRef');

    if (!room) {
      return res.status(404).json({ error: 'Room or bed not found.' });
    }

    // Find the bed subdocument to log its ID
    const bed = room.beds.find(b => b.bedNumber === bedNumber);

    // 4. Save audit log record
    const log = new AuditLog({
      wardenId: req.user._id,
      action: 'assign',
      bedId: bed._id,
      studentId: studentId
    });
    await log.save();

    res.json({ message: 'Student assigned successfully.', room });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 10. Remove student manually from a bed
router.post('/rooms/:roomId/beds/:bedNumber/remove', async (req, res) => {
  try {
    const { roomId, bedNumber } = req.params;

    // Fetch the room to inspect the occupying student
    const currentRoom = await Room.findById(roomId);
    if (!currentRoom) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const bedDoc = currentRoom.beds.find(b => b.bedNumber === bedNumber);
    if (!bedDoc) {
      return res.status(404).json({ error: 'Bed not found.' });
    }

    const studentId = bedDoc.studentRef;
    if (studentId) {
      // Clear any active holds
      await Hold.deleteMany({ studentRef: studentId });

      // *** KEY FIX: clear bookedBed on the Student document so their session reflects removal ***
      await Student.findByIdAndUpdate(studentId, { $set: { bookedBed: null } });

      // Save audit log record
      const log = new AuditLog({
        wardenId: req.user._id,
        action: 'remove',
        bedId: bedDoc._id,
        studentId: studentId
      });
      await log.save();
    }

    // Set the bed back to open
    const room = await Room.findOneAndUpdate(
      {
        _id: roomId,
        'beds.bedNumber': bedNumber
      },
      {
        $set: {
          'beds.$.status': 'open',
          'beds.$.studentRef': null
        }
      },
      { new: true }
    ).populate('building').populate('beds.studentRef');

    res.json({ message: 'Student removed successfully.', room });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 11. Export Executive Summary Report (PDF)
router.get('/export-pdf', async (req, res) => {
  try {
    const buildings = await Building.find({});
    const rooms = await Room.find({});
    
    // Calculate summary statistics
    let totalBeds = 0;
    let bookedBeds = 0;
    let heldBeds = 0;
    
    const buildingStats = [];
    for (const b of buildings) {
      const bRooms = rooms.filter(r => r.building.toString() === b._id.toString());
      let bTotal = 0;
      let bBooked = 0;
      let bHeld = 0;
      bRooms.forEach(r => {
        r.beds.forEach(bed => {
          bTotal++;
          if (bed.status === 'booked') bBooked++;
          else if (bed.status === 'held') bHeld++;
        });
      });
      const bOccupancy = bTotal > 0 ? Math.round((bBooked / bTotal) * 100) : 0;
      buildingStats.push({
        name: b.name,
        gender: b.genderRestriction,
        total: bTotal,
        booked: bBooked,
        held: bHeld,
        occupancy: bOccupancy
      });
      totalBeds += bTotal;
      bookedBeds += bBooked;
      heldBeds += bHeld;
    }
    const overallOccupancy = totalBeds > 0 ? Math.round((bookedBeds / totalBeds) * 100) : 0;

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="Hostel_Allocation_Executive_Summary.pdf"');
    doc.pipe(res);
    
    // Title
    doc.fillColor('#2563EB')
       .fontSize(22)
       .text('Bennett University Hostel Allocation Summary Report', { align: 'center' });
    
    doc.fontSize(10)
       .fillColor('#374151')
       .text('Digital hostel room allocation — replacing manual, Excel-based assignment', { align: 'center' })
       .moveDown(2);
    
    // Metadata block
    doc.fontSize(8)
       .fillColor('#6B7280')
       .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' })
       .moveDown(1);
    
    // Divider line
    doc.strokeColor('#E5E7EB')
       .lineWidth(1)
       .moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke()
       .moveDown(1.5);
    
    // Summary Cards block
    const startY = doc.y;
    const cardWidth = 110;
    const gap = 15;
    
    const drawCard = (x, title, val) => {
      doc.rect(x, startY, cardWidth, 60)
         .fillColor('#F9FAFB')
         .fill()
         .strokeColor('#E5E7EB')
         .stroke();
      
      doc.fillColor('#6B7280')
         .fontSize(7)
         .text(title.toUpperCase(), x + 10, startY + 12, { width: cardWidth - 20, align: 'center' });
         
      doc.fillColor('#2563EB')
         .fontSize(16)
         .text(val, x + 10, startY + 28, { width: cardWidth - 20, align: 'center', bold: true });
    };
    
    drawCard(50, 'Total Blocks', `${buildings.length}`);
    drawCard(50 + cardWidth + gap, 'Total Beds', `${totalBeds}`);
    drawCard(50 + (cardWidth + gap) * 2, 'Total Booked', `${bookedBeds}`);
    drawCard(50 + (cardWidth + gap) * 3, 'Overall Occupancy', `${overallOccupancy}%`);
    
    doc.y = startY + 80;
    
    // Divider line
    doc.strokeColor('#E5E7EB')
       .lineWidth(1)
       .moveTo(50, doc.y)
       .lineTo(550, doc.y)
       .stroke()
       .moveDown(1.5);
    
    // Table Header
    doc.fillColor('#111111')
       .fontSize(12)
       .text('Building Occupancy Overview', { bold: true })
       .moveDown(1);
       
    const tableTop = doc.y;
    doc.fontSize(8).fillColor('#4B5563');
    
    const col1 = 50;
    const col2 = 140;
    const col3 = 220;
    const col4 = 300;
    const col5 = 380;
    const col6 = 460;
    
    doc.text('BLOCK NAME', col1, tableTop);
    doc.text('GENDER', col2, tableTop);
    doc.text('TOTAL BEDS', col3, tableTop);
    doc.text('BOOKED', col4, tableTop);
    doc.text('HELD', col5, tableTop);
    doc.text('OCCUPANCY', col6, tableTop);
    
    doc.strokeColor('#9CA3AF')
       .lineWidth(1)
       .moveTo(50, tableTop + 15)
       .lineTo(550, tableTop + 15)
       .stroke();
       
    let currentY = tableTop + 25;
    
    buildingStats.forEach(b => {
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }
      
      doc.fillColor('#111111').text(b.name, col1, currentY);
      doc.text(b.gender.toUpperCase(), col2, currentY);
      doc.text(`${b.total}`, col3, currentY);
      doc.text(`${b.booked}`, col4, currentY);
      doc.text(`${b.held}`, col5, currentY);
      doc.fillColor('#2563EB').text(`${b.occupancy}%`, col6, currentY);
      
      doc.strokeColor('#E5E7EB')
         .lineWidth(0.5)
         .moveTo(50, currentY + 15)
         .lineTo(550, currentY + 15)
         .stroke();
         
      currentY += 22;
    });
    
    doc.end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate PDF report: ' + error.message });
  }
});

module.exports = router;

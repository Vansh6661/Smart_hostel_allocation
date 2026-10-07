require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Building = require('./models/Building');
const Room = require('./models/Room');
const Student = require('./models/Student');
const Warden = require('./models/Warden');
const Hold = require('./models/Hold');
const Group = require('./models/Group');
const CategoryCapacityRule = require('./models/CategoryCapacityRule');
const AuditLog = require('./models/AuditLog');

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-hostel-allocation';

async function seed() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // Clear existing data
    console.log('Clearing existing data...');
    await Building.deleteMany({});
    await Room.deleteMany({});
    await Student.deleteMany({});
    await Warden.deleteMany({});
    await Hold.deleteMany({});
    await Group.deleteMany({});
    await CategoryCapacityRule.deleteMany({});
    await AuditLog.deleteMany({});

    console.log('Inserting Warden...');
    const hashedPassword = await bcrypt.hash('password123', 8);
    const warden = new Warden({
      name: 'Warden Ramesh',
      email: 'warden@bennett.edu.in',
      password: hashedPassword
    });
    await warden.save();
    console.log('Warden created: warden@bennett.edu.in / password123');

    console.log('Inserting Students...');
    const studentUg = new Student({
      name: 'Amit Patel',
      registerNumber: '20BCE0100',
      email: 'student.ug@bennett.edu.in',
      password: hashedPassword,
      category: 'UG'
    });
    const studentPg = new Student({
      name: 'Pooja Rao',
      registerNumber: '20MCE0200',
      email: 'student.pg@bennett.edu.in',
      password: hashedPassword,
      category: 'PG'
    });
    const studentPhd = new Student({
      name: 'Dr. Rahul Sen',
      registerNumber: '20PHD0300',
      email: 'student.phd@bennett.edu.in',
      password: hashedPassword,
      category: 'PhD'
    });
    await studentUg.save();
    await studentPg.save();
    await studentPhd.save();
    console.log('Students created.');

    // Generate dummy student pool to populate occupancy rate dynamically
    console.log('Generating dummy student pool...');
    const dummyStudents = [];
    const firstNames = ['Amit', 'Raj', 'Rahul', 'Aditi', 'Neha', 'Priya', 'Karan', 'Siddharth', 'Varun', 'Ananya', 'Rohan', 'Sneha', 'Vikram', 'Pooja', 'Tanvi', 'Abhishek', 'Meera', 'Riya', 'Ishaan', 'Dev'];
    const lastNames = ['Patel', 'Sharma', 'Rao', 'Sen', 'Mehra', 'Gupta', 'Verma', 'Singh', 'Kapoor', 'Joshi', 'Choudhury', 'Iyer', 'Reddy', 'Nair', 'Dwivedi', 'Pandey', 'Saxena'];
    
    for (let sIdx = 1; sIdx <= 600; sIdx++) {
      const fName = firstNames[Math.floor(Math.random() * firstNames.length)];
      const lName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const cat = sIdx % 3 === 0 ? 'PhD' : sIdx % 3 === 1 ? 'PG' : 'UG';
      const email = `dummy.student.${sIdx}@bennett.edu.in`;
      
      const dummyStudent = new Student({
        name: `${fName} ${lName}`,
        registerNumber: `20BCE${1000 + sIdx}`,
        email,
        password: hashedPassword,
        category: cat
      });
      await dummyStudent.save();
      dummyStudents.push(dummyStudent);
    }
    console.log(`Successfully created ${dummyStudents.length} dummy student records.`);

    console.log('Inserting default CategoryCapacityRules...');
    const rules = [
      { category: 'UG', allowedCapacities: ['triple'] },
      { category: 'PG', allowedCapacities: ['double', 'triple'] },
      { category: 'PhD', allowedCapacities: ['single', 'double', 'triple'] }
    ];
    for (const ruleData of rules) {
      const rule = new CategoryCapacityRule(ruleData);
      await rule.save();
    }
    console.log('CategoryCapacityRules seeded.');

    console.log('Generating Bennett University Hostel Blocks...');
    
    // Boys Hostel Blocks: C-1 to C-12
    const boysBlocks = [];
    for (let i = 1; i <= 12; i++) {
      boysBlocks.push({
        name: `Block C-${i}`,
        totalFloors: 3,
        genderRestriction: 'boys',
        description: `Boys Hostel Block C-${i}`
      });
    }

    // Girls Hostel Blocks: D-1 to D-6
    const girlsBlocks = [];
    for (let i = 1; i <= 6; i++) {
      girlsBlocks.push({
        name: `Block D-${i}`,
        totalFloors: 3,
        genderRestriction: 'girls',
        description: `Girls Hostel Block D-${i}`
      });
    }

    const allBlocksData = [...boysBlocks, ...girlsBlocks];
    const createdBuildings = [];

    for (const bData of allBlocksData) {
      const building = new Building(bData);
      await building.save();
      createdBuildings.push(building);
    }
    console.log(`Successfully created ${createdBuildings.length} buildings.`);

    console.log('Generating Rooms and Beds with varied occupancies for each block...');
    
    for (const b of createdBuildings) {
      // Determine a target occupancy rate for this block (between 30% and 70%)
      const blockOccupancyRate = 0.3 + (Math.random() * 0.4);

      for (let floor = 1; floor <= 3; floor++) {
        // 10 rooms per floor: Wing A (rooms 1-5) and Wing B (rooms 6-10)
        // Mix of UG triple, UG triple, PG double, PhD single per wing
        const roomsToCreate = [
          // Wing A
          { roomNum: 1,  wing: 'A', category: 'UG',  capacity: 3 },
          { roomNum: 2,  wing: 'A', category: 'UG',  capacity: 3 },
          { roomNum: 3,  wing: 'A', category: 'PG',  capacity: 2 },
          { roomNum: 4,  wing: 'A', category: 'PG',  capacity: 2 },
          { roomNum: 5,  wing: 'A', category: 'PhD', capacity: 1 },
          // Wing B
          { roomNum: 6,  wing: 'B', category: 'UG',  capacity: 3 },
          { roomNum: 7,  wing: 'B', category: 'UG',  capacity: 3 },
          { roomNum: 8,  wing: 'B', category: 'PG',  capacity: 2 },
          { roomNum: 9,  wing: 'B', category: 'PG',  capacity: 2 },
          { roomNum: 10, wing: 'B', category: 'PhD', capacity: 1 },
        ];

        for (const rSpec of roomsToCreate) {
          // Zero-pad room number: floor 1 room 10 → "110", floor 2 room 6 → "206"
          const roomNumberStr = `${floor}${rSpec.roomNum < 10 ? '0' : ''}${rSpec.roomNum}`;
          
          const beds = [];
          for (let bNum = 1; bNum <= rSpec.capacity; bNum++) {
            const randVal = Math.random();
            let bedStatus = 'open';
            let assignedStudent = null;

            if (randVal < blockOccupancyRate) {
              const isBooked = Math.random() < 0.85;
              bedStatus = isBooked ? 'booked' : 'held';
              
              // Pop a student from dummyStudents pool matching room category
              const matchingStudentIdx = dummyStudents.findIndex(std => std.category === rSpec.category && !std.isAssigned);
              if (matchingStudentIdx !== -1) {
                assignedStudent = dummyStudents[matchingStudentIdx];
                assignedStudent.isAssigned = true;
              }
            }

            beds.push({
              bedNumber: `${roomNumberStr}-${String.fromCharCode(64 + bNum)}`,
              status: bedStatus,
              studentRef: assignedStudent ? assignedStudent._id : null
            });
          }

          const room = new Room({
            roomNumber: roomNumberStr,
            building: b._id,
            floor,
            wing: rSpec.wing,
            category: rSpec.category,
            capacity: rSpec.capacity,
            beds
          });
          await room.save();
        }
      }
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    mongoose.disconnect();
  }
}

seed();

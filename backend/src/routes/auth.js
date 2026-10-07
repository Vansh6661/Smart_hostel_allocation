const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Student = require('../models/Student');
const Warden = require('../models/Warden');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_token_key_change_me';

// Student Register
router.post('/student/register', async (req, res) => {
  try {
    const { name, registerNumber, email, password, category } = req.body;
    
    // TODO: Replace with Microsoft Entra ID (Azure AD) SSO restricted to bennett.edu.in tenant — domain-check is a temporary placeholder, so it's obvious this needs to be swapped later.
    const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'college.edu.in';
    if (!email || !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
      return res.status(400).json({ error: 'Please register with your university email address.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 8);
    
    const student = new Student({
      name,
      registerNumber,
      email,
      password: hashedPassword,
      category
    });

    await student.save();
    const token = jwt.sign({ id: student._id, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
    
    res.status(201).json({ student: { id: student._id, name, email, category, role: 'student' }, token });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed: ' + error.message });
  }
});

// Student Login
router.post('/student/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const token = jwt.sign({ id: student._id, role: 'student' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      user: {
        id: student._id,
        name: student.name,
        email: student.email,
        category: student.category,
        role: 'student',
        bookedBed: student.bookedBed,
        groupRef: student.groupRef
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Warden Register (Seeding / Initial Setup)
router.post('/warden/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 8);
    
    const warden = new Warden({
      name,
      email,
      password: hashedPassword
    });

    await warden.save();
    const token = jwt.sign({ id: warden._id, role: 'warden' }, JWT_SECRET, { expiresIn: '24h' });
    
    res.status(201).json({ warden: { id: warden._id, name, email, role: 'warden' }, token });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed: ' + error.message });
  }
});

// Warden Login
router.post('/warden/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const warden = await Warden.findOne({ email });
    if (!warden) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const isMatch = await bcrypt.compare(password, warden.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid login credentials' });
    }

    const token = jwt.sign({ id: warden._id, role: 'warden' }, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      user: {
        id: warden._id,
        name: warden.name,
        email: warden.email,
        role: 'warden'
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

const { auth } = require('../middleware/auth');

// GET /auth/me — returns fresh student profile from DB (used to re-sync after warden overrides)
router.get('/me', auth, async (req, res) => {
  try {
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Only students can use this endpoint.' });
    }
    const student = await Student.findById(req.user._id).select('-password');
    if (!student) return res.status(404).json({ error: 'Student not found.' });
    res.json({
      id: student._id,
      name: student.name,
      email: student.email,
      registerNumber: student.registerNumber,
      category: student.category,
      role: 'student',
      bookedBed: student.bookedBed || null,
      groupRef: student.groupRef || null
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

module.exports = router;

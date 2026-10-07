const jwt = require('jsonwebtoken');
const Student = require('../models/Student');
const Warden = require('../models/Warden');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No authentication token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_jwt_token_key_change_me');
    
    // Check if warden or student
    let user = null;
    if (decoded.role === 'warden') {
      user = await Warden.findById(decoded.id);
    } else if (decoded.role === 'student') {
      user = await Student.findById(decoded.id);
    }

    if (!user) {
      return res.status(401).json({ error: 'User not found or session expired.' });
    }

    req.user = user;
    req.token = token;
    req.role = decoded.role;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Please authenticate.' });
  }
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (req.role !== role) {
      return res.status(430).json({ error: `Access denied. Requires '${role}' privilege.` });
    }
    next();
  };
};

module.exports = { auth, requireRole };

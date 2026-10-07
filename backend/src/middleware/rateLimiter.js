const rateLimit = require('express-rate-limit');

// Rate limiter for high-traffic allocation endpoints (creating holds / bookings)
const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 hold/booking requests per windowMs
  message: {
    error: 'Too many booking attempts. Please wait a moment before trying again.'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

module.exports = { bookingLimiter };

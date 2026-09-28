const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const leadRoutes = require('./routes/leadRoutes');
const outreachRoutes = require('./routes/outreachRoutes');
const contentRoutes = require('./routes/contentRoutes');
const inboxRoutes = require('./routes/inboxRoutes');
const webhookRoutes = require('./routes/webhookRoutes');
const finderRoutes = require('./routes/finderRoutes');
const cronRoutes = require('./routes/cronRoutes');
const unsubscribeRoutes = require('./routes/unsubscribeRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Security + parsing middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(
  express.json({
    limit: '5mb', // room for CSV imports
    // Keep the exact bytes too - Meta webhook signatures are computed over the raw body
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  // Hide ?key=... (cron secret) from request logs
  morgan.token('safe-url', (req) => (req.originalUrl || req.url).replace(/([?&]key=)[^&]*/i, '$1***'));
  app.use(morgan(':method :safe-url :status :response-time ms'));
}

// Basic rate limiting (protects login/register from brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { success: false, message: 'Too many requests, please try again later' },
});
app.use('/api/auth', authLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'AI CRM API is running' });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/outreach', outreachRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/finder', finderRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/unsubscribe', unsubscribeRoutes);

// 404 + error handler (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;

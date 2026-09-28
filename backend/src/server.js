require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { startFollowUpScheduler } = require('./jobs/followUpScheduler');
const { startContentScheduler } = require('./jobs/contentScheduler');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`AI CRM backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });

  // Auto follow-up scheduler - opt-in via .env so it doesn't fire (and
  // fail on missing API keys) until you've actually configured Resend/WhatsApp.
  if (process.env.ENABLE_AUTO_FOLLOWUP === 'true') {
    startFollowUpScheduler();
  }

  // Content Agent: publishes scheduled posts, daily AI post generation,
  // metrics sync. Opt-in, same reason as above.
  if (process.env.ENABLE_CONTENT_AGENT === 'true') {
    startContentScheduler();
  }
});

// Safety nets so the process doesn't die silently
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
});

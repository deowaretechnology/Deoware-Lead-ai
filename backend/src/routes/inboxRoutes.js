const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  listConversations,
  unreadCount,
  getConversation,
  draftReply,
  reply,
  createLead,
  updateConversation,
  simulate,
} = require('../controllers/inboxController');

router.use(protect);

router.get('/conversations', listConversations);
router.get('/unread-count', unreadCount);
router.post('/simulate', simulate);

router.route('/conversations/:id').get(getConversation).patch(updateConversation);
router.post('/conversations/:id/draft', draftReply);
router.post('/conversations/:id/reply', reply);
router.post('/conversations/:id/lead', createLead);

module.exports = router;

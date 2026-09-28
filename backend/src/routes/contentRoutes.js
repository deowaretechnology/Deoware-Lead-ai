const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getBrand,
  updateBrand,
  generate,
  listPosts,
  createPost,
  updatePost,
  deletePost,
  schedulePost,
  unschedulePost,
  publishNow,
  refreshMetrics,
} = require('../controllers/contentController');

router.use(protect);

router.route('/brand').get(getBrand).put(updateBrand);
router.post('/generate', generate);

router.route('/').get(listPosts).post(createPost);
router.route('/:id').put(updatePost).delete(deletePost);

router.post('/:id/schedule', schedulePost);
router.post('/:id/unschedule', unschedulePost);
router.post('/:id/publish', publishNow);
router.post('/:id/metrics', refreshMetrics);

module.exports = router;

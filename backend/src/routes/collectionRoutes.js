const express = require('express');
const router = express.Router();
const collectionController = require('../controllers/collectionController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.post('/preview', collectionController.previewCollection);
router.post('/', collectionController.recordCollection);
router.get('/', collectionController.listCollections);
router.get('/:id/receipt', collectionController.getReceipt);
router.post('/:id/reverse', collectionController.reverseCollection);
router.delete('/:id', collectionController.deleteCollection);

module.exports = router;

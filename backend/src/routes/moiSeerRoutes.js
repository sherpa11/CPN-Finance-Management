const express = require('express');
const router = express.Router();
const moiSeerController = require('../controllers/moiSeerController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Dashboard summary
router.get('/summary', moiSeerController.getSummary);

// Lookups / Autocomplete
router.get('/locations', moiSeerController.getLocations);
router.get('/materials', moiSeerController.getMaterials);

// Reports
router.get('/reports', moiSeerController.getReports);

// Persons
router.get('/persons', moiSeerController.getPersons);
router.post('/persons', moiSeerController.createPerson);
router.get('/persons/:id', moiSeerController.getPersonById);
router.put('/persons/:id', moiSeerController.updatePerson);

// Contributions
router.get('/contributions', moiSeerController.getContributions);
router.post('/contributions', moiSeerController.createContribution);
router.put('/contributions/:id', moiSeerController.updateContribution);
router.delete('/contributions/:id', moiSeerController.deleteContribution);

module.exports = router;

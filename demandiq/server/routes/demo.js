const express = require('express');
const router = express.Router();
const { seed } = require('../db/seed');

router.post('/reset', (req, res) => {
  try {
    seed();
    res.json({
      success: true,
      message: 'Demo reset to default state',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

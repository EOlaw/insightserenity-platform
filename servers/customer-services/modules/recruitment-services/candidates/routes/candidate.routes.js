const express = require('express'); const router = express.Router(); router.get('/', (req, res) => res.json({ module: 'candidates' })); module.exports = router;

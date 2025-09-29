const express = require('express'); const router = express.Router(); router.get('/', (req, res) => res.json({ module: 'partnerships' })); module.exports = router;

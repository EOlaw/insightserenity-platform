/**
 * @fileoverview User Management Routes
 * @module servers/customer-services/modules/core-business/user-management/routes
 */

const express = require('express');
const router = express.Router();
const UserController = require('../controllers/user-controller');

// User routes
router.get('/', UserController.getUsers.bind(UserController));
router.get('/me', UserController.getCurrentUser.bind(UserController));
router.get('/search', UserController.searchUsers.bind(UserController));
router.get('/statistics', UserController.getUserStatistics.bind(UserController));
router.get('/export', UserController.exportUsers.bind(UserController));
router.get('/:id', UserController.getUserById.bind(UserController));

router.post('/', UserController.createUser.bind(UserController));
router.post('/bulk', UserController.bulkCreateUsers.bind(UserController));
router.post('/change-password', UserController.changePassword.bind(UserController));
router.post('/:id/avatar', UserController.uploadAvatar.bind(UserController));

router.put('/me', UserController.updateCurrentUser.bind(UserController));
router.put('/:id', UserController.updateUser.bind(UserController));

router.patch('/:id', UserController.updateUser.bind(UserController));

router.delete('/:id', UserController.deleteUser.bind(UserController));

module.exports = router;

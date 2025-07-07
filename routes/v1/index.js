const express = require('express');

const { InfoController } = require('../../controllers');
const bookingRouters = require('./booking-router')

const router = express.Router();

router.get('/info', InfoController.info);

router.use('/bookings', bookingRouters)

module.exports = router;
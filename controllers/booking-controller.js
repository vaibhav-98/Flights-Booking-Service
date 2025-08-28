const { StatusCodes } = require('http-status-codes')
const { BookingService} = require('../services')
const { SuccessResponse, ErrorResponse } = require("../utils/common");
const db = require('../models')

// const inMemDb = {};

async function createBooking(req, res) {
    
    try {
         
        const response = await BookingService.createBooking({
            flightId: req.body.flightId,
            userId: req.body.userId, // API Gateway -> Singin -> JWT -> userId 
            noOfSeats: req.body.noOfSeats
        });
        SuccessResponse.data = response;
        return res
                .status(StatusCodes.OK)
                .json(SuccessResponse);
    } catch(error) {
        ErrorResponse.error = error;
        return res
                .status(StatusCodes.INTERNAL_SERVER_ERROR)
                .json(ErrorResponse);
    }
}


async function makePayment(req, res) {
  try {
    const idempotencyKey = req.headers["x-idempotency-key"];

    if (!idempotencyKey) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Idempotency key missing" });
    }

    // ✅ Check if key already used
    const existing = await db.IdempotencyKey.findOne({
      where: { key: idempotencyKey },
    });

    if (existing) {
      return res.status(StatusCodes.OK).json(existing.response);
    }

    // ✅ Check if booking is already paid
    const booking = await db.Booking.findByPk(req.body.bookingId);
    if (booking && booking.status === "booked") {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: "Booking already paid ✅",
        data: booking,
      });
    }

    // ✅ Process payment
    const response = await BookingService.makePayment({
      totalCost: req.body.totalCost,
      userId: req.body.userId,
      bookingId: req.body.bookingId,
    });

    // ✅ Save idempotency key
    await db.IdempotencyKey.create({
      key: idempotencyKey,
      response: {
        success: true,
        data: response,
      },
    });

    SuccessResponse.data = response;
    return res.status(StatusCodes.OK).json(SuccessResponse);
  } catch (error) {
    console.error("Payment controller error:", error);
    ErrorResponse.error = error;
    return res
      .status(error.statusCode || StatusCodes.INTERNAL_SERVER_ERROR)
      .json(ErrorResponse);
  }
}module.exports = {
    createBooking,
    makePayment
}
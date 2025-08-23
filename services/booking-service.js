const axios = require('axios');
const { StatusCodes } = require('http-status-codes');

const PDFDocument = require("pdfkit");
const getStream = require("get-stream");

const { BookingRepository } = require('../repositories');
const { ServerConfig, Queue } = require('../config');
const db = require('../models');
const AppError = require('../utils/errors/app-error');
const { Enums } = require('../utils/common');
const { BOOKED, CANCELLED, INITIATED, PENDING } = Enums.BOOKING_SATTUS;

const bookingRepository = new BookingRepository();

/**
 * createBooking
 */
async function createBooking(data) {
  const transaction = await db.sequelize.transaction();
  try {
    const flight = await axios.get(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}`
    );
    const flightData = flight.data.data;

    if (data.noOfSeats > flightData.totalSeats) {
      throw new AppError("Not enough seats available", StatusCodes.BAD_REQUEST);
    }

    const totalBillingAmount = data.noOfSeats * flightData.price;
    const bookingPayload = { ...data, totalCost: totalBillingAmount };

    const booking = await bookingRepository.create(bookingPayload, transaction);

    await axios.patch(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${data.flightId}/seats`,
      { seats: data.noOfSeats }
    );

    await transaction.commit();
    return booking;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * Helper: Generate Ticket PDF 
 */
async function generateTicketPDF(booking, flight, fromName, toName, userName) {
  const doc = new PDFDocument();
  const buffers = [];

  doc.on("data", (chunk) => buffers.push(chunk));
  doc.on("end", () => {});

  // Header
  doc.fontSize(20).text(" Flight Ticket Confirmation", { align: "center" });
  doc.moveDown();

  // Passenger Info
  doc.fontSize(14).text(`Passenger: ${userName}`);
  doc.text(`Booking ID: ${booking.id}`);
  doc.text(`Flight: ${flight.flightNumber}`);
  doc.text(`From: ${fromName}`);
  doc.text(`To: ${toName}`);
  doc.text(`Departure: ${flight.departureTime}`);
  doc.text(`Seats: ${booking.noOfSeats}`);
  doc.text(`Total Paid: ₹${booking.totalCost}`);

  doc.moveDown().text(" Thank you for booking with us!", { align: "center" });

  doc.end();

  return new Promise((resolve, reject) => {
    const pdfBuffers = [];
    doc.on("data", pdfBuffers.push.bind(pdfBuffers));
    doc.on("end", () => resolve(Buffer.concat(pdfBuffers)));
    doc.on("error", reject);
  });
}


/**
 * makePayment
 */
async function makePayment(data) {
  

  const transaction = await db.sequelize.transaction();
  let committed = false; //  track commit state

  try {
    const bookingDetails = await bookingRepository.get(data.bookingId, transaction);

    if (!bookingDetails) throw new AppError("Booking not found", StatusCodes.NOT_FOUND);
    if (bookingDetails.status === CANCELLED) throw new AppError("The booking has expired", StatusCodes.BAD_REQUEST);

    const bookingTime = new Date(bookingDetails.createdAt);
    if (Date.now() - bookingTime.getTime() > 5 * 60 * 1000) {
      await cancelBooking(data.bookingId);
      throw new AppError("The booking has expired", StatusCodes.BAD_REQUEST);
    }

    if (Number(bookingDetails.totalCost) !== Number(data.totalCost)) {
      throw new AppError("Payment amount mismatch", StatusCodes.BAD_REQUEST);
    }

    if (bookingDetails.userId !== data.userId) {
      throw new AppError("The user corresponding to the booking doesnt match", StatusCodes.BAD_REQUEST);
    }

    //  Fetch flight details
    const flightResp = await axios.get(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${bookingDetails.flightId}`
    );
    const flight = flightResp.data?.data;

    let fromName = flight.departureAirportId;
    let toName = flight.arrivalAirportId;

    try {
      const depAirportResp = await axios.get(
        `${ServerConfig.FLIGHT_SERVICE}/api/v1/airports/${flight.departureAirportId}`
      );
      fromName = depAirportResp.data?.data?.name || fromName;

      const arrAirportResp = await axios.get(
        `${ServerConfig.FLIGHT_SERVICE}/api/v1/airports/${flight.arrivalAirportId}`
      );
      toName = arrAirportResp.data?.data?.name || toName;
    } catch (err) {
      console.warn("Could not fetch airport names:", err.message);
    }

    //  Fetch user details
    let email = "noreply@myapp.com";
    let userName = "Passenger";
    if (ServerConfig.USER_SERVICE) {
      try {
        const userResp = await axios.get(
          `${ServerConfig.USER_SERVICE}/api/v1/user/${bookingDetails.userId}`
        );
        email = userResp.data?.data?.email || email;
        userName = userResp.data?.data?.name || userName;
      } catch (err) {
        console.warn("Could not fetch user details:", err.message);
      }
    }

   // console.log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>  2 >>>>>>>>>>>");

    //  Update booking status
    await bookingRepository.update(data.bookingId, { status: BOOKED }, transaction);
    const updatedBooking = await bookingRepository.get(data.bookingId);

    await transaction.commit();
    committed = true; //  mark commit done

    // Generate PDF
    const pdfBuffer = await generateTicketPDF(updatedBooking, flight, fromName, toName, userName);

    //  Send Email with PDF
    await Queue.sendData({
      recepientEmail: email,
      subject: `Ticket Confirmation — Booking #${updatedBooking.id}`,
      text: `Hello ${userName},\n\nYour flight ticket is attached as PDF .\n\nSafe travels! `,
      attachments: [
        {
          filename: `ticket-${updatedBooking.id}.pdf`,
          content: pdfBuffer,
        },
      ],
      meta: { bookingId: updatedBooking.id, userId: updatedBooking.userId },
    });

    return updatedBooking;

  } catch (error) {
    if (!committed) {
      // rollback only if not already committed
    await transaction.rollback();
    }
    console.error("Payment API error:", error);
    throw error;
  }
}

/**
 * cancelBooking
 */
async function cancelBooking(bookingId) {
  const transaction = await db.sequelize.transaction();
  try {
    const bookingDetails = await bookingRepository.get(bookingId, transaction);

    if (!bookingDetails) {
      await transaction.commit();
      return true;
    }
    if (bookingDetails.status == CANCELLED) {
      await transaction.commit();
      return true;
    }

    await axios.patch(
      `${ServerConfig.FLIGHT_SERVICE}/api/v1/flights/${bookingDetails.flightId}/seats`,
      { seats: bookingDetails.noOfSeats, dec: false }
    );

    await bookingRepository.update(bookingId, { status: CANCELLED }, transaction);
    await transaction.commit();
    return true;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

/**
 * cancelOldBookings
 */
async function cancelOldBookings() {
  try {
    const time = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const expiredBookings = await bookingRepository.cancelOldBookings(time);
    return expiredBookings;
  } catch (err) {
    throw err;
  }
}

module.exports = {
  createBooking,
  makePayment,
  cancelBooking,
  cancelOldBookings,
};

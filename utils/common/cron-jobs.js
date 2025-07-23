const cron = require("node-cron");
const { cancelOldBookings } = require("../../services/booking-service"); // <-- direct import, not from index.js

function scheduleCrons() {
  cron.schedule("*/20 * * * *", async () => {
    console.log("Cron started...");
    try {
           await cancelOldBookings();
    //   console.log("Expired bookings:", expiredBookings);
    } catch (err) {
      console.error("Cron error:", err.message);
    }
  });
}

module.exports = scheduleCrons;

const { StatusCodes } = require('http-status-codes');
const { Op } = require('sequelize')

const { Booking } = require('../models');
const CrudRepository = require('./crude-repository')
const { Enums } = require('../utils/common')
const { BOOKED, CANCELLED,INITIATED,PENDING } = Enums.BOOKING_SATTUS;

class BookingRepository extends CrudRepository {
    constructor() {
        super(Booking)
    }

    async createBooking (data, transaction) {
        const response = await Booking.create(data, {transaction: transaction})
        return response;
    }

    async get(data, transaction) {
    const response = await Booking.findByPk(data,  {transaction: transaction});
    if(!response) {
        throw new AppError('Not able to found the resource',StatusCodes.NOT_FOUND )
    }
    return response;
  }

   async update(id, data, transaction) {
   const response = await Booking.update(data, {
    where: {
      id: id,
    },
   }, {transaction: transaction});
    return response
  }
  

  async cancelOldBookings(timestamp) {
  const response = await Booking.update({status:CANCELLED},{
    where: {
          [Op.and]: [
             {
                createdAt: { [Op.lt]: timestamp },
             },
             {
              status: {[Op.ne]: BOOKED}
            },
            {
              status: {[Op.ne]: CANCELLED}
            }
          ]
      
    }
  });
  return response;
}


}


module.exports= BookingRepository

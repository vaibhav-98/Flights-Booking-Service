const { StatusCodes } = require('http-status-codes');

const { Booking } = require('../models');
const CrudRepository = require('./crude-repository')

class BookingRepository extends CrudRepository {
    constructor() {
        super(Booking)
    }
}


module.exports= BookingRepository

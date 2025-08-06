const { StatusCodes } = require('http-status-codes');

const info = (req, res) => {
    return res.status(StatusCodes.OK).json({
        success: true,
        message: 'API is live for Booking Service',
        error: {},
        data: {},
    });
}

module.exports = {
    info
}
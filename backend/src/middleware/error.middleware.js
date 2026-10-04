const AppError = require("../utils/AppError");

function errorHandler(err, req, res, next) {
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";

    // Handle Mongoose CastError (e.g. invalid ObjectId)
    if (err.name === "CastError") {
        statusCode = 400;
        message = `Invalid format for field: ${err.path}`;
    }

    // Handle Mongoose duplicate key error (E11000)
    if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0] || "field";
        message = `Duplicate value entered for ${field}. It must be unique.`;
    }

    // Handle Mongoose validation errors
    if (err.name === "ValidationError") {
        statusCode = 400;
        message = Object.values(err.errors).map(val => val.message).join(", ");
    }

    // Handle JWT errors
    if (err.name === "JsonWebTokenError") {
        statusCode = 401;
        message = "Invalid authentication token";
    }
    if (err.name === "TokenExpiredError") {
        statusCode = 401;
        message = "Authentication token expired";
    }

    return res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack })
    });
}

module.exports = errorHandler;

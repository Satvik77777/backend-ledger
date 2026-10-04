const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const AppError = require("../utils/AppError");

async function authMiddleware(req, res, next) {
    try {
        const token = req.cookies?.accessToken || req.cookies?.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return next(new AppError("Unauthorized access, token is missing", 401));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.userId);

        if (!user) {
            return next(new AppError("User associated with this token no longer exists", 401));
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return next(new AppError("Access token expired. Please refresh your token.", 401));
        }
        return next(new AppError("Unauthorized access, token is invalid", 401));
    }
}

async function authSystemUserMiddleware(req, res, next) {
    try {
        const token = req.cookies?.accessToken || req.cookies?.token || req.headers.authorization?.split(" ")[1];

        if (!token) {
            return next(new AppError("Unauthorized access, token is missing", 401));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await userModel.findById(decoded.userId).select("+systemUser");

        if (!user) {
            return next(new AppError("User associated with this token no longer exists", 401));
        }

        if (!user.systemUser) {
            return next(new AppError("Forbidden access: Requires system user privileges", 403));
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === "TokenExpiredError") {
            return next(new AppError("Access token expired. Please refresh your token.", 401));
        }
        return next(new AppError("Unauthorized access, token is invalid", 401));
    }
}

module.exports = {
    authMiddleware,
    authSystemUserMiddleware
};
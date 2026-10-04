const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const userModel = require("../models/user.model");
const refreshTokenModel = require("../models/refreshToken.model");
const emailService = require("../services/email.service");
const AppError = require("../utils/AppError");

/**
 * Generate Access Token (15 mins) and Refresh Token (7 days)
 */
async function generateTokens(user) {
    const accessToken = jwt.sign(
        { userId: user._id, email: user.email, systemUser: user.systemUser },
        process.env.JWT_SECRET,
        { expiresIn: "15m" }
    );

    const rawRefreshToken = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await refreshTokenModel.create({
        token: rawRefreshToken,
        user: user._id,
        expiresAt
    });

    return { accessToken, refreshToken: rawRefreshToken };
}

/**
 * Helper to set cookies
 */
function setTokenCookies(res, accessToken, refreshToken) {
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "none" : "lax",
        maxAge: 15 * 60 * 1000 // 15 mins
    });

    if (refreshToken) {
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            path: "/api/auth/refresh-token",
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });
    }
}

/**
 * POST /api/auth/register
 */
async function userRegisterController(req, res, next) {
    try {
        const { email, password, name } = req.body;

        const isExists = await userModel.findOne({ email });
        if (isExists) {
            return next(new AppError("User already exists with this email address", 422));
        }

        const user = await userModel.create({ email, password, name });
        const { accessToken, refreshToken } = await generateTokens(user);
        setTokenCookies(res, accessToken, refreshToken);

        // Send welcome email asynchronously
        emailService.sendRegistrationEmail(user.email, user.name);

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: {
                _id: user._id,
                email: user.email,
                name: user.name
            },
            accessToken,
            refreshToken
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/auth/login
 */
async function userLoginController(req, res, next) {
    try {
        const { email, password } = req.body;

        const user = await userModel.findOne({ email }).select("+password +systemUser");
        if (!user) {
            return next(new AppError("Invalid email or password", 401));
        }

        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return next(new AppError("Invalid email or password", 401));
        }

        const { accessToken, refreshToken } = await generateTokens(user);
        setTokenCookies(res, accessToken, refreshToken);

        return res.status(200).json({
            success: true,
            message: "Logged in successfully",
            user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                systemUser: user.systemUser
            },
            accessToken,
            refreshToken
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/auth/refresh-token
 * Issue new access token using a valid refresh token
 */
async function refreshTokenController(req, res, next) {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (!refreshToken) {
            return next(new AppError("Refresh token is required", 400));
        }

        const storedToken = await refreshTokenModel.findOne({ token: refreshToken });
        if (!storedToken) {
            return next(new AppError("Invalid or expired refresh token", 401));
        }

        if (storedToken.expiresAt < new Date()) {
            await refreshTokenModel.deleteOne({ _id: storedToken._id });
            return next(new AppError("Refresh token expired. Please log in again", 401));
        }

        const user = await userModel.findById(storedToken.user);
        if (!user) {
            return next(new AppError("User not found", 401));
        }

        const accessToken = jwt.sign(
            { userId: user._id, email: user.email, systemUser: user.systemUser },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        const isProd = process.env.NODE_ENV === "production";
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: isProd,
            sameSite: isProd ? "none" : "lax",
            maxAge: 15 * 60 * 1000
        });

        return res.status(200).json({
            success: true,
            message: "Access token refreshed successfully",
            accessToken
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/auth/logout
 * Invalidate refresh token and clear cookies
 */
async function userLogoutController(req, res, next) {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

        if (refreshToken) {
            await refreshTokenModel.deleteOne({ token: refreshToken });
        }

        res.clearCookie("accessToken");
        res.clearCookie("refreshToken", { path: "/api/auth/refresh-token" });

        return res.status(200).json({
            success: true,
            message: "User logged out successfully"
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/auth/me
 * Fetch current logged-in user profile
 */
async function getMeController(req, res, next) {
    try {
        return res.status(200).json({
            success: true,
            user: {
                _id: req.user._id,
                email: req.user.email,
                name: req.user.name,
                systemUser: req.user.systemUser
            }
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    userRegisterController,
    userLoginController,
    refreshTokenController,
    userLogoutController,
    getMeController
};
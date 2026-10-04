const express = require("express");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const errorHandler = require("./middleware/error.middleware");
const AppError = require("./utils/AppError");

const app = express();

// Enable CORS for external frontends (e.g. Vercel, localhost:5000)
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const fs = require("fs");

// Serve static frontend assets from ../frontend if co-located
const frontendPath = path.join(__dirname, "../../frontend");
if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
}

/**
 * Health check route
 */
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Ledger Service is healthy and operational",
        timestamp: new Date().toISOString()
    });
});

/**
 * API Routes
 */
const authRouter = require("./routes/auth.routes");
const accountRouter = require("./routes/account.routes");
const transactionRoutes = require("./routes/transaction.routes");

app.use("/api/auth", authRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/transactions", transactionRoutes);

/**
 * SPA fallback: serve frontend/index.html if available, or return API status JSON
 */
app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
        const indexPath = path.join(frontendPath, "index.html");
        if (fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }
        return res.status(200).json({
            success: true,
            status: "online",
            message: "LedgerFlow Backend API is running.",
            endpoints: {
                health: "/api/health",
                auth: "/api/auth",
                accounts: "/api/accounts",
                transactions: "/api/transactions"
            }
        });
    }
    if (req.path.startsWith("/api")) {
        return next(new AppError(`API Route ${req.method} ${req.originalUrl} not found`, 404));
    }
    next();
});

/**
 * Centralized Error Handling Middleware
 */
app.use(errorHandler);

module.exports = app;
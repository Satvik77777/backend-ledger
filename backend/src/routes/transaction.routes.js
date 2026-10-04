const { Router } = require('express');
const { authMiddleware, authSystemUserMiddleware } = require('../middleware/auth.middleware');
const transactionController = require("../controllers/transaction.controller");
const validate = require("../middleware/validate.middleware");
const {
    createTransactionSchema,
    initialFundsSchema,
    getTransactionsSchema,
    getTransactionByIdSchema
} = require("../validators/transaction.validator");

const transactionRoutes = Router();

/**
 * POST /api/transactions/
 * Transfer funds between accounts
 */
transactionRoutes.post(
    "/",
    authMiddleware,
    validate(createTransactionSchema),
    transactionController.createTransaction
);

/**
 * GET /api/transactions/
 * Get transaction history for authenticated user
 */
transactionRoutes.get(
    "/",
    authMiddleware,
    validate(getTransactionsSchema),
    transactionController.getUserTransactions
);

/**
 * GET /api/transactions/:transactionId
 * Get specific transaction details
 */
transactionRoutes.get(
    "/:transactionId",
    authMiddleware,
    validate(getTransactionByIdSchema),
    transactionController.getTransactionById
);

/**
 * POST /api/transactions/system/initial-funds
 * Create initial funds transaction from system user
 */
transactionRoutes.post(
    "/system/initial-funds",
    authSystemUserMiddleware,
    validate(initialFundsSchema),
    transactionController.createInitialFundsTransaction
);

module.exports = transactionRoutes;
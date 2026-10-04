const express = require("express");
const { authMiddleware } = require("../middleware/auth.middleware");
const accountController = require("../controllers/account.controller");
const validate = require("../middleware/validate.middleware");
const {
    createAccountSchema,
    updateAccountStatusSchema,
    getAccountByIdSchema,
    getStatementSchema
} = require("../validators/account.validator");

const router = express.Router();

/**
 * POST /api/accounts/
 * Create a new account
 */
router.post(
    "/",
    authMiddleware,
    validate(createAccountSchema),
    accountController.createAccountController
);

/**
 * GET /api/accounts/
 * Get all accounts of the logged-in user
 */
router.get(
    "/",
    authMiddleware,
    accountController.getUserAccountsController
);

/**
 * GET /api/accounts/:accountId
 * Get single account details
 */
router.get(
    "/:accountId",
    authMiddleware,
    validate(getAccountByIdSchema),
    accountController.getAccountByIdController
);

/**
 * GET /api/accounts/:accountId/balance
 * Get account balance
 */
router.get(
    "/:accountId/balance",
    authMiddleware,
    validate(getAccountByIdSchema),
    accountController.getAccountBalanceController
);

/**
 * PATCH /api/accounts/:accountId/status
 * Update account status (ACTIVE, FROZEN, CLOSED)
 */
router.patch(
    "/:accountId/status",
    authMiddleware,
    validate(updateAccountStatusSchema),
    accountController.updateAccountStatusController
);

/**
 * GET /api/accounts/:accountId/statement
 * Get ledger statement (audit trail of credits and debits)
 */
router.get(
    "/:accountId/statement",
    authMiddleware,
    validate(getStatementSchema),
    accountController.getAccountStatementController
);

/**
 * POST /api/accounts/:accountId/faucet
 * Demo funds faucet
 */
router.post(
    "/:accountId/faucet",
    authMiddleware,
    accountController.requestFaucetFundsController
);

module.exports = router;
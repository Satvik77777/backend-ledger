const accountModel = require("../models/account.model");
const ledgerModel = require("../models/ledger.model");
const AppError = require("../utils/AppError");

/**
 * POST /api/accounts/
 * Create a new account for logged-in user
 */
async function createAccountController(req, res, next) {
    try {
        const { currency = "INR" } = req.body;

        const account = await accountModel.create({
            user: req.user._id,
            currency: currency.toUpperCase()
        });

        res.status(201).json({
            success: true,
            message: "Account created successfully",
            account: {
                _id: account._id,
                user: account.user,
                currency: account.currency,
                status: account.status,
                balance: 0,
                createdAt: account.createdAt
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/accounts/
 * Get all accounts of the logged-in user with their current balances
 */
async function getUserAccountsController(req, res, next) {
    try {
        const accounts = await accountModel.find({ user: req.user._id });

        const accountsWithBalance = await Promise.all(
            accounts.map(async (acc) => {
                const balance = await acc.getBalance();
                return {
                    _id: acc._id,
                    user: acc.user,
                    currency: acc.currency,
                    status: acc.status,
                    balance,
                    createdAt: acc.createdAt
                };
            })
        );

        res.status(200).json({
            success: true,
            count: accountsWithBalance.length,
            accounts: accountsWithBalance
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/accounts/:accountId
 * Get single account details for logged-in user
 */
async function getAccountByIdController(req, res, next) {
    try {
        const { accountId } = req.params;

        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        });

        if (!account) {
            return next(new AppError("Account not found or access unauthorized", 404));
        }

        const balance = await account.getBalance();

        res.status(200).json({
            success: true,
            account: {
                _id: account._id,
                user: account.user,
                currency: account.currency,
                status: account.status,
                balance,
                createdAt: account.createdAt
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/accounts/:accountId/balance
 * Get balance of specific account
 */
async function getAccountBalanceController(req, res, next) {
    try {
        const { accountId } = req.params;

        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        });

        if (!account) {
            return next(new AppError("Account not found or access unauthorized", 404));
        }

        const balance = await account.getBalance();

        res.status(200).json({
            success: true,
            accountId: account._id,
            currency: account.currency,
            balance
        });
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /api/accounts/:accountId/status
 * Update status (ACTIVE, FROZEN, CLOSED)
 */
async function updateAccountStatusController(req, res, next) {
    try {
        const { accountId } = req.params;
        const { status } = req.body;

        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        });

        if (!account) {
            return next(new AppError("Account not found or access unauthorized", 404));
        }

        if (account.status === "CLOSED") {
            return next(new AppError("Closed accounts cannot be reopened or modified", 400));
        }

        account.status = status;
        await account.save();

        res.status(200).json({
            success: true,
            message: `Account status updated to ${status}`,
            account: {
                _id: account._id,
                status: account.status
            }
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/accounts/:accountId/statement
 * Audit trail / ledger history of credits and debits with pagination
 */
async function getAccountStatementController(req, res, next) {
    try {
        const { accountId } = req.params;
        const page = parseInt(req.query?.page) || 1;
        const limit = parseInt(req.query?.limit) || 20;
        const skip = (page - 1) * limit;

        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        });

        if (!account) {
            return next(new AppError("Account not found or access unauthorized", 404));
        }

        const filter = { account: account._id };
        if (req.query?.type) {
            filter.type = req.query.type;
        }

        const [totalEntries, entries, currentBalance] = await Promise.all([
            ledgerModel.countDocuments(filter),
            ledgerModel.find(filter)
                .sort({ _id: -1 })
                .skip(skip)
                .limit(limit)
                .populate("transaction", "status amount idempotencyKey createdAt"),
            account.getBalance()
        ]);

        res.status(200).json({
            success: true,
            accountId: account._id,
            currentBalance,
            pagination: {
                totalEntries,
                page,
                limit,
                totalPages: Math.ceil(totalEntries / limit)
            },
            entries
        });
    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/accounts/:accountId/faucet
 * Demo faucet to seed test funds directly for testing/portfolio purposes
 */
async function requestFaucetFundsController(req, res, next) {
    try {
        const { accountId } = req.params;
        const amount = Number(req.body?.amount) || 1000;

        const account = await accountModel.findOne({
            _id: accountId,
            user: req.user._id
        });

        if (!account) {
            return next(new AppError("Account not found or access unauthorized", 404));
        }

        if (account.status !== "ACTIVE") {
            return next(new AppError("Cannot fund an inactive account", 400));
        }

        const dummyTxId = new (require("mongoose").Types.ObjectId)();

        await ledgerModel.create([{
            account: account._id,
            amount,
            transaction: dummyTxId,
            type: "CREDIT"
        }]);

        const balance = await account.getBalance();

        res.status(200).json({
            success: true,
            message: `Successfully credited ${amount} ${account.currency} to your account!`,
            balance
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createAccountController,
    getUserAccountsController,
    getAccountByIdController,
    getAccountBalanceController,
    updateAccountStatusController,
    getAccountStatementController,
    requestFaucetFundsController
};
const mongoose = require("mongoose");
const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");
const AppError = require("../utils/AppError");

/**
 * POST /api/transactions/
 * Transfer funds between accounts with ACID guarantees & idempotency
 */
async function createTransaction(req, res, next) {
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

    try {
        // 1. Check idempotency first before doing anything
        const existingTx = await transactionModel.findOne({ idempotencyKey });
        if (existingTx) {
            if (existingTx.status === "COMPLETED") {
                return res.status(200).json({
                    success: true,
                    message: "Transaction already processed",
                    transaction: existingTx
                });
            }
            if (existingTx.status === "PENDING") {
                return res.status(200).json({
                    success: true,
                    message: "Transaction is currently processing",
                    transaction: existingTx
                });
            }
            if (existingTx.status === "FAILED") {
                return res.status(400).json({
                    success: false,
                    message: "Previous attempt failed. Please generate a new idempotency key to retry",
                    failureReason: existingTx.failureReason
                });
            }
        }

        // 2. Fetch both accounts
        const [fromUserAccount, toUserAccount] = await Promise.all([
            accountModel.findById(fromAccount),
            accountModel.findById(toAccount)
        ]);

        if (!fromUserAccount) {
            return next(new AppError("Source account (fromAccount) does not exist", 404));
        }
        if (!toUserAccount) {
            return next(new AppError("Destination account (toAccount) does not exist", 404));
        }

        // 3. SECURITY CHECK (Fix IDOR): Authenticated user MUST own the fromAccount
        if (fromUserAccount.user.toString() !== req.user._id.toString()) {
            return next(new AppError("Unauthorized: You do not own the source account", 403));
        }

        // 4. Verify account statuses
        if (fromUserAccount.status !== "ACTIVE") {
            return next(new AppError(`Source account is ${fromUserAccount.status}. Only ACTIVE accounts can make transfers`, 400));
        }
        if (toUserAccount.status !== "ACTIVE") {
            return next(new AppError(`Destination account is ${toUserAccount.status}. Only ACTIVE accounts can receive transfers`, 400));
        }

        // 5. Currency matching check
        if (fromUserAccount.currency !== toUserAccount.currency) {
            return next(new AppError(`Currency mismatch: source is ${fromUserAccount.currency} and destination is ${toUserAccount.currency}`, 400));
        }

        // 6. Execute Transfer inside MongoDB ACID Transaction Session
        const session = await mongoose.startSession();
        session.startTransaction();

        let completedTransaction;

        try {
            // Check balance using the session to avoid dirty reads & race conditions
            const balance = await fromUserAccount.getBalance(session);
            if (balance < amount) {
                throw new AppError(`Insufficient balance. Current balance is ${balance} ${fromUserAccount.currency}. Transfer amount: ${amount}`, 400);
            }

            // Create Transaction record in PENDING state
            const [transaction] = await transactionModel.create(
                [{
                    fromAccount,
                    toAccount,
                    amount,
                    idempotencyKey,
                    status: "PENDING"
                }],
                { session }
            );

            // Double Entry: Create DEBIT entry
            await ledgerModel.create(
                [{
                    account: fromAccount,
                    amount,
                    transaction: transaction._id,
                    type: "DEBIT"
                }],
                { session }
            );

            // Double Entry: Create CREDIT entry
            await ledgerModel.create(
                [{
                    account: toAccount,
                    amount,
                    transaction: transaction._id,
                    type: "CREDIT"
                }],
                { session }
            );

            // Mark transaction COMPLETED
            completedTransaction = await transactionModel.findByIdAndUpdate(
                transaction._id,
                { status: "COMPLETED" },
                { session, new: true }
            );

            // Commit transaction
            await session.commitTransaction();
        } catch (txnError) {
            await session.abortTransaction();
            throw txnError;
        } finally {
            session.endSession();
        }

        // 7. Dispatch notification asynchronously (non-blocking)
        emailService.sendTransactionEmail(req.user.email, req.user.name, amount, toAccount);

        return res.status(201).json({
            success: true,
            message: "Transaction completed successfully",
            transaction: completedTransaction
        });

    } catch (err) {
        next(err);
    }
}

/**
 * POST /api/transactions/system/initial-funds
 * Seed funds from system user to an account
 */
async function createInitialFundsTransaction(req, res, next) {
    const { toAccount, amount, idempotencyKey } = req.body;

    try {
        const toUserAccount = await accountModel.findById(toAccount);
        if (!toUserAccount) {
            return next(new AppError("Target account not found", 404));
        }

        if (toUserAccount.status !== "ACTIVE") {
            return next(new AppError(`Target account is ${toUserAccount.status}. Cannot fund inactive account`, 400));
        }

        let systemAccount = await accountModel.findOne({ user: req.user._id });
        if (!systemAccount) {
            systemAccount = await accountModel.create({
                user: req.user._id,
                currency: toUserAccount.currency
            });
        }

        const session = await mongoose.startSession();
        session.startTransaction();

        let transaction;
        try {
            [transaction] = await transactionModel.create(
                [{
                    fromAccount: systemAccount._id,
                    toAccount,
                    amount,
                    idempotencyKey,
                    status: "PENDING"
                }],
                { session }
            );

            await ledgerModel.create(
                [{
                    account: systemAccount._id,
                    amount,
                    transaction: transaction._id,
                    type: "DEBIT"
                }],
                { session }
            );

            await ledgerModel.create(
                [{
                    account: toAccount,
                    amount,
                    transaction: transaction._id,
                    type: "CREDIT"
                }],
                { session }
            );

            transaction.status = "COMPLETED";
            await transaction.save({ session });

            await session.commitTransaction();
        } catch (txnError) {
            await session.abortTransaction();
            throw txnError;
        } finally {
            session.endSession();
        }

        return res.status(201).json({
            success: true,
            message: "Initial funds credited successfully",
            transaction
        });

    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/transactions/
 * Get user's transaction history with pagination and filtering
 */
async function getUserTransactions(req, res, next) {
    try {
        const page = parseInt(req.query?.page) || 1;
        const limit = parseInt(req.query?.limit) || 20;
        const skip = (page - 1) * limit;

        // Find all account IDs belonging to this user
        const userAccounts = await accountModel.find({ user: req.user._id }).select("_id");
        const accountIds = userAccounts.map(a => a._id);

        let filter = {
            $or: [
                { fromAccount: { $in: accountIds } },
                { toAccount: { $in: accountIds } }
            ]
        };

        if (req.query?.accountId) {
            const hasAccess = accountIds.some(id => id.toString() === req.query.accountId);
            if (!hasAccess) {
                return next(new AppError("You do not own this account", 403));
            }
            filter = {
                $or: [
                    { fromAccount: req.query.accountId },
                    { toAccount: req.query.accountId }
                ]
            };
        }

        if (req.query?.status) {
            filter.status = req.query.status;
        }

        const [total, transactions] = await Promise.all([
            transactionModel.countDocuments(filter),
            transactionModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("fromAccount", "currency status user")
                .populate("toAccount", "currency status user")
        ]);

        return res.status(200).json({
            success: true,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            },
            transactions
        });
    } catch (err) {
        next(err);
    }
}

/**
 * GET /api/transactions/:transactionId
 * Get single transaction details
 */
async function getTransactionById(req, res, next) {
    try {
        const { transactionId } = req.params;

        const transaction = await transactionModel.findById(transactionId)
            .populate("fromAccount", "currency status user")
            .populate("toAccount", "currency status user");

        if (!transaction) {
            return next(new AppError("Transaction not found", 404));
        }

        // Verify user is a participant or systemUser
        const userAccounts = await accountModel.find({ user: req.user._id }).select("_id");
        const accountIds = userAccounts.map(a => a._id.toString());

        const isParticipant =
            accountIds.includes(transaction.fromAccount?._id?.toString()) ||
            accountIds.includes(transaction.toAccount?._id?.toString()) ||
            req.user.systemUser;

        if (!isParticipant) {
            return next(new AppError("Unauthorized access to this transaction", 403));
        }

        return res.status(200).json({
            success: true,
            transaction
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    createTransaction,
    createInitialFundsTransaction,
    getUserTransactions,
    getTransactionById
};

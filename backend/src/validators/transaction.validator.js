const { z } = require("zod");

const createTransactionSchema = {
    body: z.object({
        fromAccount: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid fromAccount ID format"),
        toAccount: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid toAccount ID format"),
        amount: z.number().positive("Amount must be greater than 0"),
        idempotencyKey: z.string().min(8, "Idempotency key must be at least 8 characters long")
    }).refine(data => data.fromAccount !== data.toAccount, {
        message: "Cannot transfer money to the same account",
        path: ["toAccount"]
    })
};

const initialFundsSchema = {
    body: z.object({
        toAccount: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid toAccount ID format"),
        amount: z.number().positive("Amount must be greater than 0"),
        idempotencyKey: z.string().min(8, "Idempotency key must be at least 8 characters long")
    })
};

const getTransactionsSchema = {
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
        status: z.enum(["PENDING", "COMPLETED", "FAILED", "REVERSED"]).optional(),
        accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid account ID").optional()
    }).optional()
};

const getTransactionByIdSchema = {
    params: z.object({
        transactionId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid transaction ID format")
    })
};

module.exports = {
    createTransactionSchema,
    initialFundsSchema,
    getTransactionsSchema,
    getTransactionByIdSchema
};

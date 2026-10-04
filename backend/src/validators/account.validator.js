const { z } = require("zod");

const createAccountSchema = {
    body: z.object({
        currency: z.string().length(3, "Currency must be a 3-letter code (e.g. INR, USD)").optional().default("INR")
    })
};

const updateAccountStatusSchema = {
    params: z.object({
        accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid account ID format")
    }),
    body: z.object({
        status: z.enum(["ACTIVE", "FROZEN", "CLOSED"], {
            errorMap: () => ({ message: "Status must be ACTIVE, FROZEN, or CLOSED" })
        })
    })
};

const getAccountByIdSchema = {
    params: z.object({
        accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid account ID format")
    })
};

const getStatementSchema = {
    params: z.object({
        accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid account ID format")
    }),
    query: z.object({
        page: z.string().regex(/^\d+$/).transform(Number).optional().default("1"),
        limit: z.string().regex(/^\d+$/).transform(Number).optional().default("20"),
        type: z.enum(["CREDIT", "DEBIT"]).optional()
    }).optional()
};

module.exports = {
    createAccountSchema,
    updateAccountStatusSchema,
    getAccountByIdSchema,
    getStatementSchema
};

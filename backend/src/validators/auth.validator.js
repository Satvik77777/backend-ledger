const { z } = require("zod");

const registerSchema = {
    body: z.object({
        email: z.string().email("Invalid email address"),
        name: z.string().min(2, "Name must be at least 2 characters long"),
        password: z.string().min(6, "Password must be at least 6 characters long")
    })
};

const loginSchema = {
    body: z.object({
        email: z.string().email("Invalid email address"),
        password: z.string().min(1, "Password is required")
    })
};

const refreshTokenSchema = {
    body: z.object({
        refreshToken: z.string().min(1, "Refresh token is required").optional()
    })
};

module.exports = {
    registerSchema,
    loginSchema,
    refreshTokenSchema
};

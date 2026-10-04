const request = require("supertest");
const app = require("../src/app");
const userModel = require("../src/models/user.model");

describe("Authentication API Endpoints", () => {
    const validUser = {
        name: "Alice Doe",
        email: "alice@example.com",
        password: "password123"
    };

    it("should successfully register a new user", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send(validUser);

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.user.email).toBe(validUser.email);
        expect(res.body).toHaveProperty("accessToken");
        expect(res.body).toHaveProperty("refreshToken");

        // Verify user saved in DB
        const savedUser = await userModel.findOne({ email: validUser.email });
        expect(savedUser).not.toBeNull();
    });

    it("should reject registration with duplicate email", async () => {
        await request(app).post("/api/auth/register").send(validUser);

        const res = await request(app)
            .post("/api/auth/register")
            .send(validUser);

        expect(res.statusCode).toBe(422);
        expect(res.body.success).toBe(false);
    });

    it("should login with correct credentials", async () => {
        await request(app).post("/api/auth/register").send(validUser);

        const res = await request(app)
            .post("/api/auth/login")
            .send({
                email: validUser.email,
                password: validUser.password
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty("accessToken");
        expect(res.body).toHaveProperty("refreshToken");
    });

    it("should reject login with wrong password", async () => {
        await request(app).post("/api/auth/register").send(validUser);

        const res = await request(app)
            .post("/api/auth/login")
            .send({
                email: validUser.email,
                password: "wrongpassword"
            });

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("should fetch user profile with valid access token", async () => {
        const regRes = await request(app).post("/api/auth/register").send(validUser);
        const token = regRes.body.accessToken;

        const res = await request(app)
            .get("/api/auth/me")
            .set("Authorization", `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.user.email).toBe(validUser.email);
    });

    it("should refresh access token using valid refresh token", async () => {
        const regRes = await request(app).post("/api/auth/register").send(validUser);
        const refreshToken = regRes.body.refreshToken;

        const res = await request(app)
            .post("/api/auth/refresh-token")
            .send({ refreshToken });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty("accessToken");
    });

    it("should revoke refresh token on logout", async () => {
        const regRes = await request(app).post("/api/auth/register").send(validUser);
        const refreshToken = regRes.body.refreshToken;

        const logoutRes = await request(app)
            .post("/api/auth/logout")
            .send({ refreshToken });

        expect(logoutRes.statusCode).toBe(200);

        // Attempting to refresh with revoked token should fail
        const refreshRes = await request(app)
            .post("/api/auth/refresh-token")
            .send({ refreshToken });

        expect(refreshRes.statusCode).toBe(401);
    });
});

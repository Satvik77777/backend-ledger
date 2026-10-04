const request = require("supertest");
const app = require("../src/app");
const ledgerModel = require("../src/models/ledger.model");

describe("Transactions & Ledger API Endpoints", () => {
    let user1Token, user1Account;
    let user2Token, user2Account;

    beforeEach(async () => {
        // Register User 1
        const u1Res = await request(app).post("/api/auth/register").send({
            name: "Sender User",
            email: "sender@example.com",
            password: "password123"
        });
        user1Token = u1Res.body.accessToken;

        // Create Account for User 1
        const acc1Res = await request(app)
            .post("/api/accounts")
            .set("Authorization", `Bearer ${user1Token}`)
            .send({ currency: "INR" });
        user1Account = acc1Res.body.account;

        // Register User 2
        const u2Res = await request(app).post("/api/auth/register").send({
            name: "Receiver User",
            email: "receiver@example.com",
            password: "password123"
        });
        user2Token = u2Res.body.accessToken;

        // Create Account for User 2
        const acc2Res = await request(app)
            .post("/api/accounts")
            .set("Authorization", `Bearer ${user2Token}`)
            .send({ currency: "INR" });
        user2Account = acc2Res.body.account;

        // Credit initial 1000 funds to User 1's account directly via Ledger
        await ledgerModel.create({
            account: user1Account._id,
            amount: 1000,
            transaction: new (require("mongoose").Types.ObjectId)(),
            type: "CREDIT"
        });
    });

    it("should successfully execute a transfer and update balances", async () => {
        const transferRes = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`)
            .send({
                fromAccount: user1Account._id,
                toAccount: user2Account._id,
                amount: 300,
                idempotencyKey: "unique-key-tx-001"
            });

        expect(transferRes.statusCode).toBe(201);
        expect(transferRes.body.success).toBe(true);
        expect(transferRes.body.transaction.status).toBe("COMPLETED");

        // Verify Sender Balance (1000 - 300 = 700)
        const bal1 = await request(app)
            .get(`/api/accounts/${user1Account._id}/balance`)
            .set("Authorization", `Bearer ${user1Token}`);
        expect(bal1.body.balance).toBe(700);

        // Verify Receiver Balance (0 + 300 = 300)
        const bal2 = await request(app)
            .get(`/api/accounts/${user2Account._id}/balance`)
            .set("Authorization", `Bearer ${user2Token}`);
        expect(bal2.body.balance).toBe(300);
    });

    it("SECURITY: should prevent unauthorized transfers from accounts not owned by caller (IDOR)", async () => {
        // User 2 tries to send money FROM User 1's account to User 2's account
        const transferRes = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user2Token}`)
            .send({
                fromAccount: user1Account._id,
                toAccount: user2Account._id,
                amount: 200,
                idempotencyKey: "malicious-steal-tx-002"
            });

        expect(transferRes.statusCode).toBe(403);
        expect(transferRes.body.success).toBe(false);
    });

    it("should reject transfer if sender has insufficient balance", async () => {
        const transferRes = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`)
            .send({
                fromAccount: user1Account._id,
                toAccount: user2Account._id,
                amount: 5000, // Balance is only 1000
                idempotencyKey: "insufficient-funds-tx-003"
            });

        expect(transferRes.statusCode).toBe(400);
        expect(transferRes.body.message).toContain("Insufficient balance");
    });

    it("should guarantee idempotency when duplicate request is sent", async () => {
        const payload = {
            fromAccount: user1Account._id,
            toAccount: user2Account._id,
            amount: 250,
            idempotencyKey: "idempotent-key-retry-12345"
        };

        // First attempt
        const res1 = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`)
            .send(payload);

        expect(res1.statusCode).toBe(201);

        // Duplicate retry with same idempotency key
        const res2 = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`)
            .send(payload);

        expect(res2.statusCode).toBe(200);
        expect(res2.body.message).toBe("Transaction already processed");

        // Verify balance is only debited once (1000 - 250 = 750)
        const bal1 = await request(app)
            .get(`/api/accounts/${user1Account._id}/balance`)
            .set("Authorization", `Bearer ${user1Token}`);
        expect(bal1.body.balance).toBe(750);
    });

    it("should return account statement with audit trail of credits and debits", async () => {
        // Perform a transfer
        await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`)
            .send({
                fromAccount: user1Account._id,
                toAccount: user2Account._id,
                amount: 150,
                idempotencyKey: "statement-test-key-999"
            });

        const statementRes = await request(app)
            .get(`/api/accounts/${user1Account._id}/statement`)
            .set("Authorization", `Bearer ${user1Token}`);

        expect(statementRes.statusCode).toBe(200);
        expect(statementRes.body.success).toBe(true);
        expect(statementRes.body.entries.length).toBeGreaterThanOrEqual(2); // Initial credit + transfer debit
    });

    it("should return user transaction history", async () => {
        await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`)
            .send({
                fromAccount: user1Account._id,
                toAccount: user2Account._id,
                amount: 100,
                idempotencyKey: "tx-history-key-1"
            });

        const historyRes = await request(app)
            .get("/api/transactions")
            .set("Authorization", `Bearer ${user1Token}`);

        expect(historyRes.statusCode).toBe(200);
        expect(historyRes.body.success).toBe(true);
        expect(historyRes.body.transactions.length).toBe(1);
    });
});

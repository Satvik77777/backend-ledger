const mongoose = require("mongoose");
const ledgerModel = require("../src/models/ledger.model");
const accountModel = require("../src/models/account.model");
const userModel = require("../src/models/user.model");

describe("Ledger Model & Immutability Rules", () => {
    let testUser, testAccount;

    beforeEach(async () => {
        testUser = await userModel.create({
            name: "Ledger Tester",
            email: "ledger@test.com",
            password: "password123"
        });

        testAccount = await accountModel.create({
            user: testUser._id,
            currency: "INR"
        });
    });

    it("should prevent updating ledger entries via updateOne", async () => {
        const dummyTxId = new mongoose.Types.ObjectId();
        const entry = await ledgerModel.create({
            account: testAccount._id,
            amount: 500,
            transaction: dummyTxId,
            type: "CREDIT"
        });

        await expect(
            ledgerModel.updateOne({ _id: entry._id }, { amount: 1000 })
        ).rejects.toThrow("Ledger entries are immutable and cannot be modified or deleted");
    });

    it("should prevent deleting ledger entries via deleteOne", async () => {
        const dummyTxId = new mongoose.Types.ObjectId();
        const entry = await ledgerModel.create({
            account: testAccount._id,
            amount: 500,
            transaction: dummyTxId,
            type: "CREDIT"
        });

        await expect(
            ledgerModel.deleteOne({ _id: entry._id })
        ).rejects.toThrow("Ledger entries are immutable and cannot be modified or deleted");
    });

    it("should correctly calculate balance via double-entry aggregation", async () => {
        const dummyTx1 = new mongoose.Types.ObjectId();
        const dummyTx2 = new mongoose.Types.ObjectId();

        // Credit 1000
        await ledgerModel.create({
            account: testAccount._id,
            amount: 1000,
            transaction: dummyTx1,
            type: "CREDIT"
        });

        // Debit 400
        await ledgerModel.create({
            account: testAccount._id,
            amount: 400,
            transaction: dummyTx2,
            type: "DEBIT"
        });

        const balance = await testAccount.getBalance();
        expect(balance).toBe(600); // 1000 - 400 = 600
    });
});

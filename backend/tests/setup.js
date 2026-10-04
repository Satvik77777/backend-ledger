const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

let replSet;

beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "test_jwt_secret_key_12345";

    // Multi-document transactions require replica set support in MongoDB
    replSet = await MongoMemoryReplSet.create({
        replSet: { count: 1, storageEngine: "wiredTiger" }
    });

    const uri = replSet.getUri();
    await mongoose.connect(uri);
}, 60000);

afterEach(async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany();
    }
});

afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
        await replSet.stop();
    }
}, 30000);

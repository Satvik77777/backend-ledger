const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema({
    token: {
        type: String,
        required: [true, "Refresh token is required"],
        unique: true,
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "user",
        required: [true, "Refresh token must belong to a user"],
        index: true
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 } // Document auto-deletes when expiresAt is reached
    }
}, {
    timestamps: true
});

const refreshTokenModel = mongoose.model("refreshToken", refreshTokenSchema);

module.exports = refreshTokenModel;

const express = require("express");
const authController = require("../controllers/auth.controller");
const { authMiddleware } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { registerSchema, loginSchema, refreshTokenSchema } = require("../validators/auth.validator");

const router = express.Router();

/* POST /api/auth/register */
router.post("/register", validate(registerSchema), authController.userRegisterController);

/* POST /api/auth/login */
router.post("/login", validate(loginSchema), authController.userLoginController);

/* POST /api/auth/refresh-token */
router.post("/refresh-token", validate(refreshTokenSchema), authController.refreshTokenController);

/* POST /api/auth/logout */
router.post("/logout", authController.userLogoutController);

/* GET /api/auth/me */
router.get("/me", authMiddleware, authController.getMeController);

module.exports = router;
const express = require("express");
const { signup, getEmail } = require("../controllers/authController");
const router = express.Router();

router.post("/signup", signup);
router.post("/get-email", getEmail);

module.exports = router;
const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");
const orderController = require("../controllers/orderController");
const rewardController = require("../controllers/rewardController");
const ticketController = require("../controllers/ticketController");

const router = express.Router();

// Apply verifyToken middleware to all routes in this file
router.use(verifyToken);

// User Profile & Details
router.get("/user-details", userController.getUserDetails);
router.post("/create-referral-code", userController.createReferralCode);
router.get("/referral-history", userController.getReferralHistory);

// Orders
router.get("/services", orderController.getServices);
router.post("/order", orderController.createOrder);
router.get("/orders", orderController.getUserOrders);
router.post("/update-order-status", orderController.updateOrderStatus);
router.post("/cancel-order", orderController.cancelOrder);
router.post("/refill-order", orderController.refillOrder);
router.post("/refill-status", orderController.refillStatus);

// Funding & Withdrawals
router.post("/add-funds", userController.addFunds);
router.get("/my-fund-requests", userController.getMyFundRequests);
router.post("/request-withdrawal", userController.requestWithdrawal);

// Reward System
router.post("/redeem-coin-service", rewardController.redeemCoinService);
router.post("/generate-reward-link", rewardController.generateRewardLink);
router.post("/claim-link-reward", rewardController.claimLinkReward);

// Support Tickets
router.post("/tickets/create", ticketController.createTicket);
router.get("/tickets", ticketController.getUserTickets);

module.exports = router;
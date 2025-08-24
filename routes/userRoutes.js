const express = require("express");
const { verifyToken } = require("../middleware/authMiddleware");
const userController = require("../controllers/userController");
const orderController = require("../controllers/orderController");
const rewardController = require("../controllers/rewardController");
const ticketController = require("../controllers/ticketController");
const https = require("https");
const axios = require("axios");
const httpsAgent = new https.Agent({ keepAlive: false });
const router = express.Router();

// You'll need your Cashfree constants here
const CASHFREE_APP_ID = "10563033afb426cd8b575c1a88d3036501";
const CASHFREE_SECRET_KEY =
  "cfsk_ma_prod_cdabe2a62261b5278cc23bea021cf60f_dbb744f6";
const CASHFREE_API_URL = "https://api.cashfree.com/pg/orders";
// Apply verifyToken middleware to all routes in this file
router.use(verifyToken);
router.post("/create-payment-session", async (req, res) => {
  console.log("running", req.user);
  const { amount } = req.body;
  const { uid, email, name } = req.user;
  const orderId = `order_${Date.now()}`; // Generate a unique order ID

  if (!amount || amount < 10) {
    return res.status(400).json({ error: "Minimum amount is ₹10." });
  }

  try {
    const response = await axios.post(
      CASHFREE_API_URL,
      {
        customer_details: {
          customer_id: uid, // Pass the Firebase UID for tracking
          customer_email: email,
          customer_name: name || "User",
          customer_phone: "9876543210" || "9999999999",
        },
        order_meta: {
          return_url: `https://candid-rugelach-b9eb2d.netlify.app/payment-success?order_id={order_id}`,
        },
        order_id: orderId,
        order_amount: amount,
        order_currency: "INR",
        order_note: "Add funds to SocialRocket",
      },
      {
        headers: {
          "x-api-version": "2022-09-01",
          "Content-Type": "application/json",
          "x-client-id": CASHFREE_APP_ID,
          "x-client-secret": CASHFREE_SECRET_KEY,
        },
        httpsAgent: httpsAgent
      }
    );

    if (response.data && response.data.payment_session_id) {
      res.json({ payment_session_id: response.data.payment_session_id });
    } else {
      throw new Error("Failed to create payment session.");
    }
  } catch (error) {
    console.error(
      "Cashfree API Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Could not create payment link." });
  }
});
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

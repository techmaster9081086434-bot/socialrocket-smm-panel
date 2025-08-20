const express = require("express");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const adminController = require("../controllers/adminController");
const ticketController = require("../controllers/ticketController");

const router = express.Router();

// Apply authentication and admin verification to all admin routes
router.use(verifyToken, verifyAdmin);

// Dashboard & Stats
router.get("/dashboard-stats", adminController.getDashboardStats);
router.get("/balances", adminController.getBalances);
router.get("/profit-history", adminController.getProfitHistory);

// User Management
router.get("/users", adminController.getUsers);
router.get("/user/:userId", adminController.getUserById);
router.post("/update-balance", adminController.updateUserBalance);

// Order Management
router.get("/all-orders", adminController.getAllOrders);

// Fund & Withdrawal Management
router.get("/fund-requests", adminController.getFundRequests);
router.post("/approve-fund-request", adminController.approveFundRequest);
router.post("/reject-fund-request", adminController.rejectFundRequest);
router.get("/withdrawal-requests", adminController.getWithdrawalRequests);
router.post("/complete-withdrawal", adminController.completeWithdrawal);

// Service & Markup Management
router.get("/services", adminController.getSmmServices);
router.get("/markup-settings", adminController.getMarkupSettings);
router.post("/markup-settings", adminController.saveMarkupSettings);

// Support Tickets
router.get("/tickets", ticketController.getAllTickets);
router.post("/tickets/update-status", ticketController.updateTicketStatus);

module.exports = router;
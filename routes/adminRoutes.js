const express = require("express");
const { db, admin } = require("../config/firebaseAdmin");
const { smmRequest } = require("../config/smmProvider");
const router = express.Router();

// --- DASHBOARD ---
router.get("/dashboard-stats", async (req, res) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    const ordersSnapshot = await db.collection("orders").get();
    const fundsSnapshot = await db
      .collection("fund_requests")
      .where("status", "==", "pending")
      .get();

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newUsersQuery = await admin.auth().listUsers();
    const newUsersToday = newUsersQuery.users.filter((user) => {
      const creationTime = new Date(user.metadata.creationTime);
      return creationTime >= oneDayAgo;
    }).length;

    res.json({
      totalUsers: usersSnapshot.size,
      newUsersToday: newUsersToday,
      totalOrders: ordersSnapshot.size,
      pendingFunds: fundsSnapshot.size,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard stats." });
  }
});

router.get("/balances", async (req, res) => {
  try {
    const smmBalance = await smmRequest("balance");
    const adminBalanceDoc = await db
      .collection("admin_panel")
      .doc("main_balance")
      .get();
    const adminBalance = adminBalanceDoc.data() || { secondary_balance: 0 };

    res.json({
      primary_balance: smmBalance.balance,
      secondary_balance: adminBalance.secondary_balance,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch balances." });
  }
});

// --- USER MANAGEMENT ---
router.get("/users", async (req, res) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    const ordersSnapshot = await db.collection("orders").get();

    const orderCounts = {};
    ordersSnapshot.forEach((doc) => {
      const userId = doc.data().userId;
      orderCounts[userId] = (orderCounts[userId] || 0) + 1;
    });

    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      orderCount: orderCounts[doc.id] || 0,
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists)
      return res.status(404).json({ error: "User not found." });

    const ordersQuery = await db
      .collection("orders")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .get();
    const orders = ordersQuery.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json({
      details: userDoc.data(),
      orders: orders,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user details." });
  }
});

router.post("/update-balance", async (req, res) => {
  const { userId, newBalance, newCoins } = req.body;
  try {
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      balance: parseFloat(newBalance),
      coins: parseInt(newCoins, 10),
    });
    res.json({ message: "User balance updated successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- FUND REQUESTS ---
router.get("/fund-requests", async (req, res) => {
  try {
    const snapshot = await db
      .collection("fund_requests")
      .orderBy("timestamp", "desc")
      .get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch fund requests." });
  }
});

router.post("/approve-fund-request", async (req, res) => {
  const { requestId } = req.body;
  const requestRef = db.collection("fund_requests").doc(requestId);
  const adminBalanceRef = db.collection("admin_panel").doc("main_balance");

  try {
    await db.runTransaction(async (t) => {
      const requestDoc = await t.get(requestRef);
      if (!requestDoc.exists) throw new Error("Request not found.");

      const { userId, amount, status } = requestDoc.data();
      if (status !== "pending")
        throw new Error("This request has already been processed.");

      const userRef = db.collection("users").doc(userId);
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const adminBalanceDoc = await t.get(adminBalanceRef);
      const adminBalance = adminBalanceDoc.data() || { secondary_balance: 0 };

      const newUserBalance = (userDoc.data().balance || 0) + amount;
      const newSecondaryBalance = adminBalance.secondary_balance + amount;

      t.update(userRef, { balance: newUserBalance });
      t.update(requestRef, { status: "approved" });
      t.set(
        adminBalanceRef,
        { ...adminBalance, secondary_balance: newSecondaryBalance },
        { merge: true }
      );
    });
    res.json({ message: "Fund request approved successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/reject-fund-request", async (req, res) => {
  const { requestId } = req.body;
  try {
    await db
      .collection("fund_requests")
      .doc(requestId)
      .update({ status: "rejected" });
    res.json({ message: "Fund request rejected." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SERVICE MANAGEMENT ---
router.get("/services", async (req, res) => {
  const services = await smmRequest("services");
  if (services && !services.error) {
    res.json(services);
  } else {
    res.status(500).json({ error: "Failed to fetch services from provider." });
  }
});

// --- PROFIT HISTORY ---
router.get("/profit-history", async (req, res) => {
  try {
    const snapshot = await db
      .collection("profit_ledger")
      .orderBy("timestamp", "desc")
      .get();
    const history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch profit history." });
  }
});

module.exports = router;

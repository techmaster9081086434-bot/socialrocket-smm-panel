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
    const newUsersToday = newUsersQuery.users.filter(
      (user) => new Date(user.metadata.creationTime) >= oneDayAgo
    ).length;

    res.json({
      totalUsers: usersSnapshot.size,
      newUsersToday,
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

    const ordersSnapshot = await db.collection("orders").get();
    const totalUserSpent = ordersSnapshot.docs.reduce((sum, doc) => {
      if (
        typeof doc.data().charge === "number" &&
        !doc.data().serviceName.includes("(from Coins)")
      ) {
        return sum + doc.data().charge;
      }
      return sum;
    }, 0);

    res.json({
      primary_balance: smmBalance.balance,
      secondary_balance: adminBalance.secondary_balance,
      total_user_spent: totalUserSpent,
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

      const newUserBalance = (userDoc.data().balance || 0) + amount;

      t.update(userRef, { balance: newUserBalance });
      t.update(requestRef, { status: "approved" });
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

router.get("/markup-settings", async (req, res) => {
  try {
    const snapshot = await db.collection("markup_settings").get();
    const settings = {};
    snapshot.forEach((doc) => {
      settings[doc.id] = doc.data();
    });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch markup settings." });
  }
});

router.post("/markup-settings", async (req, res) => {
  const { categoryKey, markupType, markupValue } = req.body;
  if (!categoryKey || !markupType || markupValue === undefined) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    const settingRef = db.collection("markup_settings").doc(categoryKey);
    await settingRef.set({
      type: markupType,
      value: parseFloat(markupValue),
    });
    res.json({
      message: `Markup for ${categoryKey.replace(
        "_",
        " "
      )} saved successfully.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to save markup setting." });
  }
});

// --- ALL ORDERS HISTORY ---
router.get("/all-orders", async (req, res) => {
  try {
    // Step 1: Fetch all users to create a map of userId -> username
    const usersSnapshot = await db.collection("users").get();
    const userMap = {};
    usersSnapshot.forEach((doc) => {
      userMap[doc.id] = doc.data().username;
    });

    // Step 2: Fetch all orders
    const ordersSnapshot = await db
      .collection("orders")
      .orderBy("timestamp", "desc")
      .get();

    // Step 3: Combine order data with username
    const orders = ordersSnapshot.docs.map((doc) => {
      const orderData = doc.data();
      return {
        id: doc.id,
        ...orderData,
        username: userMap[orderData.userId] || "Unknown User", // Add username to each order
      };
    });

    res.json(orders);
  } catch (error) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({ error: "Failed to fetch all orders history." });
  }
});

module.exports = router;

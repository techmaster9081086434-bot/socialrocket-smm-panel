const express = require("express");
const { db, admin } = require("../config/firebaseAdmin");
const { smmRequest } = require("../config/smmProvider");
const router = express.Router();

// GET /api/services - Provides the raw service list from the provider
router.get("/services", async (req, res) => {
  const services = await smmRequest("services");
  if (services && !services.error) {
    res.json(services);
  } else {
    res.status(500).json({ error: "Failed to fetch services from provider." });
  }
});

// POST /api/order - Places a new order and calculates profit
router.post("/order", async (req, res) => {
  const { serviceId, link, quantity, serviceName, charge } = req.body;
  const userRef = db.collection("users").doc(req.user.uid);
  const adminBalanceRef = db.collection("admin_panel").doc("main_balance");

  try {
    const services = await smmRequest("services");
    if (!services || !Array.isArray(services))
      throw new Error("Could not verify service price.");

    const originalService = services.find((s) => s.service == serviceId);
    if (!originalService)
      throw new Error("Service ID not found with provider.");

    const originalRate = parseFloat(originalService.rate);
    const actualCost = (originalRate / 1000) * quantity;
    const profit = charge - actualCost;

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const currentBalance = userDoc.data().balance;
      if (currentBalance < charge) throw new Error("Insufficient balance.");

      const smmResult = await smmRequest("add", {
        service: serviceId,
        link,
        quantity,
      });
      if (smmResult.error || !smmResult.order)
        throw new Error(
          `Provider error: ${smmResult.error || "Failed to get order ID."}`
        );

      const statusResult = await smmRequest("status", {
        order: smmResult.order,
      });

      const newBalance = currentBalance - charge;
      transaction.update(userRef, { balance: newBalance });

      const adminBalanceDoc = await transaction.get(adminBalanceRef);
      const newSecondaryBalance =
        (adminBalanceDoc.data()?.secondary_balance || 0) + profit;
      transaction.set(
        adminBalanceRef,
        { secondary_balance: newSecondaryBalance },
        { merge: true }
      );

      const profitLedgerRef = db.collection("profit_ledger").doc();
      transaction.set(profitLedgerRef, {
        userId: req.user.uid,
        username: userDoc.data().username,
        serviceId: serviceId,
        serviceName: serviceName,
        profit: profit,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        userId: req.user.uid,
        providerOrderId: smmResult.order,
        serviceName: serviceName,
        link: link,
        quantity: quantity,
        charge: charge,
        status: statusResult.status || "Pending",
        start_count: statusResult.start_count || "N/A",
        remains: statusResult.remains || quantity,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ order: smmResult.order, newBalance: newBalance });
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/orders - Fetches the user's order history
router.get("/orders", async (req, res) => {
  try {
    const ordersQuery = await db
      .collection("orders")
      .where("userId", "==", req.user.uid)
      .orderBy("timestamp", "desc")
      .get();
    const orders = ordersQuery.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch order history." });
  }
});

// POST /api/update-order-status - Updates status for multiple orders
router.post("/update-order-status", async (req, res) => {
  const { ordersToUpdate } = req.body;
  if (!Array.isArray(ordersToUpdate) || ordersToUpdate.length === 0) {
    return res.status(400).json({ error: "Invalid request format." });
  }

  const providerOrderIds = ordersToUpdate
    .map((o) => o.providerOrderId)
    .join(",");

  try {
    const statusResult = await smmRequest("status", {
      orders: providerOrderIds,
    });
    if (statusResult.error) {
      throw new Error(statusResult.error);
    }

    const batch = db.batch();
    const updatedOrders = [];

    for (const order of ordersToUpdate) {
      const statusData = statusResult[order.providerOrderId];
      if (statusData) {
        const orderRef = db.collection("orders").doc(order.firestoreId);
        const updateData = {
          status: statusData.status,
          remains: statusData.remains,
          start_count: statusData.start_count,
        };
        batch.update(orderRef, updateData);
        updatedOrders.push({ id: order.firestoreId, ...updateData });
      }
    }

    await batch.commit();
    res.json(updatedOrders);
  } catch (error) {
    res
      .status(500)
      .json({ error: `Failed to update statuses: ${error.message}` });
  }
});

// POST /api/cancel-order - Cancels an order
router.post("/cancel-order", async (req, res) => {
  const { providerOrderId } = req.body;
  const result = await smmRequest("cancel", { orders: providerOrderId });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ message: "Cancel request sent successfully." });
});

// POST /api/refill-order - Requests a refill for an order
router.post("/refill-order", async (req, res) => {
  const { providerOrderId, firestoreId } = req.body;
  const result = await smmRequest("refill", { order: providerOrderId });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  const orderRef = db.collection("orders").doc(firestoreId);
  await orderRef.update({ refillId: result.refill });

  res.json({ refillId: result.refill });
});

// POST /api/refill-status - Checks the status of a refill
router.post("/refill-status", async (req, res) => {
  const { refillId } = req.body;
  const result = await smmRequest("refill_status", { refill: refillId });
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }
  res.json(result);
});

// POST /api/redeem-coin-service - Redeems a free service with coins
router.post("/redeem-coin-service", async (req, res) => {
  const { link, serviceType } = req.body;
  const userRef = db.collection("users").doc(req.user.uid);

  const COIN_SERVICES = {
    ig_followers: {
      serviceId: "YOUR_FOLLOWER_SERVICE_ID",
      quantity: 10,
      cost: 0,
      serviceName: "10 IG Followers (from Coins)",
    },
    reel_views: {
      serviceId: "1348",
      quantity: 500,
      cost: 1,
      serviceName: "500 IG Reel Views (from Coins)",
    },
    likes: {
      serviceId: "1293",
      quantity: 50,
      cost: 1,
      serviceName: "50 IG Likes (from Coins)",
    },
  };

  const service = COIN_SERVICES[serviceType];
  if (!service) return res.status(400).json({ error: "Invalid service type." });
  if (!link) return res.status(400).json({ error: "A link is required." });

  try {
    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const userData = userDoc.data();
      if (userData.coins < service.cost) {
        throw new Error(
          `You need at least ${service.cost} coin to redeem this service.`
        );
      }

      const smmResult = await smmRequest("add", {
        service: service.serviceId,
        link,
        quantity: service.quantity,
      });
      if (smmResult.error || !smmResult.order) {
        throw new Error(
          `Provider error: ${smmResult.error || "Failed to get order ID."}`
        );
      }

      const newCoinBalance = userData.coins - service.cost;
      transaction.update(userRef, { coins: newCoinBalance });

      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        userId: req.user.uid,
        providerOrderId: smmResult.order,
        serviceName: service.serviceName,
        link: link,
        quantity: service.quantity,
        charge: service.cost,
        status: "Pending (Coin Order)",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({
        order: smmResult.order,
        message: "Service redeemed successfully!",
      });
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

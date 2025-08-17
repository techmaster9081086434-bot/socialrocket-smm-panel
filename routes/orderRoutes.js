const express = require("express");
const { db, admin } = require("../config/firebaseAdmin");
const { smmRequest } = require("../config/smmProvider");
const router = express.Router();

// --- CONFIGURATION FOR CATEGORIZATION (Must match admin panel) ---
const PLATFORM_KEYWORDS = {
  Instagram: ["instagram", "ig"],
  YouTube: ["youtube", "yt"],
  TikTok: ["tiktok", "tik tok"],
  Telegram: ["telegram"],
  Facebook: ["facebook", "fb"],
  Spotify: ["spotify"],
};
const SUB_CATEGORY_KEYWORDS = {
  Followers: ["follower", "subscriber"],
  Likes: ["like"],
  Views: ["view", "play"],
  Comments: ["comment"],
  Shares: ["share", "repost"],
  Reach: ["reach"],
  Other: [],
};

// --- HELPER FUNCTIONS (More Robust) ---
const getServicePlatform = (serviceCategory) => {
  if (!serviceCategory) return null;
  const categoryLower = serviceCategory.toLowerCase();
  for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
    if (keywords.some((keyword) => categoryLower.includes(keyword))) {
      return platform;
    }
  }
  return null; // Return null if no platform is found
};

const getServiceSubCategory = (serviceName) => {
  if (!serviceName) return "Other";
  const nameLower = serviceName.toLowerCase();
  for (const [subCategory, keywords] of Object.entries(SUB_CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => nameLower.includes(keyword))) {
      return subCategory;
    }
  }
  return "Other";
};

const applyMarkup = (originalRate, rule) => {
  const rate = parseFloat(originalRate);
  if (!rule) {
    return rate * 1.6; // Default 60% markup if no specific rule is found
  }
  const value = parseFloat(rule.value);
  if (rule.type === "percent") {
    return rate * (1 + value / 100);
  }
  if (rule.type === "fixed") {
    return rate + value;
  }
  return rate;
};

// GET /api/services - Provides the service list WITH CORRECT MARKUPS APPLIED
router.get("/services", async (req, res) => {
  try {
    const [smmServices, markupSnapshot] = await Promise.all([
      smmRequest("services"),
      db.collection("markup_settings").get(),
    ]);

    if (smmServices.error) throw new Error(smmServices.error);

    const markupSettings = {};
    markupSnapshot.forEach((doc) => {
      markupSettings[doc.id] = doc.data();
    });

    const markedUpServices = smmServices.map((service) => {
      if (!service.category || !service.name) return service;

      // CORRECTED LOGIC: This now correctly finds the platform and sub-category
      const platformName = getServicePlatform(service.category);
      const subCategoryName = getServiceSubCategory(service.name);

      // If a platform can't be determined from the category, we can't apply a specific rule
      const categoryKey = platformName
        ? `${platformName}_${subCategoryName}`
        : null;

      const rule = categoryKey ? markupSettings[categoryKey] : undefined;
      const userPrice = applyMarkup(service.rate, rule);

      return { ...service, rate: userPrice.toFixed(2) };
    });
    res.json(markedUpServices);
  } catch (error) {
    console.error("Error in /api/services:", error);
    res.status(500).json({ error: "Failed to fetch and process services." });
  }
});

// POST /api/order - Places a new order and calculates profit based on saved markups
router.post("/order", async (req, res) => {
  const { serviceId, link, quantity, serviceName } = req.body;
  const userRef = db.collection("users").doc(req.user.uid);
  const adminBalanceRef = db.collection("admin_panel").doc("main_balance");

  try {
    const [smmServices, markupSnapshot] = await Promise.all([
      smmRequest("services"),
      db.collection("markup_settings").get(),
    ]);

    if (smmServices.error) throw new Error(smmServices.error);
    const markupSettings = {};
    markupSnapshot.forEach((doc) => (markupSettings[doc.id] = doc.data()));
    const originalService = smmServices.find((s) => s.service == serviceId);
    if (!originalService)
      throw new Error("Service ID not found with provider.");

    const platformName = getServicePlatform(originalService.category);
    const subCategoryName = getServiceSubCategory(originalService.name);
    const categoryKey = platformName
      ? `${platformName}_${subCategoryName}`
      : null;
    const rule = markupSettings[categoryKey];

    const userPricePer1k = applyMarkup(originalService.rate, rule);
    const totalCharge = (userPricePer1k / 1000) * quantity;
    const actualCost = (parseFloat(originalService.rate) / 1000) * quantity;
    const profit = totalCharge - actualCost;

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");
      const adminBalanceDoc = await transaction.get(adminBalanceRef);

      const currentBalance = userDoc.data().balance;
      if (currentBalance < totalCharge)
        throw new Error("Insufficient balance.");

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

      const newBalance = currentBalance - totalCharge;
      transaction.update(userRef, { balance: newBalance });

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
        charge: totalCharge,
        status: statusResult.status || "Pending",
        start_count: statusResult.start_count || "N/A",
        remains: statusResult.remains || "N/A",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      res.json({ order: smmResult.order, newBalance: newBalance });
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/orders
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

// POST /api/update-order-status
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
    if (statusResult.error) throw new Error(statusResult.error);
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

// POST /api/cancel-order
router.post("/cancel-order", async (req, res) => {
  const { providerOrderId } = req.body;
  const result = await smmRequest("cancel", { orders: providerOrderId });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: "Cancel request sent successfully." });
});

// POST /api/refill-order
router.post("/refill-order", async (req, res) => {
  const { providerOrderId, firestoreId } = req.body;
  const result = await smmRequest("refill", { order: providerOrderId });
  if (result.error) return res.status(400).json({ error: result.error });
  const orderRef = db.collection("orders").doc(firestoreId);
  await orderRef.update({ refillId: result.refill });
  res.json({ refillId: result.refill });
});

// POST /api/refill-status
router.post("/refill-status", async (req, res) => {
  const { refillId } = req.body;
  const result = await smmRequest("refill_status", { refill: refillId });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

// POST /api/redeem-coin-service
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

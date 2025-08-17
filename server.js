// --- 1. SETUP ---
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// --- 2. FIREBASE ADMIN SETUP ---
try {
  const serviceAccountPath = path.join(__dirname, "serviceAccountKey.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error(
    "CRITICAL ERROR: Failed to initialize Firebase Admin SDK. Make sure 'serviceAccountKey.json' is in the /backend folder."
  );
  process.exit(1);
}

const db = admin.firestore();
const app = express();
const PORT = 5000;

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token)
    return res.status(401).send({ error: "Authentication required." });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(403).send({ error: "Invalid or expired token." });
  }
};

const verifyAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token)
    return res.status(401).send({ error: "Authentication required." });
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    if (decodedToken.admin !== true) {
      return res
        .status(403)
        .send({ error: "Forbidden. Admin access required." });
    }
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(403).send({ error: "Invalid or expired token." });
  }
};

// --- 4. SMM PANEL & LINK SHORTENER CONFIGURATION ---
const SMM_API_URL = "https://cheapestsmmpanels.com/api/v2";
const SMM_API_KEY = "9e76aab997b6f75e1a25825a84fe08fb";

const LINK_SHORTENER_APIS = {
  adrinolinks: {
    apiUrl: "https://adrinolinks.in/api",
    apiKey: "962e3a2c099f4d0895e1decfc76a4d30c5d28411",
  },
  shrinkearn: {
    apiUrl: "https://shrinkearn.com/api",
    apiKey: "fc506670211df0fc2941177f45764341fc8efff3",
  },
  gplinks: {
    apiUrl: "https://api.gplinks.com/api",
    apiKey: "4ca33f34e804cad27ff6f8834b8bb65f1e1a72ec",
  },
  shrinkme: {
    apiUrl: "https://shrinkme.io/api",
    apiKey: "39d8577157282f86bf507ad0cbd25c5280039063",
  },
  shrinkforearn: {
    apiUrl: "https://shrinkforearn.in/api",
    apiKey: "e31faa4ce52088fae2228d7b4803efc1bf85f368",
  },
};
const YOUR_FRONTEND_URL = "https://candid-rugelach-b9eb2d.netlify.app";

async function smmRequest(action, params = {}) {
  try {
    const postData = { key: SMM_API_KEY, action: action, ...params };
    const response = await axios.post(
      SMM_API_URL,
      new URLSearchParams(postData)
    );
    return response.data;
  } catch (error) {
    return { error: `API request to provider failed.` };
  }
}

// --- 5. PRICING & CATEGORIZATION LOGIC ---
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

const getServicePlatform = (serviceCategory) => {
  if (!serviceCategory) return null;
  const categoryLower = serviceCategory.toLowerCase();
  for (const [platform, keywords] of Object.entries(PLATFORM_KEYWORDS)) {
    if (keywords.some((keyword) => categoryLower.includes(keyword))) {
      return platform;
    }
  }
  return null;
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
    return rate * 1.6; // Default 60% markup
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

// --- 6. API ROUTES ---

// --- PUBLIC ROUTES ---
const generateReferralCode = (username) => {
  return (
    username.slice(0, 4).toUpperCase() +
    Math.random().toString(36).substring(2, 6).toUpperCase()
  );
};
app.post("/api/signup", async (req, res) => {
  const { email, password, username, name, referralCode } = req.body;
  try {
    const userRecord = await admin
      .auth()
      .createUser({ email, password, displayName: name });

    let initialCoins = 0;
    let referredBy = null;

    if (referralCode) {
      const referrerQuery = await db
        .collection("users")
        .where("referralCode", "==", referralCode.toUpperCase())
        .limit(1)
        .get();
      if (!referrerQuery.empty) {
        const referrerDoc = referrerQuery.docs[0];
        referredBy = referrerDoc.id;
        initialCoins = 2; // New user gets 2 coins
      }
    }

    await db
      .collection("users")
      .doc(userRecord.uid)
      .set({
        name,
        username: username.toLowerCase(),
        email,
        balance: 0,
        coins: initialCoins,
        referralCode: generateReferralCode(username),
        referredBy: referredBy, // Store who referred this user
        referral_wallet: 0, // Initialize referral wallet
        lastClaimed: {},
      });

    res.status(201).json({ uid: userRecord.uid });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Failed to create user." });
  }
});

app.post("/api/get-email", async (req, res) => {
  const { username } = req.body;
  if (!username)
    return res.status(400).json({ error: "Username is required." });
  try {
    const snapshot = await db
      .collection("users")
      .where("username", "==", username.toLowerCase())
      .limit(1)
      .get();
    if (snapshot.empty)
      return res.status(404).json({ error: "User not found." });
    res.json({ email: snapshot.docs[0].data().email });
  } catch (error) {
    res.status(500).json({ error: "Server error." });
  }
});

// --- PROTECTED USER ROUTES ---
app.get("/api/user-details", verifyToken, async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists)
      return res.status(404).json({ error: "User not found." });
    res.json(userDoc.data());
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user details." });
  }
});

app.get("/api/services", verifyToken, async (req, res) => {
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
      const platformName = getServicePlatform(service.category);
      const subCategoryName = getServiceSubCategory(service.name);
      const categoryKey = platformName
        ? `${platformName}_${subCategoryName}`
        : null;
      const rule = categoryKey ? markupSettings[categoryKey] : undefined;
      const userPrice = applyMarkup(service.rate, rule);
      return { ...service, rate: userPrice.toFixed(2) };
    });
    res.json(markedUpServices);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch and process services." });
  }
});

// --- NEW: Route to generate a referral code for existing users ---
app.post("/api/create-referral-code", verifyToken, async (req, res) => {
  const { uid } = req.user;
  const userRef = db.collection("users").doc(uid);

  try {
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error("User not found.");

    const userData = userDoc.data();
    if (userData.referralCode) {
      // If code already exists, just return it
      return res.json({ referralCode: userData.referralCode });
    }

    // If no code exists, generate and save one
    const newCode = generateReferralCode(userData.username);
    await userRef.update({ referralCode: newCode });

    res.json({ referralCode: newCode });
  } catch (error) {
    res.status(500).json({ error: "Failed to create referral code." });
  }
});

app.post("/api/order", verifyToken, async (req, res) => {
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
        serviceId,
        serviceName,
        profit,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        userId: req.user.uid,
        providerOrderId: smmResult.order,
        serviceName,
        link,
        quantity,
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

// Route for the user to see their referral history and stats
app.get("/api/referral-history", verifyToken, async (req, res) => {
  const referrerId = req.user.uid;
  try {
    const commissionsSnapshot = await db
      .collection("referral_commissions")
      .where("referrerId", "==", referrerId)
      .orderBy("timestamp", "desc")
      .get();

    const history = commissionsSnapshot.docs.map((doc) => doc.data());

    const referredUsersSnapshot = await db
      .collection("users")
      .where("referredBy", "==", referrerId)
      .get();

    res.json({
      history: history,
      totalReferred: referredUsersSnapshot.size,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch referral history." });
  }
});

// NEW: Route for the user to see their referral history

app.get("/api/orders", verifyToken, async (req, res) => {
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

app.post("/api/update-order-status", verifyToken, async (req, res) => {
  const { ordersToUpdate } = req.body;
  if (!Array.isArray(ordersToUpdate) || ordersToUpdate.length === 0)
    return res.status(400).json({ error: "Invalid request format." });
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

app.post("/api/cancel-order", verifyToken, async (req, res) => {
  const { providerOrderId } = req.body;
  const result = await smmRequest("cancel", { orders: providerOrderId });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ message: "Cancel request sent successfully." });
});

app.post("/api/refill-order", verifyToken, async (req, res) => {
  const { providerOrderId, firestoreId } = req.body;
  const result = await smmRequest("refill", { order: providerOrderId });
  if (result.error) return res.status(400).json({ error: result.error });
  const orderRef = db.collection("orders").doc(firestoreId);
  await orderRef.update({ refillId: result.refill });
  res.json({ refillId: result.refill });
});

app.post("/api/refill-status", verifyToken, async (req, res) => {
  const { refillId } = req.body;
  const result = await smmRequest("refill_status", { refill: refillId });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.post("/api/redeem-coin-service", verifyToken, async (req, res) => {
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
      if (userData.coins < service.cost)
        throw new Error(
          `You need at least ${service.cost} coin to redeem this service.`
        );
      const smmResult = await smmRequest("add", {
        service: service.serviceId,
        link,
        quantity: service.quantity,
      });
      if (smmResult.error || !smmResult.order)
        throw new Error(
          `Provider error: ${smmResult.error || "Failed to get order ID."}`
        );
      const newCoinBalance = userData.coins - service.cost;
      transaction.update(userRef, { coins: newCoinBalance });
      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        userId: req.user.uid,
        providerOrderId: smmResult.order,
        serviceName: service.serviceName,
        link,
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

// --- NEW: Routes for Link Shortener Reward System ---
app.post("/api/generate-reward-link", verifyToken, async (req, res) => {
  const { serverType } = req.body;
  const userId = req.user.uid;
  const now = Date.now();
  const COOLDOWN = 24 * 60 * 60 * 1000;

  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  if (!userDoc.exists)
    return res.status(404).json({ error: "User not found." });

  const lastClaimed = userDoc.data().lastClaimed || {};
  const lastClaimTime = lastClaimed[serverType];

  if (lastClaimTime && now - lastClaimTime < COOLDOWN) {
    return res.status(400).json({ error: "This server is on cooldown." });
  }

  const rewardToken = uuidv4();
  const rewardRef = db.collection("reward_tokens").doc(rewardToken);
  await rewardRef.set({
    userId: userId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    claimed: false,
  });

  const longUrl = `${YOUR_FRONTEND_URL}/claim-reward/${rewardToken}`;
  const apiConfig = LINK_SHORTENER_APIS[serverType];
  if (!apiConfig)
    return res.status(400).json({ error: "Invalid server type." });

  try {
    const response = await axios.get(apiConfig.apiUrl, {
      params: { api: apiConfig.apiKey, url: longUrl },
    });

    if (response.data && response.data.status === "success") {
      await userRef.update({
        [`lastClaimed.${serverType}`]: now,
      });
      res.json({ shortUrl: response.data.shortenedUrl });
    } else {
      throw new Error(response.data.message || "Failed to create short link.");
    }
  } catch (error) {
    console.error("ShrinkEarn API Error:", error.message);
    res.status(500).json({ error: "Could not generate reward link." });
  }
});

app.post("/api/add-funds", verifyToken, async (req, res) => {
  const { amount, transactionId } = req.body;
  const { uid, email } = req.user;

  if (!amount || !transactionId) {
    return res
      .status(400)
      .json({ error: "Amount and Transaction ID are required." });
  }

  try {
    await db.collection("fund_requests").add({
      userId: uid,
      userEmail: email,
      amount: parseFloat(amount),
      transactionId: transactionId,
      status: "pending",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({
      message:
        "Fund request submitted successfully. Please wait for admin approval.",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to submit fund request." });
  }
});

app.post("/api/claim-link-reward", verifyToken, async (req, res) => {
  const { rewardToken } = req.body;
  const userId = req.user.uid;

  if (!rewardToken)
    return res.status(400).json({ error: "Reward token is missing." });

  const rewardRef = db.collection("reward_tokens").doc(rewardToken);
  const userRef = db.collection("users").doc(userId);

  try {
    await db.runTransaction(async (transaction) => {
      const rewardDoc = await transaction.get(rewardRef);
      if (!rewardDoc.exists) throw new Error("Invalid or expired reward link.");
      if (rewardDoc.data().userId !== userId)
        throw new Error("This reward link does not belong to you.");
      if (rewardDoc.data().claimed)
        throw new Error("This reward has already been claimed.");

      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const newCoins = (userDoc.data().coins || 0) + 1;

      transaction.update(userRef, { coins: newCoins });
      transaction.update(rewardRef, { claimed: true });
    });
    res.json({ message: "Success! 1 coin has been added to your account." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// --- NEW: SUPPORT TICKET ROUTES FOR USERS ---
app.post("/api/tickets/create", verifyToken, async (req, res) => {
  const { subject, message } = req.body;
  const { uid, email } = req.user;

  if (!subject || !message) {
    return res.status(400).json({ error: "Subject and message are required." });
  }
  try {
    await db.collection("support_tickets").add({
      userId: uid,
      userEmail: email,
      subject,
      message,
      status: "Pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ message: "Support ticket created successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to create support ticket." });
  }
});

app.get("/api/tickets", verifyToken, async (req, res) => {
  try {
    const snapshot = await db
      .collection("support_tickets")
      .where("userId", "==", req.user.uid)
      .orderBy("createdAt", "desc")
      .get();
    const tickets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets." });
  }
});

// --- PROTECTED ADMIN ROUTES ---
// --- NEW: SUPPORT TICKET ROUTES FOR ADMIN ---
app.get("/api/admin/tickets", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db
      .collection("support_tickets")
      .orderBy("createdAt", "desc")
      .get();
    const tickets = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tickets for admin." });
  }
});

app.post("/api/admin/tickets/update-status", verifyAdmin, async (req, res) => {
  const { ticketId, status } = req.body;
  if (!ticketId || !status) {
    return res
      .status(400)
      .json({ error: "Ticket ID and status are required." });
  }
  try {
    await db.collection("support_tickets").doc(ticketId).update({ status });
    res.json({ message: "Ticket status updated successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to update ticket status." });
  }
});
app.get("/api/admin/dashboard-stats", verifyAdmin, async (req, res) => {
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

app.get("/api/admin/balances", verifyAdmin, async (req, res) => {
  try {
    const smmBalance = await smmRequest("balance");
    const adminBalanceDoc = await db
      .collection("admin_panel")
      .doc("main_balance")
      .get();
    const adminBalance = adminBalanceDoc.data() || { secondary_balance: 0 };
    const ordersSnapshot = await db.collection("orders").get();
    const totalUserSpent = ordersSnapshot.docs.reduce(
      (sum, doc) =>
        typeof doc.data().charge === "number" &&
        !doc.data().serviceName.includes("(from Coins)")
          ? sum + doc.data().charge
          : sum,
      0
    );
    res.json({
      primary_balance: smmBalance.balance,
      secondary_balance: adminBalance.secondary_balance,
      total_user_spent: totalUserSpent,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch balances." });
  }
});

app.get("/api/admin/users", verifyAdmin, async (req, res) => {
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

app.get("/api/admin/user/:userId", verifyAdmin, async (req, res) => {
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
    res.json({ details: userDoc.data(), orders });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user details." });
  }
});

app.post("/api/admin/update-balance", verifyAdmin, async (req, res) => {
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

// THIS IS THE MISSING ROUTE
app.get("/api/admin/fund-requests", verifyAdmin, async (req, res) => {
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
// Approve fund request now adds commission to the referrer's WALLET
app.post("/api/admin/approve-fund-request", verifyAdmin, async (req, res) => {
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

      const referredBy = userDoc.data().referredBy;
      let referrerRef = null;
      let referrerDoc = null;
      if (referredBy) {
        referrerRef = db.collection("users").doc(referredBy);
        referrerDoc = await t.get(referrerRef);
      }

      const newUserBalance = (userDoc.data().balance || 0) + amount;
      t.update(userRef, { balance: newUserBalance });
      t.update(requestRef, { status: "approved" });

      if (referrerDoc && referrerDoc.exists) {
        const commission = amount * 0.03; // 3% commission in Rupees
        const newWalletBalance =
          (referrerDoc.data().referral_wallet || 0) + commission;
        t.update(referrerRef, { referral_wallet: newWalletBalance });

        const commissionLogRef = db.collection("referral_commissions").doc();
        t.set(commissionLogRef, {
          referrerId: referredBy,
          referredUserId: userId,
          referredUsername: userDoc.data().username,
          fundedAmount: amount,
          commissionAmount: commission,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    res.json({ message: "Fund request approved successfully." });
  } catch (error) {
    console.error("--- TRANSACTION FAILED ---:", error);
    res.status(500).json({ error: error.message });
  }
});
// THIS IS THE MISSING ROUTE
// THIS IS THE MISSING ROUTE
app.get("/api/my-fund-requests", verifyToken, async (req, res) => {
  try {
    const snapshot = await db
      .collection("fund_requests")
      .where("userId", "==", req.user.uid)
      .orderBy("timestamp", "desc")
      .get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch your fund requests." });
  }
});
// Admin routes for withdrawals
app.get("/api/admin/withdrawal-requests", verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db
      .collection("withdrawal_requests")
      .orderBy("timestamp", "desc")
      .get();
    const requests = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch withdrawal requests." });
  }
});

app.post("/api/admin/complete-withdrawal", verifyAdmin, async (req, res) => {
  const { requestId } = req.body;
  try {
    await db
      .collection("withdrawal_requests")
      .doc(requestId)
      .update({ status: "completed" });
    res.json({ message: "Withdrawal marked as complete." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/referral-history", verifyToken, async (req, res) => {
  const referrerId = req.user.uid;
  try {
    const commissionsSnapshot = await db
      .collection("referral_commissions")
      .where("referrerId", "==", referrerId)
      .orderBy("timestamp", "desc")
      .get();

    const history = commissionsSnapshot.docs.map((doc) => doc.data());

    const referredUsersSnapshot = await db
      .collection("users")
      .where("referredBy", "==", referrerId)
      .get();

    res.json({
      history: history,
      totalReferred: referredUsersSnapshot.size,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch referral history." });
  }
});
// NEW: Route for users to request a withdrawal
app.post("/api/request-withdrawal", verifyToken, async (req, res) => {
  const { upiId, amount } = req.body;
  const userId = req.user.uid;
  const userRef = db.collection("users").doc(userId);

  if (!upiId || !amount || amount < 50) {
    return res
      .status(400)
      .json({ error: "Invalid request. Minimum withdrawal is ₹50." });
  }

  try {
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const walletBalance = userDoc.data().referral_wallet || 0;
      if (walletBalance < amount)
        throw new Error("Insufficient referral balance.");

      const newWalletBalance = walletBalance - amount;
      t.update(userRef, { referral_wallet: newWalletBalance });

      const withdrawalRef = db.collection("withdrawal_requests").doc();
      t.set(withdrawalRef, {
        userId,
        userEmail: userDoc.data().email,
        amount,
        upiId,
        status: "pending",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    res.json({ message: "Withdrawal request submitted successfully." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/approve-fund-request", verifyAdmin, async (req, res) => {
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

      const referredBy = userDoc.data().referredBy;
      let referrerRef = null;
      let referrerDoc = null;
      if (referredBy) {
        referrerRef = db.collection("users").doc(referredBy);
        referrerDoc = await t.get(referrerRef);
      }

      const newUserBalance = (userDoc.data().balance || 0) + amount;
      t.update(userRef, { balance: newUserBalance });
      t.update(requestRef, { status: "approved" });

      if (referrerDoc && referrerDoc.exists) {
        const commission = amount * 0.03; // 3% commission in Rupees
        const newWalletBalance =
          (referrerDoc.data().referral_wallet || 0) + commission;
        t.update(referrerRef, { referral_wallet: newWalletBalance });

        const commissionLogRef = db.collection("referral_commissions").doc();
        t.set(commissionLogRef, {
          referrerId: referredBy,
          referredUserId: userId,
          referredUsername: userDoc.data().username,
          fundedAmount: amount,
          commissionAmount: commission,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    res.json({ message: "Fund request approved successfully." });
  } catch (error) {
    console.error("--- TRANSACTION FAILED ---:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/reject-fund-request", verifyAdmin, async (req, res) => {
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

app.get("/api/admin/services", verifyAdmin, async (req, res) => {
  const services = await smmRequest("services");
  if (services && !services.error) {
    res.json(services);
  } else {
    res.status(500).json({ error: "Failed to fetch services from provider." });
  }
});

app.get("/api/admin/markup-settings", verifyAdmin, async (req, res) => {
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

app.post("/api/admin/markup-settings", verifyAdmin, async (req, res) => {
  const { categoryKey, markupType, markupValue } = req.body;
  if (!categoryKey || !markupType || markupValue === undefined)
    return res.status(400).json({ error: "Missing required fields." });
  try {
    const settingRef = db.collection("markup_settings").doc(categoryKey);
    await settingRef.set({ type: markupType, value: parseFloat(markupValue) });
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

app.get("/api/admin/profit-history", verifyAdmin, async (req, res) => {
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

app.get("/api/admin/all-orders", verifyAdmin, async (req, res) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    const userMap = {};
    usersSnapshot.forEach((doc) => {
      userMap[doc.id] = doc.data().username;
    });
    const ordersSnapshot = await db
      .collection("orders")
      .orderBy("timestamp", "desc")
      .get();
    const orders = ordersSnapshot.docs.map((doc) => {
      const orderData = doc.data();
      return {
        id: doc.id,
        ...orderData,
        username: userMap[orderData.userId] || "Unknown User",
      };
    });
    res.json(orders);
  } catch (error) {
    console.error("Error fetching all orders:", error);
    res.status(500).json({ error: "Failed to fetch all orders history." });
  }
});

// --- START THE SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Backend server is running on http://localhost:${PORT}`);
});

const { db, admin } = require("../config/firebase");
const { smmRequest } = require("../utils/smm");
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const { YOUR_FRONTEND_URL, LINK_SHORTENER_APIS } = require("../config");

const COIN_SERVICES = {
  // --- Instagram ---
  ig_followers: {
    serviceId: "4256",
    quantity: 10,
    cost: 10,
    serviceName: "10 IG Followers (from Coins)",
  },
  reel_views: {
    serviceId: "1348",
    quantity: 500,
    cost: 2,
    serviceName: "500 IG Reel Views (from Coins)",
  },
  likes: {
    serviceId: "34",
    quantity: 20,
    cost: 2.5,
    serviceName: "20 IG Likes (from Coins)",
  },
  post_views: {
    serviceId: "4548",
    quantity: 50,
    cost: 2,
    serviceName: "50 IG Post Views (from Coins)",
  },
  story_views: {
    serviceId: "1155",
    quantity: 100,
    cost: 2,
    serviceName: "100 IG Story Views (from Coins)",
  },

  // --- YouTube ---
  yt_sub: {
    serviceId: "230",
    quantity: 10,
    cost: 3,
    serviceName: "10 YT Subscribers (from Coins)",
  },
  yt_shorts_views: {
    serviceId: "3470",
    quantity: 10,
    cost: 6,
    serviceName: "10 YT Shorts Views (from Coins)",
  },
  yt_likes: {
    serviceId: "1624",
    quantity: 10,
    cost: 2,
    serviceName: "10 YT Likes (from Coins)",
  },

  // --- Telegram ---
  telegram_group_join: {
    serviceId: "4673",
    quantity: 50,
    cost: 2,
    serviceName: "50 Telegram Group Joins (from Coins)",
  },
};

exports.redeemCoinService = async (req, res) => {
  const { link, serviceType } = req.body;
  const userRef = db.collection("users").doc(req.user.uid);

  const service = COIN_SERVICES[serviceType];
  if (!service) return res.status(400).json({ error: "Invalid service type." });
  if (!link) return res.status(400).json({ error: "A link is required." });

  try {
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

    await db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const userData = userDoc.data();
      if (userData.coins < service.cost) {
        throw new Error(
          `You need at least ${service.cost} coin(s) to redeem this service.`
        );
      }

      const newCoinBalance = userData.coins - service.cost;
      transaction.update(userRef, { coins: newCoinBalance });

      const orderRef = db.collection("orders").doc();
      transaction.set(orderRef, {
        userId: req.user.uid,
        providerOrderId: smmResult.order,
        serviceName: service.serviceName,
        serviceId: service.serviceId,
        link,
        quantity: service.quantity,
        charge: 0, // It's a coin order, so charge is 0
        status: "Pending (Coin Order)",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    res.json({
      order: smmResult.order,
      message: "Service redeemed successfully!",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.generateRewardLink = async (req, res) => {
  const { serverType } = req.body;
  const userId = req.user.uid;
  const now = Date.now();
  const COOLDOWN = 24 * 60 * 60 * 1000;

  const userRef = db.collection("users").doc(userId);

  try {
    const userDoc = await userRef.get();
    if (!userDoc.exists)
      return res.status(404).json({ error: "User not found." });

    const lastClaimed = userDoc.data().lastClaimed || {};
    const lastClaimTime = lastClaimed[serverType];

    if (lastClaimTime && now - lastClaimTime < COOLDOWN) {
      return res.status(429).json({ error: "This server is on cooldown." });
    }

    const rewardToken = uuidv4();
    await db.collection("reward_tokens").doc(rewardToken).set({
      userId: userId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      claimed: false,
    });

    const longUrl = `${YOUR_FRONTEND_URL}/claim-reward/${rewardToken}`;
    const apiConfig = LINK_SHORTENER_APIS[serverType];
    if (!apiConfig)
      return res.status(400).json({ error: "Invalid server type." });

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
    console.error("Link Generation API Error:", error.message);
    res.status(500).json({ error: "Could not generate reward link." });
  }
};

exports.claimLinkReward = async (req, res) => {
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

      transaction.update(userRef, {
        coins: admin.firestore.FieldValue.increment(1),
      });
      transaction.update(rewardRef, { claimed: true });
    });
    res.json({ message: "Success! 1 coin has been added to your account." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

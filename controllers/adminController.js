const { db, admin } = require("../config/firebase");
const { smmRequest } = require("../utils/smm");

exports.getDashboardStats = async (req, res) => {
  try {
    const usersSnapshot = await db.collection("users").get();
    const ordersSnapshot = await db.collection("orders").get();
    const fundsSnapshot = await db
      .collection("fund_requests")
      .where("status", "==", "pending")
      .get();
    
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const newUsersTodaySnapshot = await db.collection('users').where('createdAt', '>=', oneDayAgo).get();

    res.json({
      totalUsers: usersSnapshot.size,
      newUsersToday: newUsersTodaySnapshot.size,
      totalOrders: ordersSnapshot.size,
      pendingFunds: fundsSnapshot.size,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch dashboard stats." });
  }
};

exports.getBalances = async (req, res) => {
    try {
        const smmBalance = await smmRequest("balance");
        const adminBalanceDoc = await db.collection("admin_panel").doc("main_balance").get();
        const adminBalance = adminBalanceDoc.data() || { secondary_balance: 0 };

        const profitLedgerSnapshot = await db.collection("profit_ledger").get();
        const totalProfit = profitLedgerSnapshot.docs.reduce(
            (sum, doc) => sum + (doc.data().profit || 0), 0
        );

        res.json({
            primary_balance: smmBalance.balance,
            // secondary_balance is now the total profit calculated
            secondary_balance: totalProfit, 
        });
    } catch (error) {
        console.error("Error fetching balances:", error);
        res.status(500).json({ error: "Failed to fetch balances." });
    }
};

exports.getUsers = async (req, res) => {
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
};

exports.getUserById = async (req, res) => {
  const { userId } = req.params;
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) return res.status(404).json({ error: "User not found." });

    const ordersQuery = await db
      .collection("orders")
      .where("userId", "==", userId)
      .orderBy("timestamp", "desc")
      .get();
    const orders = ordersQuery.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    res.json({ details: userDoc.data(), orders });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user details." });
  }
};

exports.updateUserBalance = async (req, res) => {
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
};

exports.getAllOrders = async (req, res) => {
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
};

exports.getFundRequests = async (req, res) => {
  try {
    const snapshot = await db
      .collection("fund_requests")
      .orderBy("timestamp", "desc")
      .get();
    const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch fund requests." });
  }
};

exports.approveFundRequest = async (req, res) => {
    const { requestId } = req.body;
    const requestRef = db.collection("fund_requests").doc(requestId);

    try {
        await db.runTransaction(async (t) => {
            const requestDoc = await t.get(requestRef);
            if (!requestDoc.exists) throw new Error("Request not found.");

            const { userId, amount, status } = requestDoc.data();
            if (status !== "pending") throw new Error("This request has already been processed.");

            const userRef = db.collection("users").doc(userId);
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new Error("User not found.");

            t.update(userRef, { balance: admin.firestore.FieldValue.increment(amount) });
            t.update(requestRef, { status: "approved" });

            const referredBy = userDoc.data().referredBy;
            if (referredBy) {
                const referrerRef = db.collection("users").doc(referredBy);
                const commission = amount * 0.03; // 3% commission in Rupees
                t.update(referrerRef, { referral_wallet: admin.firestore.FieldValue.increment(commission) });

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
        console.error("--- Approve Fund Request Failed ---:", error);
        res.status(500).json({ error: error.message });
    }
};

exports.rejectFundRequest = async (req, res) => {
  const { requestId } = req.body;
  try {
    await db.collection("fund_requests").doc(requestId).update({ status: "rejected" });
    res.json({ message: "Fund request rejected." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getWithdrawalRequests = async (req, res) => {
    try {
        const snapshot = await db.collection("withdrawal_requests").orderBy("timestamp", "desc").get();
        const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch withdrawal requests." });
    }
};

exports.completeWithdrawal = async (req, res) => {
    const { requestId } = req.body;
    try {
        await db.collection("withdrawal_requests").doc(requestId).update({ status: "completed" });
        res.json({ message: "Withdrawal marked as complete." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getSmmServices = async (req, res) => {
  const services = await smmRequest("services");
  if (services && !services.error) {
    res.json(services);
  } else {
    res.status(500).json({ error: "Failed to fetch services from provider." });
  }
};

exports.getMarkupSettings = async (req, res) => {
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
};

exports.saveMarkupSettings = async (req, res) => {
  const { categoryKey, markupType, markupValue } = req.body;
  if (!categoryKey || !markupType || markupValue === undefined) {
    return res.status(400).json({ error: "Missing required fields." });
  }
  try {
    const settingRef = db.collection("markup_settings").doc(categoryKey);
    await settingRef.set({ type: markupType, value: parseFloat(markupValue) });
    res.json({ message: `Markup for ${categoryKey.replace(/_/g, " ")} saved successfully.` });
  } catch (error) {
    res.status(500).json({ error: "Failed to save markup setting." });
  }
};

exports.getProfitHistory = async (req, res) => {
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
};
const { db, admin } = require("../config/firebase");
const { generateReferralCode } = require("../utils/helpers");

exports.getUserDetails = async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json(userDoc.data());
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user details." });
  }
};

exports.createReferralCode = async (req, res) => {
  const { uid } = req.user;
  const userRef = db.collection("users").doc(uid);

  try {
    const userDoc = await userRef.get();
    if (!userDoc.exists) throw new Error("User not found.");

    const userData = userDoc.data();
    if (userData.referralCode) {
      return res.json({ referralCode: userData.referralCode });
    }

    const newCode = generateReferralCode(userData.username);
    await userRef.update({ referralCode: newCode });

    res.json({ referralCode: newCode });
  } catch (error) {
    res.status(500).json({ error: "Failed to create referral code." });
  }
};

exports.getReferralHistory = async (req, res) => {
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
};

exports.addFunds = async (req, res) => {
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
};

exports.getMyFundRequests = async (req, res) => {
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
};

exports.requestWithdrawal = async (req, res) => {
  const { upiId, amount } = req.body;
  const userId = req.user.uid;
  const userRef = db.collection("users").doc(userId);

  const withdrawalAmount = parseFloat(amount);
  if (!upiId || !withdrawalAmount || withdrawalAmount < 50) {
    return res
      .status(400)
      .json({ error: "Invalid request. Minimum withdrawal is ₹50." });
  }

  try {
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      if (!userDoc.exists) throw new Error("User not found.");

      const walletBalance = userDoc.data().referral_wallet || 0;
      if (walletBalance < withdrawalAmount) {
        throw new Error("Insufficient referral balance.");
      }

      const newWalletBalance = walletBalance - withdrawalAmount;
      t.update(userRef, { referral_wallet: newWalletBalance });

      const withdrawalRef = db.collection("withdrawal_requests").doc();
      t.set(withdrawalRef, {
        userId,
        userEmail: userDoc.data().email,
        amount: withdrawalAmount,
        upiId,
        status: "pending",
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    res.json({ message: "Withdrawal request submitted successfully." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
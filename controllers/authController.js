const { admin, db } = require("../config/firebase");
const { generateReferralCode } = require("../utils/helpers");

exports.signup = async (req, res) => {
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

    await db.collection("users").doc(userRecord.uid).set({
      name,
      username: username.toLowerCase(),
      email,
      balance: 0,
      coins: initialCoins,
      referralCode: generateReferralCode(username),
      referredBy: referredBy,
      referral_wallet: 0,
      lastClaimed: {},
    });

    res.status(201).json({ uid: userRecord.uid });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: error.message || "Failed to create user." });
  }
};

exports.getEmail = async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ error: "Username is required." });
  }
  try {
    const snapshot = await db
      .collection("users")
      .where("username", "==", username.toLowerCase())
      .limit(1)
      .get();
    if (snapshot.empty) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json({ email: snapshot.docs[0].data().email });
  } catch (error) {
    res.status(500).json({ error: "Server error." });
  }
};
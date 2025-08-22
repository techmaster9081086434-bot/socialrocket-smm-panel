// --- 1. SETUP ---
const express = require("express");
const cors = require("cors");
const { PORT } = require("./config");
const crypto = require("crypto");
const { verifyToken, verifyAdmin } = require("./middleware/authMiddleware");
const axios = require("axios");

// --- 2. ROUTE IMPORTS ---
const publicRoutes = require("./routes/publicRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 4. API ROUTES ---
app.use("/api", publicRoutes);
app.use("/api", userRoutes);
app.use("/api/admin", adminRoutes);

const INSTAMOJO_API_KEY = "d7806d3ca3a048520346e50c8084b1c1"; // 👈 Get from your Instamojo Dashboard
const INSTAMOJO_AUTH_TOKEN = "dd34470449016ed9041fe7cc1a62fbfb"; // 👈 Get from your Instamojo Dashboard
const INSTAMOJO_SALT = "b182c90a621f41848f7cf23758408cee"; // 👈 Get from your Instamojo Dashboard
const INSTAMOJO_API_URL = "https://www.instamojo.com/api/1.1/payment-requests/";
const YOUR_BACKEND_URL = "https://socialrocket-smm-panel-2.onrender.com/"; // Your live Render URL

app.post("/api/instamojo-webhook", async (req, res) => {
  const data = req.body;
  console.log("Received Instamojo Webhook:", data);

  // 1. Verify the webhook signature for security
  const mac = data.mac;
  delete data.mac;
  const dataValues = Object.values(data).sort().join("|");
  const calculatedMac = crypto
    .createHmac("sha1", INSTAMOJO_SALT)
    .update(dataValues)
    .digest("hex");

  if (mac !== calculatedMac) {
    console.error("Webhook verification failed. MAC mismatch.");
    return res.status(400).send("Invalid webhook signature.");
  }

  // 2. Check if the payment was successful
  if (data.status === "Credit") {
    const userId = data.buyer_name; // We passed the Firebase UID here
    const amount = parseFloat(data.amount);
    const paymentId = data.payment_id;

    const userRef = db.collection("users").doc(userId);
    try {
      await db.runTransaction(async (t) => {
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) throw new Error("User not found.");
        const newBalance = (userDoc.data().balance || 0) + amount;
        t.update(userRef, { balance: newBalance });

        // Log the successful payment
        t.set(db.collection("successful_payments").doc(paymentId), {
          userId: userId,
          amount: amount,
          status: "completed",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      console.log(`Successfully credited ₹${amount} to user ${userId}.`);
    } catch (error) {
      console.error("Error processing payment:", error);
    }
  }
  res.status(200).send("Webhook received.");
});

app.post("/api/create-payment-link", verifyToken, async (req, res) => {
  const { amount } = req.body;
  const { uid, email, displayName } = req.user;

  if (!amount || amount < 10) {
    return res.status(400).json({ error: "Minimum amount is ₹10." });
  }

  try {
    const response = await axios.post(
      INSTAMOJO_API_URL,
      new URLSearchParams({
        purpose: "Add Funds to SocialRocket",
        amount: amount,
        buyer_name: uid, // Pass the Firebase UID for tracking
        email: email,
        redirect_url: "https://candid-rugelach-b9eb2d.netlify.app/payment-success", // Your frontend success page
        webhook: `${YOUR_BACKEND_URL}/api/instamojo-webhook`,
      }),
      {
        headers: {
          "X-Api-Key": INSTAMOJO_API_KEY,
          "X-Auth-Token": INSTAMOJO_AUTH_TOKEN,
        },
      }
    );

    if (response.data.success) {
      res.json({ payment_url: response.data.payment_request.longurl });
    } else {
      throw new Error("Failed to create payment link.");
    }
  } catch (error) {
    console.error(
      "Instamojo Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Could not create payment link." });
  }
});
// --- 5. START THE SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Backend server is running on http://localhost:${PORT}`);
});

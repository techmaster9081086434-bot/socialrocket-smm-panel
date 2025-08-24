// --- 1. SETUP ---
const express = require("express");
const cors = require("cors");
const { PORT } = require("./config");

// --- 2. ROUTE IMPORTS ---
const publicRoutes = require("./routes/publicRoutes");
const userRoutes = require("./routes/userRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.post("/api/cashfree-webhook", async (req, res) => {
  const data = req.body;
  console.log("Received Cashfree Webhook:", data);

  // It's highly recommended to verify the webhook signature in production
  // For now, we will trust the data for simplicity.

  if (data.data.order.order_status === "PAID") {
    const userId = data.data.order.customer_details.customer_id;
    const amount = parseFloat(data.data.order.order_amount);
    const paymentId = data.data.payment.cf_payment_id;

    const userRef = db.collection("users").doc(userId);
    try {
      await db.runTransaction(async (t) => {
        const userDoc = await t.get(userRef);
        if (!userDoc.exists) throw new Error("User not found.");
        const newBalance = (userDoc.data().balance || 0) + amount;
        t.update(userRef, { balance: newBalance });

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

// --- NEW: Route to create a Cashfree payment session ---



// --- 4. API ROUTES ---
app.use("/api", publicRoutes);
app.use("/api", userRoutes);
app.use("/api/admin", adminRoutes);
// --- 5. START THE SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Backend server is running on http://localhost:${PORT}`);
});

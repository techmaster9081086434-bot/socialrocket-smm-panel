const express = require("express");
const cors = require("cors");
const { verifyToken } = require("./middleware/authMiddleware");
const { verifyAdmin } = require("./middleware/adminMiddleware");

// Import all the route "departments"
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const orderRoutes = require("./routes/orderRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();
const PORT = 5000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ROUTES ---
// Public routes (no token needed)
app.use("/api", authRoutes);
app.use("/api", webhookRoutes);

// Protected user routes (valid user token required)
app.use("/api", verifyToken, userRoutes);
app.use("/api", verifyToken, orderRoutes);

// Protected ADMIN routes (admin token required)
app.use("/api/admin", verifyAdmin, adminRoutes);

// --- START THE SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Backend server is running on http://localhost:${PORT}`);
});

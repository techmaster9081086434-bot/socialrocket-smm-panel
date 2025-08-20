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

// --- 4. API ROUTES ---
app.use("/api", publicRoutes);
app.use("/api", userRoutes);
app.use("/api/admin", adminRoutes);

// --- 5. START THE SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Backend server is running on http://localhost:${PORT}`);
});
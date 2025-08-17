// config/firebaseAdmin.js
const admin = require("firebase-admin");
const path = require("path");

try {
  const serviceAccountPath = path.join(
    __dirname,
    "..",
    "serviceAccountKey.json"
  );
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error(
    "CRITICAL ERROR: Failed to initialize Firebase Admin SDK.",
    error
  );
  process.exit(1);
}

const db = admin.firestore();

module.exports = { admin, db };

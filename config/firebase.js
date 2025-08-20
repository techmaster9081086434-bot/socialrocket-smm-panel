const admin = require("firebase-admin");
require("dotenv").config();

try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_STRINGIFIED) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_STRINGIFIED environment variable not set.");
  }
  
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_STRINGIFIED);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
  console.error(
    "CRITICAL ERROR: Failed to initialize Firebase Admin SDK.",
    error.message
  );
  process.exit(1);
}

const db = admin.firestore();
module.exports = { db, admin };
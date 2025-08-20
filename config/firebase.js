const admin = require("firebase-admin");
const fs = require('fs');
require("dotenv").config();

try {
  // The path where Render stores the secret file
  const serviceAccountPath = '/etc/secrets/firebase-admin-key.json';

  // Check if the secret file exists
  if (fs.existsSync(serviceAccountPath)) {
    // If it exists, load the key from the file
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("Firebase Admin SDK initialized from Secret File successfully.");
  } else {
    // Fallback for local development using the stringified env variable
    // This part should be used ONLY for your local development setup
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_STRINGIFIED) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_STRINGIFIED environment variable not set.");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_STRINGIFIED);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("Firebase Admin SDK initialized from environment variable successfully.");
  }

} catch (error) {
  console.error(
    "CRITICAL ERROR: Failed to initialize Firebase Admin SDK.",
    error.message
  );
  process.exit(1);
}

const db = admin.firestore();
module.exports = { db, admin };

// File: backend/setAdmin.js

const admin = require('firebase-admin');
const path = require('path');

// --- IMPORTANT ---
// Replace this with the email address of the user you want to make an admin.
const ADMIN_EMAIL = "v@mail.com"; 
// -----------------

try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
} catch (error) {
    console.error("CRITICAL ERROR: Could not initialize Firebase Admin SDK.");
    process.exit(1);
}

const setAdminClaim = async (email) => {
    try {
        // 1. Find the user by their email address
        const user = await admin.auth().getUserByEmail(email);

        // 2. Set the custom claim 'admin' to true
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });

        console.log(`✅ Success! ${email} has been made an admin.`);
        console.log("You can now close this script.");
        process.exit(0);

    } catch (error) {
        console.error("❌ Error setting admin claim:", error.message);
        process.exit(1);
    }
};

if (!ADMIN_EMAIL || ADMIN_EMAIL === "your-email@example.com") {
    console.error("Please edit the setAdmin.js file and replace 'your-email@example.com' with your actual admin email address.");
} else {
    setAdminClaim(ADMIN_EMAIL);
}
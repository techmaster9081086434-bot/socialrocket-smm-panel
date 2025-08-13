// --- 1. SETUP ---
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');
const path = require('path');

// --- 2. FIREBASE ADMIN SETUP ---
// Make sure you have the 'serviceAccountKey.json' file in this backend folder.
try {
    const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error("CRITICAL ERROR: Failed to initialize Firebase Admin SDK. Make sure 'serviceAccountKey.json' is in the /backend folder.");
    process.exit(1);
}

const db = admin.firestore();
const app = express();
const PORT = 5000;

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).send({ error: 'Authentication required.' });
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(403).send({ error: 'Invalid or expired token.' });
  }
};

// --- 4. SMM PANEL CONFIGURATION ---
const SMM_API_URL = 'https://cheapestsmmpanels.com/api/v2';
const SMM_API_KEY = '9e76aab997b6f75e1a25825a84fe08fb';

async function smmRequest(action, params = {}) {
    try {
        const postData = { key: SMM_API_KEY, action: action, ...params };
        const response = await axios.post(SMM_API_URL, new URLSearchParams(postData));
        return response.data;
    } catch (error) {
        return { error: `API request to provider failed.` };
    }
}

// --- 5. PUBLIC AUTHENTICATION ROUTES ---
app.post('/api/signup', async (req, res) => {
    const { email, password, username, name } = req.body;
    try {
        const usernameQuery = await db.collection('users').where('username', '==', username.toLowerCase()).get();
        if (!usernameQuery.empty) return res.status(400).json({ error: 'Username is already taken.' });

        const userRecord = await admin.auth().createUser({ email, password, displayName: name });
        
        // Initialize user with a balance of 0
        await db.collection('users').doc(userRecord.uid).set({
            name: name,
            username: username.toLowerCase(),
            email: email,
            balance: 0 
        });

        res.status(201).json({ uid: userRecord.uid });
    } catch (error) {
        if (error.code === 'auth/email-already-exists') return res.status(400).json({ error: 'This email address is already in use.' });
        if (error.code === 'auth/invalid-password') return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

app.post('/api/get-email', async (req, res) => {
    const { username } = req.body;
    if (!username) {
        return res.status(400).json({ error: 'Username or Email is required.' });
    }
    try {
        const snapshot = await db.collection('users').where('username', '==', username.toLowerCase()).limit(1).get();
        if (snapshot.empty) {
            return res.status(404).json({ error: 'User with this username not found.' });
        }
        res.json({ email: snapshot.docs[0].data().email });
    } catch (error) {
        res.status(500).json({ error: 'Server error while finding user.' });
    }
});

// --- 6. PROTECTED API ROUTES ---
app.get('/api/user-details', verifyToken, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User details not found.' });
        res.json(userDoc.data());
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user details.' });
    }
});

app.get('/api/services', verifyToken, async (req, res) => {
    const services = await smmRequest('services');
    if (services && !services.error) {
        res.json(services);
    } else {
        res.status(500).json({ error: 'Failed to fetch services from provider.' });
    }
});

app.post('/api/order', verifyToken, async (req, res) => {
    const { serviceId, link, quantity, serviceName, charge } = req.body;
    const userRef = db.collection('users').doc(req.user.uid);

    try {
        const userDoc = await userRef.get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User not found.' });

        const currentBalance = userDoc.data().balance;
        if (currentBalance < charge) {
            return res.status(400).json({ error: 'Insufficient balance. Please add funds.' });
        }

        const smmResult = await smmRequest('add', { service: serviceId, link, quantity });
        if (smmResult.error) {
            return res.status(500).json({ error: `Provider error: ${smmResult.error}` });
        }

        const newBalance = currentBalance - charge;
        await userRef.update({ balance: newBalance });
        
        await db.collection('orders').add({
            userId: req.user.uid,
            providerOrderId: smmResult.order,
            serviceName: serviceName,
            link: link,
            quantity: quantity,
            charge: charge,
            status: 'Pending',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        res.json({ order: smmResult.order, newBalance: newBalance });

    } catch (error) {
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

app.get('/api/orders', verifyToken, async (req, res) => {
    try {
        const ordersQuery = await db.collection('orders')
                                    .where('userId', '==', req.user.uid)
                                    .orderBy('timestamp', 'desc')
                                    .get();
        
        const orders = ordersQuery.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch order history.' });
    }
});

app.post('/api/add-funds', verifyToken, async (req, res) => {
    const { amount, transactionId } = req.body;
    const { uid, email } = req.user;

    if (!amount || !transactionId) {
        return res.status(400).json({ error: 'Amount and Transaction ID are required.' });
    }

    try {
        await db.collection('fund_requests').add({
            userId: uid,
            userEmail: email,
            amount: parseFloat(amount),
            transactionId: transactionId,
            status: 'pending',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(200).json({ message: 'Fund request submitted successfully. Please wait for admin approval.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit fund request.' });
    }
});

app.post('/api/claim-reward', verifyToken, async (req, res) => {
    const userRef = db.collection('users').doc(req.user.uid);
    try {
        const newBalance = await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) {
                throw new Error("User not found.");
            }
            const currentBalance = userDoc.data().balance;
            const updatedBalance = currentBalance + 1; // Add 1 coin/rupee
            transaction.update(userRef, { balance: updatedBalance });
            return updatedBalance;
        });
        res.status(200).json({ message: 'Reward claimed!', newBalance: newBalance });
    } catch (error) {
        console.error("REWARD CLAIM ERROR:", error);
        res.status(500).json({ error: 'Failed to claim reward.' });
    }
});

// --- 7. START THE SERVER ---
app.listen(PORT, () => {
    console.log(`✅ Backend server with full features is running on http://localhost:${PORT}`);
});
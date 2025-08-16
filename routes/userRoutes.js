const express = require('express');
const { db } = require('../config/firebaseAdmin');
const router = express.Router();

router.get('/user-details', async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (!userDoc.exists) return res.status(404).json({ error: 'User details not found.' });
        res.json(userDoc.data());
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user details.' });
    }
});

router.post('/add-funds', async (req, res) => {
    const { amount, transactionId } = req.body;
    const { uid, email } = req.user;
    if (!amount || !transactionId) return res.status(400).json({ error: 'Amount and Transaction ID are required.' });
    try {
        await db.collection('fund_requests').add({
            userId: uid,
            userEmail: email,
            amount: parseFloat(amount),
            transactionId: transactionId,
            status: 'pending',
            timestamp: new Date()
        });
        res.status(200).json({ message: 'Fund request submitted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit fund request.' });
    }
});

module.exports = router;
const express = require('express');
const { db } = require('../config/firebaseAdmin');
const router = express.Router();

router.get('/offertoro-postback', async (req, res) => {
    const { amount, user_id } = req.query;
    const userId = user_id;
    if (!userId || !amount) return res.status(400).send('Missing parameters');
    const userRef = db.collection('users').doc(userId);
    try {
        await db.runTransaction(async (t) => {
            const doc = await t.get(userRef);
            if (!doc.exists) throw new Error("User not found.");
            const newCoins = (doc.data().coins || 0) + parseFloat(amount);
            t.update(userRef, { coins: newCoins });
        });
        res.status(200).send('1');
    } catch (error) {
        console.error("Postback error:", error);
        res.status(500).send('0');
    }
});

module.exports = router;
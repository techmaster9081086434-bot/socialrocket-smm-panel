const express = require('express');
const { db, auth } = require('../config/firebaseAdmin');
const router = express.Router();

router.post('/signup', async (req, res) => {
    const { email, password, username, name } = req.body;
    try {
        const usernameQuery = await db.collection('users').where('username', '==', username.toLowerCase()).get();
        if (!usernameQuery.empty) return res.status(400).json({ error: 'Username is already taken.' });

        const userRecord = await auth.createUser({ email, password, displayName: name });
        
        await db.collection('users').doc(userRecord.uid).set({
            name: name,
            username: username.toLowerCase(),
            email: email,
            balance: 0,
            coins: 0,
            claimedTrials: []
        });

        res.status(201).json({ uid: userRecord.uid });
    } catch (error) {
        if (error.code === 'auth/email-already-exists') return res.status(400).json({ error: 'This email address is already in use.' });
        if (error.code === 'auth/invalid-password') return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        res.status(500).json({ error: 'Failed to create user.' });
    }
});

router.post('/get-email', async (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username or Email is required.' });
    try {
        const snapshot = await db.collection('users').where('username', '==', username.toLowerCase()).limit(1).get();
        if (snapshot.empty) return res.status(404).json({ error: 'User with this username not found.' });
        res.json({ email: snapshot.docs[0].data().email });
    } catch (error) {
        res.status(500).json({ error: 'Server error while finding user.' });
    }
});

module.exports = router;
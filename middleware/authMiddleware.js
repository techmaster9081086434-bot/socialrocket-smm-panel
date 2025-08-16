const { auth } = require('../config/firebaseAdmin');

const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).send({ error: 'Authentication required.' });
  try {
    req.user = await auth.verifyIdToken(token);
    next();
  } catch (error) {
    res.status(403).send({ error: 'Invalid or expired token.' });
  }
};

module.exports = { verifyToken };
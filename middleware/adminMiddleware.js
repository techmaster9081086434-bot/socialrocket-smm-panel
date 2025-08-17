// middleware/adminMiddleware.js
const { admin } = require("../config/firebaseAdmin");

const verifyAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token)
    return res.status(401).send({ error: "Authentication required." });
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    if (decodedToken.admin !== true) {
      return res
        .status(403)
        .send({ error: "Forbidden. Admin access required." });
    }
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(403).send({ error: "Invalid or expired token." });
  }
};

module.exports = { verifyAdmin };

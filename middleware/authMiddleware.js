const { admin } = require("../config/firebase");

exports.verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).send({ error: "Authentication required. No token provided." });
  }
  try {
    req.user = await admin.auth().verifyIdToken(token);
    next();
  } catch (error) {
    res.status(403).send({ error: "Invalid or expired token." });
  }
};

exports.verifyAdmin = async (req, res, next) => {
  const { uid } = req.user;
  try {
    const user = await admin.auth().getUser(uid);
    if (user.customClaims?.admin === true) {
      return next();
    }
    return res.status(403).send({ error: "Forbidden. Admin access required." });
  } catch (error) {
    return res.status(500).send({ error: "Error verifying admin status." });
  }
};
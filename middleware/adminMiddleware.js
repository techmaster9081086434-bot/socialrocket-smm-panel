const { verifyToken } = require("./authMiddleware");

const verifyAdmin = (req, res, next) => {
  // First, run the normal token verification
  verifyToken(req, res, () => {
    // After verifying the token, check for the admin claim
    if (req.user.admin === true) {
      // If they are an admin, proceed to the requested route
      next();
    } else {
      // If they are not an admin, send an error
      res.status(403).send({ error: "Forbidden. Admin access required." });
    }
  });
};

module.exports = { verifyAdmin };

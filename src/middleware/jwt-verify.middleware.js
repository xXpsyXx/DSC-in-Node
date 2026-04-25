const jwt = require('jsonwebtoken');
const { getPublicKey } = require('../routes/keys.route.js');

exports.verifyBackendJwt = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ success: false, error: 'Missing JWT token' });
      return;
    }

    const publicKey = await getPublicKey();
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    req.signPayload = decoded;
    next();
  } catch (error) {
    console.error('[jwt-verify] JWT verification failed:', error.message);
    res
      .status(401)
      .json({ success: false, error: 'Invalid or expired JWT token' });
  }
};

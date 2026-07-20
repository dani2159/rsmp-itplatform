const requireAuth = (req, res, next) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session?.userId || req.session?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

const requireOperator = (req, res, next) => {
  if (!req.session?.userId || !['admin', 'operator'].includes(req.session?.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

module.exports = { requireAuth, requireAdmin, requireOperator };

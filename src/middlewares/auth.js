export function authMiddleware(req, res, next) {
  const key = req.headers['x-api-key']
  if (!key || key !== process.env.SECRET_KEY) {
    return res.status(403).json({ error: 'Unauthorized' })
  }
  next()
}
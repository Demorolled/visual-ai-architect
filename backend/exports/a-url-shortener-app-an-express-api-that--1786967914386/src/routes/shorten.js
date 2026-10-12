const { saveUrlMapping } = require('../storage.js');

const createShortUrl = (req, res) => {
  const { longUrl } = req.body;
  if (!longUrl) {
    return res.status(400).send('Missing longUrl in request body');
  }
  const shortCode = generateShortCode();
  saveUrlMapping(shortCode, longUrl);
  res.json({ shortCode });
};

const generateShortCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

module.exports = { createShortUrl };
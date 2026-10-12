const { getUrlMapping } = require('../storage.js');

const handleRedirect = (req, res) => {
  const { code } = req.params;
  const longUrl = getUrlMapping(code);
  if (longUrl) {
    res.redirect(longUrl);
  } else {
    res.status(404).send('Short URL not found');
  }
};

module.exports = { handleRedirect };
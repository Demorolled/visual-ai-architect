const express = require('express');
const app = express();
const PORT = 3000;

app.use(express.json());

const shorten = require('./routes/shorten');
const redirect = require('./routes/redirect');

app.post('/shorten', shorten.createShortUrl);
app.get('/:code', redirect.handleRedirect);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
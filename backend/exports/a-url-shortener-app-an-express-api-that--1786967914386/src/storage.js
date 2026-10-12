const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, '../data.json');

const saveUrlMapping = (shortCode, longUrl) => {
  const data = loadOrInitData();
  data[shortCode] = longUrl;
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
};

const getUrlMapping = (shortCode) => {
  const data = loadOrInitData();
  return data[shortCode];
};

const loadOrInitData = () => {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
  } catch (err) {
    return {};
  }
};

module.exports = { saveUrlMapping, getUrlMapping };
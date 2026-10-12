const crypto = require('crypto');

function computeHashes(filePaths) {
  const results = [];

  for (const path of filePaths) {
    try {
      const data = fs.readFileSync(path);
      const hash = crypto.createHash('sha256');
      hash.update(data);
      const hexHash = hash.digest('hex');
      results.push({ path, sha256: hexHash });
    } catch (error) {
      console.error(`Error reading file ${path}:`, error.message);
    }
  }

  return results;
}

module.exports = computeHashes;
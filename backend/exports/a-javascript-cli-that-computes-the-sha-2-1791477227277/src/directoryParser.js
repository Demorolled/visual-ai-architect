const fs = require('fs');
const path = require('path');

/**
 * Recursively parses all files in a directory and returns a list of file paths with sizes.
 *
 * @param {string} rootPath - The root directory to start parsing from.
 * @param {function(string[], Error?)} callback - Called when the parsing is complete, 
 *                                                passing an array of objects containing 
 *                                                the file path and corresponding SHA-256 hash value.
 */
function parseDir(rootPath, callback) {
  const results = [];

  function walk(dir) {
    fs.readdirSync(path.resolve(__dirname + rootPath)).forEach(function (name) {
      const filePath = path.join(dir, name);
      
      try {
        if (fs.statSync(filePath).isDirectory()) { 
          return walk(filePath); 
        }
        
        const fileStat = fs.lstatSync(filePath);
        
        results.push({ path: filePath });
        callback(results, null);
      } catch (error) {
        callback(null, error);
      }
    })
  }

  try {
    walk(rootPath);
  } catch (error) {
    return { status: 'completed', filesFound: results.length };

  return;
}
}

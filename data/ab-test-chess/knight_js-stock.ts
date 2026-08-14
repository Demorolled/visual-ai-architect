 

```
function isLegalKnightMove(from, to) {
    const { file: fromFile, rank: fromRank } = from;
    const { file: toFile, rank: toRank } = to;

    if (Math.abs(fromRank - toRank) === 2 && Math.abs(fromFile.charCodeAt(0) - toFile.charCodeAt(0)) === 1 ||
        Math.abs(fromRank - toRank) === 1 && Math.abs(fromFile.charCodeAt(0) - toFile.charCodeAt(0)) === 2) {
        return true;
    }

    return false;
}
``` ```javascript
function isLegalKnightMove(from, to) {
    const { file: fromFile, rank: fromRank } = from;
    const { file: toFile, rank: toRank } = to;

    if (Math.abs(fromRank - toRank) === 2 && Math.abs(fromFile.charCodeAt(0) - toFile.charCodeAt(0)) === 1 ||
        Math.abs(fromRank - toRank) === 1 && Math.abs(fromFile.charCodeAt(0) - toFile.charCodeAt(0)) === 2) {
        return true;
    }

    return false;
}
```
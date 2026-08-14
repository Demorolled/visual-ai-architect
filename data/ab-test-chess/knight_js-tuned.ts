function isLegalKnightMove(from, to) {
  const dx = Math.abs(from.file.charCodeAt(0) - to.file.charCodeAt(0));
  const dy = Math.abs(from.rank - to.rank);
  return (dx === 2 && dy === 1) || (dx === 1 && dy === 2);
}
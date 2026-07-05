// Fair 1-6 die rolls using the browser's crypto RNG (no Math.random, no modulo bias).
// Rejection sampling: only accept bytes below the largest multiple of 6 under 256,
// so every face 1-6 has exactly equal odds.
export function rollDie() {
  const max = 256 - (256 % 6); // 252
  let byte;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (byte >= max);
  return (byte % 6) + 1;
}

export function rollPool(count) {
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie());
  return rolls;
}

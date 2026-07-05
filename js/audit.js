// Session-wide fairness audit: tracks every die rolled so the distribution
// can be checked against the expected 16.7% per face on a fair d6.
export function createAuditTracker() {
  let counts = [0, 0, 0, 0, 0, 0]; // index 0 = face 1 ... index 5 = face 6

  return {
    record(rolls) {
      rolls.forEach(r => counts[r - 1]++);
    },
    reset() {
      counts = [0, 0, 0, 0, 0, 0];
    },
    getCounts() {
      return counts;
    },
    getTotal() {
      return counts.reduce((a, b) => a + b, 0);
    },
  };
}

// React Native (Hermes) does not expose crypto.randomUUID — use Math.random instead.
// These IDs are used only for file paths and temp keys, not cryptographic purposes.
export function randomId(length = 8): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

// accounts.js — shared parse/format helpers for popup + service worker.
// Loaded via <script> in popup.html and importScripts() in background.js.
// Source-of-truth format (same as account.md): one `email|password` per line, 
// or `email password` separated by space/tabs. Tolerates junk prefix data like row numbers.

/**
 * Parse raw accounts text into [{ email, password }].
 * Tolerates blank lines, `#` comments, and an optional leading "N\t" numbering
 * (so the numbered view of account.md still imports cleanly).
 */
function parseAccounts(text) {
  return (text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      // Attempt to split by |
      if (line.includes("|")) {
         // remove leading numbering: "52  email|pass" -> "email|pass"
         let cleanLine = line.replace(/^\s*\d+\s+/, "").trim();
         const idx = cleanLine.indexOf("|");
         if (idx !== -1) {
             const email = cleanLine.slice(0, idx).trim();
             const password = cleanLine.slice(idx + 1).trim();
             if (email && password) return { email, password };
         }
      } else {
         // Attempt space/tab separation
         // Typical line: "52  culumonshin787@outlook.com    culumonshin787!"
         // We extract the email (contains @) and the password (next word)
         const words = line.split(/\s+/);
         const emailIdx = words.findIndex(w => w.includes("@"));
         if (emailIdx !== -1 && emailIdx + 1 < words.length) {
             const email = words[emailIdx];
             const password = words[emailIdx + 1];
             if (email && password) return { email, password };
         }
      }
      return null;
    })
    .filter(Boolean);
}

// Export for service worker (importScripts attaches to globalThis automatically;
// this guard keeps it safe under Node for syntax/unit checks).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseAccounts };
}

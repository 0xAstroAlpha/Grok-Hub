// popup.js — UI: edit list in one textarea, render accounts, trigger switch.
// parseAccounts() comes from accounts.js (loaded first in popup.html).

const $ = (sel) => document.querySelector(sel);
let metaCache = {};

function relTime(ts) {
  if (!ts) return "unused";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + " mins ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " hours ago";
  return Math.floor(h / 24) + " days ago";
}

let flashTimer;
function flash(text, isError) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("error", !!isError);
  el.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3500);
}

const CLOCK_SVG =
  '<svg viewBox="0 0 24 24" width="12" height="12" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const SWAP_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none"><path d="M4 8h12l-3-3M20 16H8l3 3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Stable color per email so each account is easy to recognize.
function avatarHue(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function renderList(text, meta) {
  const accounts = parseAccounts(text);
  $("#count").textContent = String(accounts.length);
  const ul = $("#accountList");
  ul.replaceChildren();

  if (!accounts.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.innerHTML = "<b>No accounts</b>Go to 'Manage' to paste your accounts and save.";
    ul.appendChild(li);
    return;
  }

  for (const acct of accounts) {
    const m = meta[acct.email] || {};
    const li = document.createElement("li");
    li.className = "acct" + (m.active ? " active" : "");

    const hue = avatarHue(acct.email);
    const avatar = document.createElement("div");
    avatar.className = "acct__avatar";
    avatar.style.background = `linear-gradient(140deg, hsl(${hue} 62% 52%), hsl(${(hue + 40) % 360} 60% 42%))`;
    avatar.textContent = (acct.email[0] || "?").toUpperCase();

    const body = document.createElement("div");
    body.className = "acct__body";

    const emailRow = document.createElement("div");
    emailRow.className = "acct__email";
    
    if (m.seqId) {
      const seqChip = document.createElement("span");
      seqChip.className = "chip seq";
      seqChip.textContent = `#${m.seqId}`;
      emailRow.appendChild(seqChip);
    }
    
    const emailSpan = document.createElement("span");
    emailSpan.textContent = acct.email;
    emailSpan.title = acct.email;
    emailRow.appendChild(emailSpan);
    if (m.points !== undefined && m.points !== null) {
      const ptsChip = document.createElement("span");
      ptsChip.className = "chip points";
      ptsChip.textContent = `🪙 ${m.points}`;
      emailRow.appendChild(ptsChip);
    }

    if (m.active) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = "ACTIVE";
      emailRow.appendChild(chip);
    }

    const metaLine = document.createElement("div");
    metaLine.className = "acct__meta";
    metaLine.innerHTML = CLOCK_SVG + "<span></span>";
    metaLine.querySelector("span").textContent = relTime(m.lastUse);

    body.append(emailRow, metaLine);

    const btn = document.createElement("button");
    btn.className = "switch";
    btn.innerHTML = SWAP_SVG + '<span class="switch__label">Switch</span>';
    btn.addEventListener("click", () => onSwitch(acct.email, btn));

    li.append(avatar, body, btn);
    ul.appendChild(li);
  }
}

function renderHistory(historyItems = []) {
  const ul = $("#historyList");
  ul.replaceChildren();

  if (!historyItems.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.innerHTML = "<b>No history</b>Switched accounts will appear here.";
    ul.appendChild(li);
    return;
  }

  // Display newest first
  for (let i = historyItems.length - 1; i >= 0; i--) {
    const item = historyItems[i];
    const li = document.createElement("li");
    li.className = "acct";

    const hue = avatarHue(item.email);
    const avatar = document.createElement("div");
    avatar.className = "acct__avatar";
    avatar.style.background = `linear-gradient(140deg, hsl(${hue} 62% 52%), hsl(${(hue + 40) % 360} 60% 42%))`;
    avatar.textContent = (item.email[0] || "?").toUpperCase();

    const body = document.createElement("div");
    body.className = "acct__body";

    const emailRow = document.createElement("div");
    emailRow.className = "acct__email";
    const emailSpan = document.createElement("span");
    emailSpan.textContent = item.email;
    emailRow.appendChild(emailSpan);

    if (item.credit !== undefined && item.credit !== null) {
      const ptsChip = document.createElement("span");
      ptsChip.className = "chip points";
      ptsChip.textContent = `🪙 ${item.credit}`;
      emailRow.appendChild(ptsChip);
    }

    const metaLine = document.createElement("div");
    metaLine.className = "acct__meta";
    metaLine.innerHTML = CLOCK_SVG + "<span></span>";
    metaLine.querySelector("span").textContent = new Date(item.timestamp).toLocaleString();

    body.append(emailRow, metaLine);
    li.append(avatar, body);
    ul.appendChild(li);
  }
}

async function onSwitch(email, btn) {
  const label = btn.querySelector(".switch__label");
  btn.disabled = true;
  btn.classList.add("is-busy");
  if (label) label.textContent = "Switching...";
  try {
    const res = await chrome.runtime.sendMessage({ type: "SWITCH_ACCOUNT", email });
    if (res && res.ok) {
      const detail = res.loggedIn
        ? " ✓ logged in."
        : " — submitted; complete captcha/OTP manually if prompted.";
      flash("Switched to " + email + detail);
      const { meta = {}, history = [] } = await chrome.storage.local.get(["meta", "history"]);
      metaCache = meta;
      renderList($("#accounts").value, meta);
      renderHistory(history);
    } else {
      flash("Error: " + ((res && res.error) || "unknown"), true);
    }
  } catch (e) {
    flash("Error: " + String(e), true);
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (label) label.textContent = "Switch";
  }
}

async function save() {
  const text = $("#accounts").value;
  const parsed = parseAccounts(text);
  const emails = new Set(parsed.map((a) => a.email));
  const meta = {};
  let maxSeq = 0;
  
  for (const [email, m] of Object.entries(metaCache)) {
    if (emails.has(email)) {
      meta[email] = m;
      if (m.seqId > maxSeq) maxSeq = m.seqId;
    }
  }
  
  // Assign sequence numbers to new accounts
  for (const a of parsed) {
    if (!meta[a.email]) {
      meta[a.email] = { seqId: ++maxSeq };
    } else if (!meta[a.email].seqId) {
      meta[a.email].seqId = ++maxSeq;
    }
  }

  await chrome.storage.local.set({ accountsText: text, meta });
  metaCache = meta;
  renderList(text, meta);
  flash("Saved " + emails.size + " account(s).");
}

function exportFile() {
  const blob = new Blob([$("#accounts").value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "account.md";
  a.click();
  URL.revokeObjectURL(url);
}

async function init() {
  const { accountsText = "", meta = {}, history = [] } = await chrome.storage.local.get([
    "accountsText",
    "meta",
    "history"
  ]);
  
  // Backfill seqId for any existing accounts that don't have it yet
  const parsed = parseAccounts(accountsText);
  let maxSeq = 0;
  for (const m of Object.values(meta)) {
    if (m.seqId > maxSeq) maxSeq = m.seqId;
  }
  let metaChanged = false;
  for (const a of parsed) {
    if (!meta[a.email]) {
      meta[a.email] = { seqId: ++maxSeq };
      metaChanged = true;
    } else if (!meta[a.email].seqId) {
      meta[a.email].seqId = ++maxSeq;
      metaChanged = true;
    }
  }
  if (metaChanged) {
    await chrome.storage.local.set({ meta });
  }

  metaCache = meta;
  $("#accounts").value = accountsText;
  renderList(accountsText, meta);
  renderHistory(history);

  $("#save").addEventListener("click", save);
  $("#exportBtn").addEventListener("click", exportFile);
  
  $("#clearHistoryBtn").addEventListener("click", async () => {
    await chrome.storage.local.set({ history: [] });
    renderHistory([]);
    flash("History cleared.");
  });

  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.toggle("is-active", p.id === "panel-" + tab.dataset.panel));
    })
  );
}

init();

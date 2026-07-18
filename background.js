// background.js for Grok-Hub
importScripts("accounts.js");

const LOGIN_URL = "https://accounts.x.ai/sign-in?redirect=grok-com&return_to=%2F%3Fq%3D%26reasoningMode%3Dnone%26voice%3Dfalse";
const COOKIE_DOMAINS = ["x.ai", "grok.com"];
const DEBUGGER_PROTOCOL = "1.3";
const TAB_LOAD_TIMEOUT_MS = 20000;

const SEL = {
  email: 'input[type="email"],input[name="email"],input[name="username"]',
  password: 'input[type="password"],input[name="password"]'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- cookies (logout) ----
async function clearGrokCookies() {
  for (const domain of COOKIE_DOMAINS) {
    const cookies = await chrome.cookies.getAll({ domain });
    await Promise.all(
      cookies.map((ck) => {
        const host = ck.domain.replace(/^\./, "");
        const url = `${ck.secure ? "https" : "http"}://${host}${ck.path}`;
        return chrome.cookies.remove({ url, name: ck.name, storeId: ck.storeId }).catch(() => {});
      })
    );
  }
}

// ---- tab handling ----
async function openLoginTab() {
  const tabs = await chrome.tabs.query({ url: "*://*.x.ai/*" });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { url: LOGIN_URL, active: true });
    return tabs[0].id;
  }
  const tab = await chrome.tabs.create({ url: LOGIN_URL, active: true });
  return tab.id;
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(finish, TAB_LOAD_TIMEOUT_MS);
  });
}

// ---- chrome.debugger helpers ----
const dbgAttach = (tabId) =>
  new Promise((res, rej) =>
    chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL, () =>
      chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res()
    )
  );
const dbgDetach = (tabId) =>
  new Promise((res) =>
    chrome.debugger.detach({ tabId }, () => {
      void chrome.runtime.lastError; 
      res();
    })
  );

let attachedTabId = null;

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId === attachedTabId) attachedTabId = null;
});

const dbgSend = (tabId, method, params = {}) =>
  new Promise((res, rej) =>
    chrome.debugger.sendCommand({ tabId }, method, params, (r) =>
      chrome.runtime.lastError ? rej(chrome.runtime.lastError) : res(r)
    )
  );

async function send(tabId, method, params = {}) {
  try {
    if (attachedTabId !== tabId) throw new Error("detached");
    return await dbgSend(tabId, method, params);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (!/detached|not attached|Cannot access|target/i.test(msg)) throw e;
    console.log("[grok-swap] re-attaching after:", msg);
    try { await dbgAttach(tabId); } catch (_) {}
    attachedTabId = tabId;
    await dbgSend(tabId, "Runtime.enable").catch(() => {});
    return await dbgSend(tabId, method, params);
  }
}

async function evalIn(tabId, expression) {
  const r = await send(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return r && r.result ? r.result.value : undefined;
}

async function clickAt(tabId, x, y) {
  await send(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await send(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}

async function clickByText(tabId, texts) {
  const coords = await evalIn(
    tabId,
    `(() => {
      const vis = (e) => !!(e && (e.offsetParent !== null || e.getClientRects().length));
      const els = [...document.querySelectorAll('button,a,[role="button"],div,span')];
      for (const t of ${JSON.stringify(texts)}) {
        const e = els.find((x) => vis(x) && x.textContent.trim().toLowerCase() === t);
        if (e) { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
      }
      return null;
    })()`
  );
  if (!coords) return false;
  await clickAt(tabId, coords.x, coords.y);
  return true;
}

async function clickSelector(tabId, selector) {
  const coords = await evalIn(
    tabId,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el || el.disabled) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    })()`
  );
  if (!coords) return false;
  await clickAt(tabId, coords.x, coords.y);
  return true;
}

async function typeInto(tabId, selector, text) {
  const sel = JSON.stringify(selector);
  const coords = await evalIn(
    tabId,
    `(() => { const el = document.querySelector(${sel}); if (!el) return null;
      const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`
  );
  if (!coords) return false;
  await clickAt(tabId, coords.x, coords.y);
  await sleep(120);
  await evalIn(tabId, `(() => { const el = document.querySelector(${sel}); if (el) el.focus(); })()`);
  await dbgSend(tabId, "Input.insertText", { text }).catch(() => {});

  const val = await evalIn(tabId, `(() => { const el = document.querySelector(${sel}); return el ? el.value : null; })()`);
  if (val !== text) {
    await evalIn(
      tabId,
      `(() => { const el = document.querySelector(${sel}); if (!el) return;
        const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
        d && d.set ? d.set.call(el, ${JSON.stringify(text)}) : (el.value = ${JSON.stringify(text)});
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true })); })()`
    );
  }
  return true;
}

const HAS_EMAIL_INPUT = `!!document.querySelector('input[type="email"],input[name="email"],input[name="username"]')`;
const HAS_PW = `!!document.querySelector('input[type="password"],input[name="password"]')`;

async function waitFor(tabId, expr, timeout, interval = 250) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evalIn(tabId, expr).catch(() => false)) return true;
    await sleep(interval);
  }
  return false;
}

async function driveLogin(tabId, acct) {
  await dbgSend(tabId, "Runtime.enable");
  const log = (...a) => console.log("[grok-swap]", ...a);

  // 1. Click "login with email"
  log("Looking for login with email option...");
  let clickedEmailOpt = false;
  for (let i = 0; i < 20; i++) {
    if (await clickByText(tabId, ["login with email", "sign in with email", "continue with email", "email"])) {
      clickedEmailOpt = true;
      break;
    }
    await sleep(250);
  }
  
  if (!clickedEmailOpt) {
    // maybe email input is already visible?
    const hasInput = await waitFor(tabId, HAS_EMAIL_INPUT, 2000);
    if (!hasInput) {
       return { ok: false, error: "Could not find 'login with email' button." };
    }
  }

  // 2. Wait for email input & fill it
  log("Waiting for email input...");
  const emailReady = await waitFor(tabId, HAS_EMAIL_INPUT, 5000);
  if (!emailReady) return { ok: false, error: "Could not open email login form." };

  log("Filling email...");
  await typeInto(tabId, SEL.email, acct.email);
  await sleep(200);

  // 3. Click "next"
  log("Clicking next...");
  await clickByText(tabId, ["next", "continue"]);
  
  // 4. Wait for password input & fill it
  log("Waiting for password input...");
  const pwReady = await waitFor(tabId, HAS_PW, 5000);
  if (!pwReady) return { ok: false, error: "Could not reach password input. Maybe email is wrong or captcha required." };

  log("Filling password...");
  await typeInto(tabId, SEL.password, acct.password);
  log("Waiting 5 seconds for Cloudflare verify...");
  await sleep(5000);

  // 5. Click "login"
  log("Clicking login...");
  let submitted = false;
  for (let i = 0; i < 15; i++) {
    if (await clickByText(tabId, ["login", "sign in", "continue", "submit"])) {
       submitted = true; break;
    }
    await sleep(200);
  }
  
  if (!submitted) return { ok: false, error: "Could not click Login/Submit button." };

  // Best effort confirm
  let loggedIn;
  try {
    loggedIn = await waitFor(tabId, `!(${HAS_PW})`, 3000, 300);
  } catch (_) {
    loggedIn = undefined;
  }
  
  return { ok: true, submitted: true, loggedIn };
}

async function switchAccount(email) {
  const { accountsText = "", meta = {} } = await chrome.storage.local.get(["accountsText", "meta"]);
  const accounts = parseAccounts(accountsText);
  const acct = accounts.find((a) => a.email === email);
  if (!acct) throw new Error("Account not found: " + email);

  await clearGrokCookies();
  const tabId = await openLoginTab();
  await waitForTabComplete(tabId);
  console.log("[grok-swap] switch", email, "tabId", tabId);

  let result;
  try {
    await dbgAttach(tabId);
  } catch (e) {
    throw new Error("Failed to attach debugger: " + (e && e.message ? e.message : e));
  }
  attachedTabId = tabId;
  try {
    result = await driveLogin(tabId, acct);
  } finally {
    if (attachedTabId === tabId) {
      await dbgDetach(tabId);
      attachedTabId = null;
    }
  }

  // Record history
  const { history = [] } = await chrome.storage.local.get("history");
  const historyEntry = { email, timestamp: Date.now() };
  history.push(historyEntry);
  if (history.length > 50) history.shift();

  // Mark target active + stamp last-use; clear active on the rest.
  const newMeta = {};
  for (const a of accounts) newMeta[a.email] = { ...(meta[a.email] || {}), active: a.email === email };
  newMeta[email] = { ...newMeta[email], lastUse: Date.now(), active: true };
  
  await chrome.storage.local.set({ meta: newMeta, history });

  // Redirect to grok.com if login was submitted
  if (result && result.submitted) {
    await chrome.tabs.update(tabId, { url: "https://grok.com/" });
  }

  return result;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "SWITCH_ACCOUNT") {
    switchAccount(msg.email)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message ? e.message : e) }));
    return true; // async
  }
  return false;
});

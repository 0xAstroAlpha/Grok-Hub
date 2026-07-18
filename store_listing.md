# Store Listing: Grok-Hub

## Title
Grok-Hub

## Summary
Quickly manage and switch between multiple Grok accounts with a single click.

## Description
Grok-Hub is a powerful, secure Chrome extension designed to help you manage multiple Grok accounts seamlessly. If you find yourself frequently logging in and out of different accounts, Grok-Hub automates the entire process for you.

**Key Features:**
- **Multi-Account Management:** Add and organize all your accounts in a secure local list.
- **One-Click Switch:** No more manual logging out, entering emails, and passwords. Just click "Switch" and Grok-Hub handles the rest.
- **Secure by Design:** Your credentials are saved locally in your browser and are never sent to any external server. 
- **Automated Login Flow:** It interacts directly with the login page via trusted browser APIs to navigate captchas and dynamic React forms securely.

## Single Purpose Description
Grok-Hub's single purpose is to allow users to securely store and switch between multiple Grok (x.ai) accounts with a single click, automating the manual logout and login process.

## Permission Justifications
- **`storage`**: Required to securely save the user's encrypted account list (emails and passwords) locally on their device.
- **`cookies`**: Required to clear the session cookies for `x.ai` and `grok.com` so that the extension can log out the current user before logging into a new account.
- **`tabs`**: Required to open a new tab or update an existing tab to navigate to the Grok login page during the account switching process.
- **`debugger`**: Required to attach to the login tab and dispatch trusted input events (mouse clicks and keystrokes). This is strictly necessary because the modern authentication flow on x.ai uses complex front-end frameworks and security measures that ignore standard DOM click events from content scripts.
- **Host Permissions (`*://*.x.ai/*`, `*://*.grok.com/*`)**: Required to observe network requests on the login page and manage cookies strictly for Grok domains.

## Remote Code Justification
The extension uses `Runtime.evaluate` via the `chrome.debugger` API. This is not arbitrary remote code execution; it is used strictly to execute tiny, static DOM-query scripts within the isolated context of the login page to locate the coordinates of input fields (email, password) and buttons (Sign In, Next) so that trusted click events can be dispatched accurately. No external scripts are fetched or executed.

---

# Privacy Policy

**Effective Date:** July 17, 2026

**1. Information Collection and Use**
Grok-Hub ("the Extension") requires users to input email addresses and passwords to function. **All data is stored locally** on your device using Chrome's local storage API. The Extension does NOT collect, transmit, or share any personal data, analytics, or credentials to any third-party servers, nor to the developer's servers. 

**2. Local-First Architecture**
Grok-Hub operates entirely locally on your machine. Your credentials remain in your browser and are only ever used locally to automate the login flow on the official `x.ai` domains.

**3. No Sale of Personal Data**
Because we do not transmit or possess your data, user data is **never** sold or shared with any third parties under any circumstances.

**4. Permissions**
- `debugger` is used strictly to simulate typing and clicking on the official login page.
- `cookies` is used strictly to log you out of your current session before switching accounts.

**5. Contact**
If you have questions regarding this Privacy Policy, please open an issue on the project's repository.

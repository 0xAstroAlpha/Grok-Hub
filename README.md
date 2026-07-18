# Grok-Hub

Chrome extension to manage and quickly switch between multiple Grok accounts. 
It uses the Chrome Debugger API to securely navigate the login flow without needing manual interaction.

## Features
- **Multi-Account Manager**: Add multiple Grok accounts in the `Manage` tab.
- **One-Click Switch**: Automatically clears cookies and logs into the target account.
- **Secure automation**: Uses Chrome Debugger to send trusted input events (so it works with modern captchas and React).

## Installation
1. Go to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `Grok-Hub` directory.

## Usage
1. Open the Grok-Hub popup.
2. Go to the **Manage** tab.
3. Paste your accounts in the format `email|password`, one per line.
4. Click **Save**.
5. Go to the **Accounts** tab and click **Switch** on the account you want to log into.

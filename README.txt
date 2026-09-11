# Velron Ventures — Firebase Hosting

This is a plain HTML/CSS/JavaScript version of the Velron Ventures website.

## Deploy

1. Install Firebase CLI if you haven't already:
   npm install -g firebase-tools

2. Log in:
   firebase login

3. Open this folder in Terminal:
   cd velron-ventures

4. Deploy:
   firebase deploy --only hosting

Your Firebase Hosting URL will be shown by Firebase after deployment.

The contact form uses your visitor's email client to prepare an email to:
hello@velronventures.com

Replace that email address in `index.html` and `script.js` if you want to use a different address.

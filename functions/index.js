const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

setGlobalOptions({maxInstances: 10});
initializeApp();

const ALLOWED_ORIGINS = [
  "https://dwarka.web.app",
  "https://dwarka.firebaseapp.com",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
];

function setCors(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  } else {
    res.set("Access-Control-Allow-Origin", ALLOWED_ORIGINS[0]);
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
}

exports.submitContact = onRequest({cors: false}, async (req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "Method not allowed"});
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const phone = String(body.phone || "").trim();
    const company = String(body.company || "").trim();
    const plan = String(body.plan || "").trim();
    const message = String(body.message || "").trim();
    const consent = Boolean(body.consent);

    if (!name || !email || !message || !consent) {
      res.status(400).json({ok: false, error: "Please complete all required fields and accept the consent checkbox."});
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ok: false, error: "Please enter a valid email address."});
      return;
    }

    const db = getFirestore();
    await db.collection("contactSubmissions").add({
      name,
      email,
      phone,
      company,
      plan,
      message,
      consent,
      createdAt: FieldValue.serverTimestamp(),
      userAgent: req.get("user-agent") || "",
    });

    logger.info("Contact submission saved", {email, plan});
    res.status(200).json({ok: true, message: "Thanks, we'll be in touch shortly"});
  } catch (err) {
    logger.error("Contact submission failed", err);
    res.status(500).json({ok: false, error: "Something went wrong. Please try again or use the contact form."});
  }
});

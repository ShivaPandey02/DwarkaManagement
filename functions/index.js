const crypto = require("crypto");
const {setGlobalOptions} = require("firebase-functions/v2");
const {onRequest} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const logger = require("firebase-functions/logger");

setGlobalOptions({maxInstances: 3});
initializeApp();

const ALLOWED_ORIGINS = new Set([
  "https://dwarka.web.app",
  "https://dwarka.firebaseapp.com",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
]);
const uploadRateLimits = new Map();
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;
const MAX_LEGAL_DOCUMENTS = 5;
const APPROVAL_VERSION = "contact-enquiry-approval-v1";
const APPROVAL_TEXT = "I confirm this enquiry is accurate and approve the submitted information for review. This approval is not a service or investment agreement.";

function setCors(req, res) {
  const origin = req.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
}

function rateLimitExceeded(req) {
  const forwardedFor = req.get("x-forwarded-for") || "";
  const clientAddress = String(req.ip || forwardedFor.split(",")[0] || "unknown").trim();
  const now = Date.now();
  const key = crypto.createHash("sha256").update(clientAddress).digest("hex");
  const current = uploadRateLimits.get(key);
  if (current && current.expiresAt > now && current.count >= 5) return true;
  if (!current || current.expiresAt <= now) {
    uploadRateLimits.set(key, {count: 1, expiresAt: now + 60 * 60 * 1000});
  } else {
    current.count += 1;
  }
  if (uploadRateLimits.size > 2000) {
    for (const [entryKey, value] of uploadRateLimits.entries()) {
      if (value.expiresAt <= now) uploadRateLimits.delete(entryKey);
    }
  }
  return false;
}

function text(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function validateAndDecodeFile(file, {kind, allowedTypes, maxBytes = MAX_FILE_BYTES}) {
  if (!file || typeof file !== "object") throw new Error(`Missing ${kind} file.`);
  const contentType = String(file.contentType || "").toLowerCase();
  const encoded = String(file.base64 || "");
  if (!allowedTypes.has(contentType)) throw new Error(`Unsupported file type for ${kind}.`);
  if (!encoded || encoded.length > Math.ceil(maxBytes * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error(`${kind} exceeds the file size limit or is invalid.`);
  }

  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > maxBytes || bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new Error(`${kind} exceeds the file size limit or is invalid.`);
  }

  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const isPdf = bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const matchesType = (contentType === "image/png" && isPng) ||
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "application/pdf" && isPdf);
  if (!matchesType) throw new Error(`The ${kind} file contents do not match the selected file type.`);

  const extension = contentType === "application/pdf" ? "pdf" : contentType === "image/jpeg" ? "jpg" : "png";
  return {bytes, contentType, extension};
}

function uploadedFilesFromBody(body) {
  const legalDocuments = Array.isArray(body.attachments) ? body.attachments : [];
  if (legalDocuments.length > MAX_LEGAL_DOCUMENTS) throw new Error("You can attach up to five legal documents.");
  const attachments = legalDocuments.map((file) => ({
    kind: "legalDocument",
    ...validateAndDecodeFile(file, {
      kind: "legal document",
      allowedTypes: new Set(["application/pdf", "image/jpeg", "image/png"]),
    }),
  }));

  const hasFront = Boolean(body.idFront);
  const hasBack = Boolean(body.idBack);
  if (hasFront !== hasBack) throw new Error("Upload both sides of your ID, or leave both fields empty.");
  if (hasFront) {
    attachments.push({
      kind: "idFront",
      ...validateAndDecodeFile(body.idFront, {
        kind: "ID front",
        allowedTypes: new Set(["image/jpeg", "image/png"]),
        maxBytes: 4 * 1024 * 1024,
      }),
    });
    attachments.push({
      kind: "idBack",
      ...validateAndDecodeFile(body.idBack, {
        kind: "ID back",
        allowedTypes: new Set(["image/jpeg", "image/png"]),
        maxBytes: 4 * 1024 * 1024,
      }),
    });
  }
  const totalBytes = attachments.reduce((sum, file) => sum + file.bytes.length, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw new Error("All uploads together must be 14 MB or smaller.");
  return attachments;
}

exports.secureContactSubmission = onRequest({cors: false, memory: "1GiB", timeoutSeconds: 120}, async (req, res) => {
  setCors(req, res);
  const origin = req.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.status(403).json({ok: false, error: "This website origin is not allowed."});
    return;
  }

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, error: "Method not allowed"});
    return;
  }
  if (rateLimitExceeded(req)) {
    res.status(429).json({ok: false, error: "Too many submissions. Please try again later."});
    return;
  }

  const uploadedObjectPaths = [];
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const name = text(body.name, 120);
    const email = text(body.email, 254).toLowerCase();
    const phone = text(body.phone, 40);
    const company = text(body.company, 160);
    const plan = text(body.plan, 60);
    const message = text(body.message, 4000);
    const consent = body.consent === true;
    const documentConsent = body.documentConsent === true;

    if (!name || !email || !phone || !message || !consent) {
      res.status(400).json({ok: false, error: "Complete the required fields and accept the contact consent."});
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ok: false, error: "Enter a valid email address."});
      return;
    }

    const attachments = uploadedFilesFromBody(body);
    if (attachments.length && !documentConsent) {
      res.status(400).json({ok: false, error: "Confirm that you are authorized to submit these files and approve their review."});
      return;
    }

    const signature = body.signature || {};
    let signatureObject = null;
    let typedSignature = "";
    if (signature.kind === "drawn") {
      signatureObject = validateAndDecodeFile(signature, {
        kind: "signature",
        allowedTypes: new Set(["image/png"]),
        maxBytes: 1024 * 1024,
      });
    } else if (signature.kind === "typed") {
      typedSignature = text(signature.name, 100);
      if (typedSignature.length < 2) throw new Error("Draw your signature or type your full name to approve the enquiry.");
    } else {
      throw new Error("A signature is required to approve the enquiry.");
    }

    const storageBucketName = process.env.DWARKA_DOCUMENT_BUCKET ||
      (() => {
        try { return JSON.parse(process.env.FIREBASE_CONFIG || "{}").storageBucket || ""; } catch (_) { return ""; }
      })();
    const allFiles = [...attachments];
    if (signatureObject) allFiles.push({kind: "signature", ...signatureObject});
    if (allFiles.length && !storageBucketName) {
      res.status(503).json({ok: false, error: "Secure document storage is not configured yet. Please contact us directly."});
      return;
    }

    const db = getFirestore();
    const submissionRef = db.collection("contactSubmissions").doc();
    const bucket = allFiles.length ? getStorage().bucket(storageBucketName) : null;

    for (const item of allFiles) {
      const objectPath = `private-contact-submissions/${submissionRef.id}/${item.kind}-${crypto.randomUUID()}.${item.extension}`;
      await bucket.file(objectPath).save(item.bytes, {
        resumable: false,
        metadata: {
          contentType: item.contentType,
          cacheControl: "private, no-store",
          metadata: {submissionId: submissionRef.id, kind: item.kind},
        },
      });
      uploadedObjectPaths.push(objectPath);
      item.objectPath = objectPath;
      if (item.kind === "signature" && signatureObject) signatureObject.objectPath = objectPath;
    }

    await submissionRef.set({
      name,
      email,
      phone,
      company,
      plan,
      message,
      contactConsent: consent,
      documentConsent,
      documentPaths: attachments.map(({kind, objectPath, contentType, bytes}) => ({kind, objectPath, contentType, sizeBytes: bytes.length})),
      approval: signatureObject
        ? {kind: "drawn", signaturePath: signatureObject.objectPath, text: APPROVAL_TEXT, version: APPROVAL_VERSION, signedAt: FieldValue.serverTimestamp()}
        : {kind: "typed", typedName: typedSignature, text: APPROVAL_TEXT, version: APPROVAL_VERSION, signedAt: FieldValue.serverTimestamp()},
      createdAt: FieldValue.serverTimestamp(),
    });

    logger.info("Contact submission saved", {submissionId: submissionRef.id, attachmentCount: attachments.length});
    res.status(200).json({ok: true, message: "Your enquiry and approval have been received."});
  } catch (err) {
    if (uploadedObjectPaths.length) {
      try {
        const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
        const configuredBucket = process.env.DWARKA_DOCUMENT_BUCKET || firebaseConfig.storageBucket;
        const bucket = configuredBucket ? getStorage().bucket(configuredBucket) : null;
        if (bucket) await Promise.all(uploadedObjectPaths.map((path) => bucket.file(path).delete({ignoreNotFound: true})));
      } catch (cleanupError) {
        logger.error("Unable to clean up partial private upload", {message: cleanupError.message});
      }
    }
    if (err.message && /Unsupported file|exceeds the file size|file contents|Upload both|attach up to|14 MB|signature|Missing .* file/i.test(err.message)) {
      res.status(400).json({ok: false, error: err.message});
      return;
    }
    logger.error("Contact submission failed", {message: err.message || "Unknown error"});
    res.status(500).json({ok: false, error: "Submission could not be saved. Please try again or contact us directly."});
  }
});

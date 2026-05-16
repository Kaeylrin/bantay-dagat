import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Initialize Firebase Admin SDK (only once)
if (!admin.apps.length) {
  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    // Inline JSON (useful for cloud deployments)
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(serviceAccount);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    // File path to service account key JSON — resolve from project root
    const keyPath = resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));
    credential = admin.credential.cert(serviceAccount);
  } else {
    // Try Application Default Credentials (works in GCP environments)
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  });
}

const adminAuth = admin.auth();
const adminDb = admin.database();

/**
 * Middleware: Verify the request is from an authenticated admin user.
 * Expects the Firebase ID token in the Authorization header.
 */
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    // Check the user's role in the database
    const snap = await adminDb.ref(`users/${decoded.uid}/role`).once("value");
    if (snap.val() !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin role required." });
    }
    req.adminUid = decoded.uid;
    next();
  } catch (err) {
    console.error("Auth verification error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

/**
 * DELETE /api/admin/delete-user/:uid
 * Deletes a user from Firebase Auth (and their RTDB profile).
 * Only accessible by authenticated admin users.
 */
async function handleDeleteUser(req, res) {
  const uid = req.query.uid || req.params.uid;

  if (!uid) {
    return res.status(400).json({ error: "User UID is required." });
  }

  // Prevent admin from deleting themselves
  if (uid === req.adminUid) {
    return res.status(400).json({ error: "You cannot delete your own admin account." });
  }

  try {
    // Delete from Firebase Auth — this makes the email completely dead
    // and reusable for future account creation
    await adminAuth.deleteUser(uid);

    // Also delete from RTDB
    await adminDb.ref(`users/${uid}`).remove();

    return res.json({ success: true, message: "User deleted from Auth and database." });
  } catch (err) {
    // If user doesn't exist in Auth, still clean up RTDB
    if (err.code === "auth/user-not-found") {
      await adminDb.ref(`users/${uid}`).remove().catch(() => {});
      return res.json({ success: true, message: "User was already removed from Auth." });
    }
    console.error("Error deleting user:", err);
    return res.status(500).json({ error: err.message || "Failed to delete user." });
  }
}

export { requireAdmin, handleDeleteUser };

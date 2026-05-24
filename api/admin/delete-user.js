import admin from "firebase-admin";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if (!admin.apps.length) {
  let credential;

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    );
    credential = admin.credential.cert(serviceAccount);
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const keyPath = resolve(
      process.cwd(),
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
    );
    const serviceAccount = JSON.parse(readFileSync(keyPath, "utf-8"));
    credential = admin.credential.cert(serviceAccount);
  } else {
    credential = admin.credential.applicationDefault();
  }

  admin.initializeApp({
    credential,
    databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  });
}

const adminAuth = admin.auth();
const adminDb = admin.database();

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    return res.status(200).end();
  }

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE, OPTIONS");
    return res
      .status(405)
      .json({ error: `Method ${req.method} not allowed.` });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid authorization header." });
  }

  const idToken = authHeader.split("Bearer ")[1];
  let adminUid;
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const snap = await adminDb.ref(`users/${decoded.uid}/role`).once("value");
    if (snap.val() !== "admin") {
      return res
        .status(403)
        .json({ error: "Access denied. Admin role required." });
    }
    adminUid = decoded.uid;
  } catch (err) {
    console.error("Auth verification error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const { uid } = req.query;

  if (!uid) {
    return res.status(400).json({ error: "User UID is required." });
  }

  if (uid === adminUid) {
    return res
      .status(400)
      .json({ error: "You cannot delete your own admin account." });
  }

  try {
    await adminAuth.deleteUser(uid);
    await adminDb.ref(`users/${uid}`).remove();
    return res.json({
      success: true,
      message: "User deleted from Auth and database.",
    });
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      await adminDb
        .ref(`users/${uid}`)
        .remove()
        .catch(() => {});
      return res.json({
        success: true,
        message: "User was already removed from Auth.",
      });
    }
    console.error("Error deleting user:", err);
    return res
      .status(500)
      .json({ error: err.message || "Failed to delete user." });
  }
}

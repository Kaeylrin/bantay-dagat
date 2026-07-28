import admin from "firebase-admin";
import { Resend } from "resend";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
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
const resend = new Resend(process.env.RESEND_API_KEY);

async function requireAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }
  const idToken = authHeader.split("Bearer ")[1];
  const decoded = await adminAuth.verifyIdToken(idToken);
  const snap = await adminDb.ref(`users/${decoded.uid}/role`).once("value");
  if (snap.val() !== "admin") throw new Error("FORBIDDEN");
  return decoded.uid;
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdmin(req);
  } catch (e) {
    if (e.message === "UNAUTHORIZED") return res.status(401).json({ error: "Unauthorized" });
    if (e.message === "FORBIDDEN") return res.status(403).json({ error: "Forbidden" });
    return res.status(401).json({ error: "Invalid token" });
  }

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  try {
    // Generate Firebase password reset link via Admin SDK
    const resetLink = await adminAuth.generatePasswordResetLink(email, {
      url: "https://bantaydagat.site/reset-password",
    });

    // Extract oobCode and build direct link to bantaydagat.site
    const url = new URL(resetLink);
    const oobCode = url.searchParams.get("oobCode");
    if (!oobCode) return res.status(500).json({ error: "Failed to generate reset code." });

    const directLink = `https://bantaydagat.site/reset-password?mode=resetPassword&oobCode=${oobCode}`;

    // Send branded email via Resend
    const { error: sendError } = await resend.emails.send({
      from: "BantayDagat <noreply@bantaydagat.site>",
      to: [email],
      subject: "Reset your BantayDagat password",
      html: `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
          <body style="margin:0;padding:0;background-color:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0"
                    style="background-color:#1e293b;border-radius:16px;border:1px solid #334155;max-width:480px;overflow:hidden;">
                    <tr>
                      <td align="center" style="padding:32px 32px 24px;">
                        <img src="https://bantaydagat.site/bantay-dagat.png" alt="BantayDagat" width="72" height="72"
                          style="border-radius:12px;margin-bottom:16px;display:block;" />
                        <h1 style="color:#ffffff;font-size:24px;font-weight:700;margin:0 0 4px;">BantayDagat</h1>
                        <p style="color:#64748b;font-size:13px;margin:0;">Water Quality Monitoring System</p>
                      </td>
                    </tr>
                    <tr><td style="padding:0 32px;"><div style="height:1px;background-color:#334155;"></div></td></tr>
                    <tr>
                      <td style="padding:32px;">
                        <h2 style="color:#ffffff;font-size:18px;font-weight:600;margin:0 0 12px;">Reset Your Password</h2>
                        <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 24px;">
                          Hello,<br/><br/>
                          A password reset was requested for your <strong style="color:#ffffff;">BantayDagat</strong> account
                          (<span style="color:#34d399;">${email}</span>).<br/><br/>
                          Click the button below to set a new password. This link will expire in <strong style="color:#ffffff;">1 hour</strong>.
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center">
                              <a href="${directLink}"
                                style="display:inline-block;background:linear-gradient(135deg,#10b981,#0d9488);color:#ffffff;
                                       font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;
                                       border-radius:10px;">
                                Reset Password →
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="color:#64748b;font-size:12px;line-height:1.6;margin:24px 0 0;text-align:center;">
                          If you didn't request this, you can safely ignore this email.<br/>This link expires in 1 hour.
                        </p>
                      </td>
                    </tr>
                    <tr><td style="padding:0 32px;"><div style="height:1px;background-color:#334155;"></div></td></tr>
                    <tr>
                      <td align="center" style="padding:20px 32px;">
                        <p style="color:#475569;font-size:12px;margin:0;">© 2025 BantayDagat · IoT-Based Water Quality Monitoring</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (sendError) {
      console.error("Resend error:", sendError);
      return res.status(500).json({ error: sendError.message || "Failed to send email." });
    }

    return res.json({ success: true, message: `Password reset email sent to ${email}.` });
  } catch (err) {
    console.error("Error:", err);
    if (err.code === "auth/user-not-found") return res.status(404).json({ error: "User not found." });
    return res.status(500).json({ error: err.message || "Failed to send reset email." });
  }
}

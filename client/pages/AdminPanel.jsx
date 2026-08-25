import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  UserPlus,
  Users,
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  KeyRound,
  Pencil,
  X,
  Check,
  Mail,
} from "lucide-react";
import {
  db,
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  off,
  createRangerInFirebase,
  sendPasswordResetEmail,
  auth,
  DB_PATHS,
} from "@/lib/firebase";
import { useAuth } from "@/lib/authContext";

const RULES = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  {
    id: "upper",
    label: "At least one uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "At least one lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  { id: "digit", label: "At least one number", test: (p) => /\d/.test(p) },
  {
    id: "special",
    label: "At least one special character",
    test: (p) => /[^A-Za-z0-9]/.test(p),
  },
];

function passwordStrength(p) {
  const passed = RULES.filter((r) => r.test(p)).length;
  if (passed <= 2) return { label: "Weak", color: "bg-danger", width: "25%" };
  if (passed === 3) return { label: "Fair", color: "bg-caution", width: "50%" };
  if (passed === 4) return { label: "Good", color: "bg-safe/70", width: "75%" };
  return { label: "Strong", color: "bg-safe", width: "100%" };
}

function RangerItem({ ranger }) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(ranger.displayName || "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const showFeedback = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  const handleToggleActive = async () => {
    setBusy(true);
    try {
      await set(
        ref(db, `${DB_PATHS.USERS}/${ranger.uid}/isActive`),
        !ranger.isActive,
      );
      showFeedback(
        "success",
        ranger.isActive ? "Account disabled." : "Account enabled.",
      );
    } catch (e) {
      showFeedback("error", e.message);
    }
    setBusy(false);
  };

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await update(ref(db, `${DB_PATHS.USERS}/${ranger.uid}`), {
        displayName: editName.trim(),
      });
      showFeedback("success", "Name updated.");
      setEditing(false);
    } catch (e) {
      showFeedback("error", e.message);
    }
    setBusy(false);
  };

  const handleResetPassword = async () => {
    setBusy(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const response = await fetch("/api/admin/send-reset-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ email: ranger.email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send reset email.");

      showFeedback(
        "success",
        `Password reset email sent to ${ranger.email}. Check their inbox.`,
      );
    } catch (e) {
      showFeedback("error", e.message);
    }
    setBusy(false);
  };


  const handleDelete = async () => {
    setBusy(true);
    try {
      const idToken = await auth.currentUser.getIdToken();

      const response = await fetch(
        `/api/admin/delete-user?uid=${ranger.uid}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const text = await response.text();
      let result = {};
      if (text) {
        try {
          result = JSON.parse(text);
        } catch (err) {
          throw new Error(
            `Server returned invalid response (Status: ${response.status}).`,
          );
        }
      }

      if (!response.ok) {
        throw new Error(
          result.error ||
            `Failed to delete user (Status: ${response.status}).`,
        );
      }

      await remove(ref(db, `${DB_PATHS.USERS}/${ranger.uid}`)).catch(
        () => {},
      );
    } catch (e) {
      showFeedback("error", e.message);
      setBusy(false);
      setConfirmDel(false);
    }
  };

  return (
    <li className="p-3.5 rounded-lg border border-[#ddd4c4] bg-[#f5f5f4] hover:bg-[#ebe4d4]/50 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-[#1e3a8a] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
            {(ranger.displayName || ranger.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            {editing ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setEditing(false);
                  }}
                  autoFocus
                  className="px-2 py-0.5 rounded border border-[#1e3a8a] bg-white text-[#1a1714] text-xs w-40 focus:outline-none"
                />
                <button
                  onClick={handleSaveName}
                  disabled={busy}
                  className="p-0.5 text-[#15803d] hover:text-[#15803d]/80"
                  title="Save"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditName(ranger.displayName || "");
                  }}
                  className="p-0.5 text-[#7c7366] hover:text-[#1a1714]"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-xs font-bold text-[#1a1714] truncate">
                {ranger.displayName || "—"}
              </p>
            )}
            <p className="text-[11px] text-[#7c7366] font-medium truncate">
              {ranger.email}
            </p>
            <p className="text-[10px] text-[#a8a29e]">
              Created:{" "}
              {ranger.createdAt
                ? new Date(ranger.createdAt).toLocaleDateString("en-PH")
                : "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide ${
              ranger.isActive
                ? "bg-[#15803d]/10 text-[#15803d]"
                : "bg-[#9a3412]/10 text-[#9a3412]"
            }`}
          >
            {ranger.isActive ? "Active" : "Disabled"}
          </span>
          {!confirmDel && (
            <>
              <button
                onClick={() => {
                  setEditing(true);
                  setEditName(ranger.displayName || "");
                }}
                disabled={busy}
                title="Edit name"
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetPassword}
                disabled={busy}
                title="Send password reset email"
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleToggleActive}
                disabled={busy}
                title={ranger.isActive ? "Disable account" : "Enable account"}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              >
                {ranger.isActive ? (
                  <ShieldOff className="w-3.5 h-3.5" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setConfirmDel(true)}
                disabled={busy}
                title="Delete account"
                className="p-1.5 rounded-lg hover:bg-danger/10 transition-colors text-muted-foreground hover:text-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDel && (
        <div className="mt-2 flex items-center gap-2 bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-danger shrink-0" />
          <p className="text-xs text-danger flex-1">
            Delete this ranger permanently?
          </p>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="px-2 py-1 text-xs font-bold bg-danger text-white rounded hover:bg-danger/80 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Yes, Delete"}
          </button>
          <button
            onClick={() => setConfirmDel(false)}
            disabled={busy}
            className="px-2 py-1 text-xs font-medium bg-secondary text-foreground rounded hover:bg-secondary/80"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline feedback */}
      {feedback && (
        <div
          className={`mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded ${
            feedback.type === "success"
              ? "text-safe bg-safe/10"
              : "text-danger bg-danger/10"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : (
            <AlertCircle className="w-3 h-3" />
          )}
          {feedback.text}
        </div>
      )}
    </li>
  );
}

export default function AdminPanel() {
  const { currentUser } = useAuth();

  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [showPw, setShowPw] = useState(false);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  const [creating, setCreating] = useState(false);

  const [rangers, setRangers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);

  useEffect(() => {
    const usersRef = ref(db, DB_PATHS.USERS);
    onValue(
      usersRef,
      (snap) => {
        const data = snap.val();
        if (data) {
          const list = Object.entries(data)
            .map(([uid, u]) => ({ uid, ...u }))
            .filter((u) => u.role === "ranger")
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
          setRangers(list);
        } else {
          setRangers([]);
        }
        setLoadingList(false);
        setListError(null);
      },
      (err) => {
        setLoadingList(false);
        setListError(err.message);
      },
    );
    return () => off(usersRef);
  }, []);

  const field = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const validate = () => {
    if (!form.displayName.trim()) return "Full name is required.";
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes("@")) return "Valid email required.";
    if (!email.endsWith("@gmail.com"))
      return "Only Gmail accounts are allowed (e.g. name@gmail.com). This ensures password reset emails can be delivered.";
    if (RULES.some((r) => !r.test(form.password)))
      return "Password does not meet all requirements.";
    if (form.password !== form.confirm) return "Passwords do not match.";
    return null;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    setCreating(true);
    try {
      const uid = await createRangerInFirebase(
        form.email.trim(),
        form.password,
      );

      await set(ref(db, `${DB_PATHS.USERS}/${uid}`), {
        email: form.email.trim().toLowerCase(),
        displayName: form.displayName.trim(),
        role: "ranger",
        isActive: true,
        createdAt: Date.now(),
        createdBy: currentUser.uid,
      });

      setFormSuccess(
        `Ranger "${form.displayName.trim()}" created successfully.`,
      );
      setForm({ displayName: "", email: "", password: "", confirm: "" });
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setFormError("That email address is already registered.");
      } else if (err.code === "auth/invalid-email") {
        setFormError("Invalid email address format.");
      } else {
        setFormError(err.message || "Failed to create account.");
      }
    } finally {
      setCreating(false);
    }
  };

  const strength = form.password ? passwordStrength(form.password) : null;

  return (
    <Layout>
      <div className="space-y-5 max-w-5xl">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-header font-bold text-[#1a1714] tracking-tight">
            Administrative Command & Account Management
          </h2>
          <p className="text-xs text-[#7c7366] mt-1">
            Provision staff ranger accounts, reset security credentials, and manage system access permissions.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* ── Create Account ── */}
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-6">
            <h3 className="text-base font-header font-bold text-[#1a1714] mb-5 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#1e3a8a]" />
              Provision Ranger Account
            </h3>

            <form
              onSubmit={handleCreate}
              className="space-y-4"
              autoComplete="off"
            >
              <div>
                <label className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={field("displayName")}
                  placeholder="Juan dela Cruz"
                  autoComplete="off"
                  className="w-full px-3 py-2 rounded-lg border border-[#ddd4c4] bg-[#f5f5f4] text-[#1a1714] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1">
                  Gmail Address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={field("email")}
                  placeholder="ranger.name@gmail.com"
                  autoComplete="new-email"
                  className={`w-full px-3 py-2 rounded-lg border bg-[#f5f5f4] text-[#1a1714] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] ${
                    form.email &&
                    !form.email.trim().toLowerCase().endsWith("@gmail.com") &&
                    form.email.includes("@")
                      ? "border-[#9a3412]"
                      : "border-[#ddd4c4]"
                  }`}
                />
                <p className="text-[11px] text-[#7c7366] mt-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  Gmail accounts only — required for password reset delivery.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={form.password}
                    onChange={field("password")}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 pr-9 rounded-lg border border-[#ddd4c4] bg-[#f5f5f4] text-[#1a1714] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7c7366]"
                    tabIndex={-1}
                  >
                    {showPw ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {form.password && strength && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-[#ddd4c4] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <p className="text-[11px] text-[#7c7366] mt-1">
                      Strength:{" "}
                      <span className="font-semibold text-[#1a1714]">{strength.label}</span>
                    </p>
                  </div>
                )}

                {form.password && (
                  <ul className="mt-2 space-y-0.5">
                    {RULES.map((r) => {
                      const ok = r.test(form.password);
                      return (
                        <li
                          key={r.id}
                          className={`flex items-center gap-1.5 text-[11px] ${ok ? "text-[#15803d]" : "text-[#7c7366]"}`}
                        >
                          {ok ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <AlertCircle className="w-3 h-3" />
                          )}
                          {r.label}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1a1714] uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={form.confirm}
                  onChange={field("confirm")}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={`w-full px-3 py-2 rounded-lg border bg-[#f5f5f4] text-[#1a1714] text-xs focus:outline-none focus:ring-2 focus:ring-[#1e3a8a] ${
                    form.confirm && form.confirm !== form.password
                      ? "border-[#9a3412]"
                      : "border-[#ddd4c4]"
                  }`}
                />
                {form.confirm && form.confirm !== form.password && (
                  <p className="text-[11px] text-[#9a3412] mt-1">
                    Passwords do not match.
                  </p>
                )}
              </div>

              {formError && (
                <div className="bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-lg p-3 text-xs text-[#9a3412]">
                  {formError}
                </div>
              )}
              {formSuccess && (
                <div className="bg-[#15803d]/10 border border-[#15803d]/30 rounded-lg p-3 text-xs text-[#15803d] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {formSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full bg-[#1e3a8a] text-white font-semibold text-xs py-2.5 rounded-lg hover:bg-[#1e3a8a]/90 transition-colors disabled:opacity-50 mt-1 shadow-sm"
              >
                {creating ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Provisioning Account…
                  </span>
                ) : (
                  "Create Ranger Account"
                )}
              </button>
            </form>
          </div>

          {/* ── Rangers List ── */}
          <div className="bg-[#fffaf2] rounded-xl border border-[#ddd4c4] shadow-sm p-6">
            <h3 className="text-base font-header font-bold text-[#1a1714] mb-5 flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1e3a8a]" />
              Active Staff Rangers ({rangers.length})
            </h3>

            {listError && (
              <div className="bg-[#9a3412]/10 border border-[#9a3412]/30 rounded-lg p-3 text-xs text-[#9a3412] mb-4">
                Failed to load rangers: {listError}
              </div>
            )}

            {loadingList ? (
              <div className="flex items-center gap-2 text-[#7c7366] text-xs py-4">
                <RefreshCw className="w-4 h-4 animate-spin text-[#1e3a8a]" /> Loading staff roster…
              </div>
            ) : rangers.length === 0 && !listError ? (
              <p className="text-[#7c7366] text-xs py-4">
                No ranger accounts configured yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {rangers.map((r) => (
                  <RangerItem key={r.uid} ranger={r} />
                ))}
              </ul>
            )}

            {/* Actions legend */}
            {rangers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[#ddd4c4]">
                <div className="flex flex-wrap gap-3 text-[10px] text-[#7c7366] font-medium">
                  <span className="flex items-center gap-1">
                    <Pencil className="w-3 h-3 text-[#1e3a8a]" /> Edit Name
                  </span>
                  <span className="flex items-center gap-1">
                    <KeyRound className="w-3 h-3 text-[#1e3a8a]" /> Reset Password
                  </span>
                  <span className="flex items-center gap-1">
                    <ShieldOff className="w-3 h-3 text-[#b45309]" /> Toggle Active
                  </span>
                  <span className="flex items-center gap-1">
                    <Trash2 className="w-3 h-3 text-[#9a3412]" /> Delete Account
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}

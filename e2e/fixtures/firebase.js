// Served only by Playwright's request interception. Never imported by the app.
export { mapArduinoReading } from "/client/lib/telemetry.js";
export const db = {};
const state = window.__fixture;
const subscriptions = new Map();
const authListeners = new Set();
const user = { uid: "test-user", email: "ranger@example.test", getIdToken: async () => "test-token" };
export const auth = { currentUser: sessionStorage.getItem("test-signed-in") === "true" || state.signedIn !== false ? user : null };
export const DB_PATHS = { LATEST: "bantaydagat/latest", READINGS: "bantaydagat/readings", ALERTS: "bantaydagat/alerts", USERS: "users", LOGIN_ATTEMPTS: "loginAttempts" };
export const ref = (_, path) => path;
export const query = (path) => path;
export const orderByChild = () => null;
export const startAt = () => null;
export const limitToLast = () => null;
const read = (path) => path.split("/").reduce((value, key) => value?.[key], state.data) ?? null;
const snapshot = (path) => ({ val: () => read(path), exists: () => read(path) !== null });
export function onValue(path, success, error) {
  const entry = { success, error };
  if (!subscriptions.has(path)) subscriptions.set(path, new Set());
  subscriptions.get(path).add(entry);
  queueMicrotask(() => success(snapshot(path)));
  return () => subscriptions.get(path)?.delete(entry);
}
export const off = (path) => subscriptions.delete(path);
export const get = async (path) => snapshot(path);
export async function set(path, value) {
  const parts = path.split("/");
  const last = parts.pop();
  let parent = state.data;
  for (const part of parts) parent = parent[part] ??= {};
  if (value === null) delete parent[last]; else parent[last] = value;
  for (const [observed, entries] of subscriptions) {
    if (path === observed || path.startsWith(observed + "/") || observed.startsWith(path + "/")) {
      for (const entry of entries) entry.success(snapshot(observed));
    }
  }
}
export const update = async (path, values) => set(path, { ...read(path), ...values });
export const remove = async (path) => set(path, null);
export const push = async (path, value) => set(path + "/new-reading", value);
export function onAuthStateChanged(_, callback) {
  authListeners.add(callback);
  queueMicrotask(() => callback(auth.currentUser));
  return () => authListeners.delete(callback);
}
export async function signOut() {
  sessionStorage.setItem("test-signed-in", "false");
  auth.currentUser = null;
  for (const callback of authListeners) callback(null);
}
export async function signInWithEmailAndPassword(_, email, password) {
  if (password !== "TestPassword1!") throw new Error("Invalid credentials");
  auth.currentUser = { ...user, email };
  sessionStorage.setItem("test-signed-in", "true");
  for (const callback of authListeners) callback(auth.currentUser);
  return { user: auth.currentUser };
}
export const createRangerInFirebase = async () => "new-ranger";
export const sendPasswordResetEmail = async () => {};
window.__stationTest = {
  set,
  fail(path, message) { for (const entry of subscriptions.get(path) ?? []) entry.error?.({ message }); },
};

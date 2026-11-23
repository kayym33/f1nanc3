// Notifications on this device. On an iPhone they only work once
// f1nanc3 is on the home screen (iOS 16.4+), and they all come from the
// server (supabase/functions/fin-alerts). Based on t1ld3's phone app.

export function isStandalone() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

const isIphone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

// "on", "off", "blocked", "unsupported" or "install" (an iPhone in Safari,
// not the home-screen app).
export async function pushStatus() {
  if (isIphone() && !isStandalone()) return "install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ? "on" : "off";
}

function keyBytes(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

// Call straight from a tap: browsers only ask for permission after one.
export async function enablePush(cloud) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("notifications are switched off for f1nanc3 in this device's settings");
  const registration = await navigator.serviceWorker.ready;
  const key = await cloud.vapidKey();
  if (!key) throw new Error("notifications aren't set up on the server yet");
  const subscription = (await registration.pushManager.getSubscription())
    ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  await cloud.saveDevice(subscription);
}

export async function disablePush(cloud) {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await cloud.deleteDevice(subscription.endpoint).catch(() => {});
  await subscription.unsubscribe();
}

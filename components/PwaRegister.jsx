"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

// Registers the service worker and shows a small "Install app" banner
// when the browser fires beforeinstallprompt (Android/Chrome/Edge/desktop).
// iOS Safari has no such event — see the README for the Add to Home Screen note.
export default function PwaRegister() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred || dismissed) return null;

  const install = async () => {
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  return (
    <div
      style={{
        position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 60,
        maxWidth: 420, margin: "0 auto", background: "#16232e", color: "#fff",
        borderRadius: 14, padding: "14px 16px", display: "flex",
        alignItems: "center", gap: 12, boxShadow: "0 12px 40px -12px rgba(0,0,0,.5)",
      }}
    >
      <span style={{ width: 36, height: 36, borderRadius: 9, background: "#1f7a66",
        display: "grid", placeItems: "center", flex: "none" }}>
        <Download size={18} />
      </span>
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.35 }}>
        <strong style={{ display: "block" }}>Install InvoiceAU</strong>
        <span style={{ color: "#a9c2bb" }}>Add it to your device for offline access.</span>
      </div>
      <button onClick={install} style={{ background: "#1f7a66", color: "#fff", border: 0,
        borderRadius: 9, padding: "9px 14px", fontWeight: 600, cursor: "pointer" }}>
        Install
      </button>
      <button onClick={() => setDismissed(true)} aria-label="Dismiss"
        style={{ background: "transparent", border: 0, color: "#8aa39b", cursor: "pointer" }}>
        <X size={18} />
      </button>
    </div>
  );
}

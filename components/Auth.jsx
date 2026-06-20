"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Receipt } from "lucide-react";

// Email + password sign in / sign up. New projects have email confirmation
// on by default — if so, signup shows a "check your email" message. You can
// turn confirmation off in Supabase → Authentication → Sign In / Providers
// for quicker testing.
export default function Auth() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // onAuthStateChange in page.js swaps the screen on success.
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) setMsg("Account created. Check your email to confirm, then sign in.");
      }
    } catch (e2) {
      setErr(e2.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const S = {
    wrap: { minHeight: "100vh", display: "grid", placeItems: "center", background: "#f7f8f6",
      fontFamily: "Inter, system-ui, sans-serif", color: "#16232e", padding: 20 },
    card: { width: "100%", maxWidth: 380, background: "#fff", border: "1px solid #e7e9e4",
      borderRadius: 18, padding: 30, boxShadow: "0 18px 50px -28px rgba(20,30,38,.4)" },
    mark: { width: 44, height: 44, borderRadius: 12, background: "#1f7a66", color: "#fff",
      display: "grid", placeItems: "center", marginBottom: 16 },
    h1: { fontSize: 21, marginBottom: 4 },
    sub: { color: "#6b7a82", fontSize: 13.5, marginBottom: 22 },
    label: { display: "block", fontSize: 12, fontWeight: 600, color: "#243744", marginBottom: 6 },
    input: { width: "100%", border: "1px solid #e7e9e4", borderRadius: 9, padding: "10px 12px",
      fontSize: 14, marginBottom: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
    btn: { width: "100%", background: "#16232e", color: "#fff", border: 0, borderRadius: 10,
      padding: "11px", fontWeight: 600, fontSize: 14, cursor: "pointer" },
    toggle: { background: "none", border: 0, color: "#1f7a66", fontWeight: 600, cursor: "pointer", padding: 0 },
    note: { fontSize: 13, marginBottom: 14, padding: "10px 12px", borderRadius: 9 },
  };

  return (
    <main style={S.wrap}>
      <form style={S.card} onSubmit={submit}>
        <div style={S.mark}><Receipt size={22} /></div>
        <h1 style={S.h1}>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
        <p style={S.sub}>InvoiceAU · GST-ready invoicing for Australian businesses</p>

        {err && <div style={{ ...S.note, background: "#fbe9e3", color: "#c2492f" }}>{err}</div>}
        {msg && <div style={{ ...S.note, background: "#e7f1ed", color: "#1f7a66" }}>{msg}</div>}

        <label style={S.label}>Email</label>
        <input style={S.input} type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="you@business.com.au" />

        <label style={S.label}>Password</label>
        <input style={S.input} type="password" required minLength={6} value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />

        <button style={{ ...S.btn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </button>

        <p style={{ textAlign: "center", marginTop: 18, fontSize: 13.5, color: "#6b7a82" }}>
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button type="button" style={S.toggle}
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setErr(null); setMsg(null); }}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </form>
    </main>
  );
}

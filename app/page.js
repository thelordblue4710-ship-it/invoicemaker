"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Auth from "@/components/Auth";
import InvoiceApp from "@/components/InvoiceApp";

// Auth gate: show the login screen when signed out, the app when signed in.
export default function Home() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center",
        fontFamily: "system-ui, sans-serif", color: "#6b7a82" }}>
        Loading…
      </main>
    );
  }

  if (!user) return <Auth />;
  return <InvoiceApp user={user} onSignOut={() => supabase.auth.signOut()} />;
}

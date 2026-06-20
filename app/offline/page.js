export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center",
      fontFamily: "system-ui, sans-serif", background: "#f7f8f6", color: "#16232e", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "#1f7a66",
          margin: "0 auto 18px", display: "grid", placeItems: "center", color: "#fff",
          fontSize: 26, fontWeight: 700 }}>$</div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>You're offline</h1>
        <p style={{ color: "#6b7a82", lineHeight: 1.5 }}>
          Invoices you've already opened are still available. New data will sync
          once you're back online.
        </p>
      </div>
    </main>
  );
}

"use client";

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  LayoutDashboard, FileText, Users, Settings, Plus, Search, Printer,
  Trash2, ChevronLeft, Send, CheckCircle2, Mail, Receipt, CircleDollarSign,
  AlertCircle, Banknote, X, LogOut, Save
} from "lucide-react";

/* ---- formatting + GST helpers (Australian) ---- */
const GST_RATE = 0.1;
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const fmtAUD = (n) => aud.format(Number.isFinite(n) ? n : 0);
const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, days) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const fyStart = () => { const d = new Date(); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-07-01`; };

const lineTotal = (it) => (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
const calcTotals = (items) => {
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const gst = items.reduce((s, it) => s + (it.taxable ? lineTotal(it) * GST_RATE : 0), 0);
  return { subtotal, gst, total: subtotal + gst };
};
const effectiveStatus = (inv) => {
  if (inv.status === "paid") return "paid";
  if (inv.status === "draft") return "draft";
  if (inv.dueDate < todayISO()) return "overdue";
  return "sent";
};
const STATUS_LABEL = { draft: "Draft", sent: "Awaiting payment", paid: "Paid", overdue: "Overdue" };

/* ---- DB row <-> local shape mapping ---- */
const mapBusiness = (r) => r ? {
  id: r.id, name: r.name || "", abn: r.abn || "", email: r.email || "", phone: r.phone || "",
  address: r.address || "", bsb: r.bsb || "", account: r.account || "", payid: r.payid || "",
  terms: r.terms_days ?? 14, accent: r.accent || "#1f7a66",
} : null;
const mapClient = (r) => ({ id: r.id, name: r.name || "", abn: r.abn || "", email: r.email || "", address: r.address || "" });
const mapInvoice = (r) => ({
  id: r.id, number: r.number, clientId: r.client_id || "", issueDate: r.issue_date, dueDate: r.due_date,
  status: r.status, notes: r.notes || "",
  items: (r.invoice_items || []).slice().sort((a, b) => a.position - b.position)
    .map((it) => ({ id: it.id, description: it.description || "", qty: Number(it.qty), unitPrice: Number(it.unit_price), taxable: it.taxable })),
});

/* ============================== APP ============================== */
export default function InvoiceApp({ user, onSignOut }) {
  const [business, setBusiness] = useState(null);
  const [clients, setClients] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [view, setView] = useState("dashboard");
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  async function loadAll() {
    setLoading(true);
    let { data: bizRows } = await supabase.from("businesses").select("*").limit(1);
    let biz = bizRows && bizRows[0];
    if (!biz) {
      const { data: created } = await supabase.from("businesses")
        .insert({ owner_id: user.id, name: "My business" }).select().single();
      biz = created;
    }
    const { data: clientRows } = await supabase.from("clients").select("*").order("created_at", { ascending: true });
    const { data: invRows } = await supabase.from("invoices").select("*, invoice_items(*)").order("number", { ascending: false });
    setBusiness(mapBusiness(biz));
    setClients((clientRows || []).map(mapClient));
    setInvoices((invRows || []).map(mapInvoice));
    setLoading(false);
  }

  const clientById = (id) => clients.find((c) => c.id === id);
  const nextNumber = () => {
    const max = invoices.reduce((m, i) => Math.max(m, parseInt((i.number || "").replace(/\D/g, ""), 10) || 0), 0);
    return `INV-${String(max + 1).padStart(4, "0")}`;
  };

  async function openNew() {
    const number = nextNumber();
    const issueDate = todayISO();
    const dueDate = addDays(issueDate, business?.terms ?? 14);
    const clientId = clients[0]?.id || null;
    const { data, error } = await supabase.from("invoices").insert({
      owner_id: user.id, client_id: clientId, number, issue_date: issueDate,
      due_date: dueDate, status: "draft", notes: "Thanks for your business.",
    }).select().single();
    if (error) { alert("Could not create invoice: " + error.message); return; }
    const inv = {
      id: data.id, number, clientId: clientId || "", issueDate, dueDate, status: "draft",
      notes: "Thanks for your business.",
      items: [{ id: "l" + Date.now(), description: "", qty: 1, unitPrice: 0, taxable: true }],
    };
    setInvoices((v) => [inv, ...v]);
    setEditingId(inv.id);
    setView("editor");
  }

  const updateInvoice = (id, patch) => setInvoices((v) => v.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function persistInvoice(inv) {
    setSaving(true);
    await supabase.from("invoices").update({
      client_id: inv.clientId || null, number: inv.number, issue_date: inv.issueDate,
      due_date: inv.dueDate, status: inv.status, notes: inv.notes,
    }).eq("id", inv.id);
    await supabase.from("invoice_items").delete().eq("invoice_id", inv.id);
    if (inv.items.length) {
      await supabase.from("invoice_items").insert(inv.items.map((it, i) => ({
        invoice_id: inv.id, description: it.description || "", qty: Number(it.qty) || 0,
        unit_price: Number(it.unitPrice) || 0, taxable: !!it.taxable, position: i,
      })));
    }
    setSaving(false);
  }

  async function setStatus(inv, status) {
    updateInvoice(inv.id, { status });
    await supabase.from("invoices").update({ status }).eq("id", inv.id);
  }

  async function deleteInvoice(id) {
    await supabase.from("invoices").delete().eq("id", id);
    setInvoices((v) => v.filter((i) => i.id !== id));
    setView("invoices");
  }

  async function saveClient(c) {
    if (c.id) {
      await supabase.from("clients").update({ name: c.name, abn: c.abn, email: c.email, address: c.address }).eq("id", c.id);
      setClients((list) => list.map((x) => (x.id === c.id ? c : x)));
    } else {
      const { data } = await supabase.from("clients")
        .insert({ owner_id: user.id, name: c.name, abn: c.abn, email: c.email, address: c.address })
        .select().single();
      setClients((list) => [...list, mapClient(data)]);
    }
  }

  async function saveBusiness(b) {
    setSaving(true);
    await supabase.from("businesses").update({
      name: b.name, abn: b.abn, email: b.email, phone: b.phone, address: b.address,
      bsb: b.bsb, account: b.account, payid: b.payid, terms_days: Number(b.terms) || 14, accent: b.accent,
    }).eq("id", b.id);
    setSaving(false);
  }

  const editing = invoices.find((i) => i.id === editingId);

  const stats = useMemo(() => {
    let outstanding = 0, overdue = 0, paidFY = 0;
    const fy = fyStart();
    invoices.forEach((inv) => {
      const t = calcTotals(inv.items).total;
      const st = effectiveStatus(inv);
      if (st === "sent" || st === "overdue") outstanding += t;
      if (st === "overdue") overdue += t;
      if (st === "paid" && inv.issueDate >= fy) paidFY += t;
    });
    return { outstanding, overdue, paidFY };
  }, [invoices]);

  if (loading || !business) {
    return <div className="iau"><style>{CSS}</style>
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6b7a82", width: "100%" }}>Loading your invoices…</div>
    </div>;
  }

  return (
    <div className="iau">
      <style>{CSS}</style>

      <aside className="side">
        <div className="brand">
          <span className="brand-mark" style={{ background: business.accent }}><Receipt size={18} /></span>
          <div className="brand-text"><strong>InvoiceAU</strong><small>GST-ready invoicing</small></div>
        </div>
        <nav className="nav">
          {[["dashboard", "Dashboard", LayoutDashboard], ["invoices", "Invoices", FileText],
            ["clients", "Clients", Users], ["settings", "Business settings", Settings]].map(([id, label, Icon]) => (
            <button key={id} className={"nav-btn" + (view === id || (id === "invoices" && view === "editor") ? " on" : "")} onClick={() => setView(id)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </nav>
        <button className="newbtn" onClick={openNew}><Plus size={16} /> New invoice</button>
        <div className="side-foot">
          <button className="signout" onClick={onSignOut}><LogOut size={14} /> Sign out</button>
          <span className="side-email">{user.email}</span>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && <Dashboard stats={stats} invoices={invoices} clientById={clientById} onOpen={(id) => { setEditingId(id); setView("editor"); }} onNew={openNew} />}
        {view === "invoices" && <InvoiceList invoices={invoices} clientById={clientById} onOpen={(id) => { setEditingId(id); setView("editor"); }} onNew={openNew} query={query} setQuery={setQuery} />}
        {view === "clients" && <Clients clients={clients} onSave={saveClient} invoices={invoices} />}
        {view === "settings" && <SettingsView business={business} setBusiness={setBusiness} onSave={() => saveBusiness(business)} saving={saving} />}
        {view === "editor" && editing && (
          <Editor inv={editing} business={business} clients={clients}
            onChange={(patch) => updateInvoice(editing.id, patch)}
            onStatus={(s) => setStatus(editing, s)}
            onPersist={() => persistInvoice(editing)}
            onBack={async () => { await persistInvoice(editing); setView("invoices"); }}
            onDelete={() => deleteInvoice(editing.id)} saving={saving} />
        )}
      </main>
    </div>
  );
}

/* ----------------------------- pieces ----------------------------- */
function StatusPill({ inv }) {
  const st = effectiveStatus(inv);
  return <span className={"pill " + st}>{STATUS_LABEL[st]}</span>;
}

function Table({ invoices, clientById, onOpen }) {
  if (!invoices.length) return <div className="empty">No invoices yet. Create your first to get paid faster.</div>;
  return (
    <table className="tbl">
      <thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th className="r">Total</th><th>Status</th></tr></thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id} onClick={() => onOpen(inv.id)}>
            <td className="mono">{inv.number}</td>
            <td>{clientById(inv.clientId)?.name || "—"}</td>
            <td className="muted">{fmtDate(inv.issueDate)}</td>
            <td className="muted">{fmtDate(inv.dueDate)}</td>
            <td className="r num">{fmtAUD(calcTotals(inv.items).total)}</td>
            <td><StatusPill inv={inv} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dashboard({ stats, invoices, clientById, onOpen, onNew }) {
  const recent = [...invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 6);
  return (
    <div className="page">
      <header className="page-head">
        <div><p className="eyebrow">Financial year to date · 1 Jul – 30 Jun</p><h1>Good day. Here's where the money sits.</h1></div>
        <button className="primary" onClick={onNew}><Plus size={16} /> New invoice</button>
      </header>
      <div className="stat-row">
        <div className="stat hero"><span className="stat-ico"><CircleDollarSign size={18} /></span><p className="stat-label">Owed to you</p><p className="stat-num">{fmtAUD(stats.outstanding)}</p><p className="stat-sub">Across awaiting + overdue invoices</p></div>
        <div className="stat"><span className="stat-ico warn"><AlertCircle size={18} /></span><p className="stat-label">Overdue</p><p className="stat-num">{fmtAUD(stats.overdue)}</p><p className="stat-sub">Past the due date</p></div>
        <div className="stat"><span className="stat-ico good"><CheckCircle2 size={18} /></span><p className="stat-label">Paid this FY</p><p className="stat-num">{fmtAUD(stats.paidFY)}</p><p className="stat-sub">Incl. GST collected</p></div>
      </div>
      <section className="card"><div className="card-head"><h2>Recent invoices</h2></div><Table invoices={recent} clientById={clientById} onOpen={onOpen} /></section>
    </div>
  );
}

function InvoiceList({ invoices, clientById, onOpen, onNew, query, setQuery }) {
  const q = query.trim().toLowerCase();
  const filtered = invoices.filter((inv) => {
    if (!q) return true;
    const name = clientById(inv.clientId)?.name?.toLowerCase() || "";
    return inv.number.toLowerCase().includes(q) || name.includes(q);
  }).sort((a, b) => (a.number < b.number ? 1 : -1));
  return (
    <div className="page">
      <header className="page-head"><div><p className="eyebrow">All invoices</p><h1>Invoices</h1></div><button className="primary" onClick={onNew}><Plus size={16} /> New invoice</button></header>
      <div className="searchbar"><Search size={16} /><input placeholder="Search by number or client" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <section className="card"><Table invoices={filtered} clientById={clientById} onOpen={onOpen} /></section>
    </div>
  );
}

function Clients({ clients, onSave, invoices }) {
  const [draft, setDraft] = useState(null);
  const blank = { id: "", name: "", abn: "", email: "", address: "" };
  const save = async () => { if (!draft.name.trim()) return; await onSave(draft); setDraft(null); };
  const billed = (id) => invoices.filter((i) => i.clientId === id).reduce((s, i) => s + calcTotals(i.items).total, 0);
  return (
    <div className="page">
      <header className="page-head"><div><p className="eyebrow">Your customers</p><h1>Clients</h1></div><button className="primary" onClick={() => setDraft({ ...blank })}><Plus size={16} /> Add client</button></header>
      <div className="client-grid">
        {clients.map((c) => (
          <div key={c.id} className="client-card" onClick={() => setDraft({ ...c })}>
            <div className="client-top"><span className="avatar">{c.name.slice(0, 1)}</span><div><strong>{c.name}</strong><small>ABN {c.abn || "—"}</small></div></div>
            <p className="client-meta"><Mail size={13} /> {c.email || "No email"}</p>
            <p className="client-billed">{fmtAUD(billed(c.id))} <span>billed</span></p>
          </div>
        ))}
        {!clients.length && <div className="empty">No clients yet. Add one to start invoicing.</div>}
      </div>
      {draft && (
        <div className="modal-bg" onClick={() => setDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>{draft.id ? "Edit client" : "New client"}</h2><button onClick={() => setDraft(null)}><X size={18} /></button></div>
            <Field label="Business name"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="ABN"><input value={draft.abn} onChange={(e) => setDraft({ ...draft, abn: e.target.value })} placeholder="00 000 000 000" /></Field>
            <Field label="Email"><input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></Field>
            <Field label="Address"><textarea rows={2} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
            <button className="primary wide" onClick={save}>Save client</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ACCENTS = ["#1f7a66", "#2563a6", "#7a4ee0", "#c2410c", "#0f766e", "#b91c1c"];
function SettingsView({ business, setBusiness, onSave, saving }) {
  const set = (k, v) => setBusiness((b) => ({ ...b, [k]: v }));
  return (
    <div className="page">
      <header className="page-head"><div><p className="eyebrow">Appears on every invoice</p><h1>Business settings</h1></div>
        <button className="primary" onClick={onSave} disabled={saving}><Save size={15} /> {saving ? "Saving…" : "Save changes"}</button></header>
      <div className="settings-grid">
        <section className="card pad">
          <h2>Your business</h2>
          <Field label="Business name"><input value={business.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <div className="two"><Field label="ABN"><input value={business.abn} onChange={(e) => set("abn", e.target.value)} /></Field>
            <Field label="Payment terms (days)"><input type="number" value={business.terms} onChange={(e) => set("terms", Number(e.target.value))} /></Field></div>
          <Field label="Email"><input value={business.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><input value={business.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Address"><textarea rows={2} value={business.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </section>
        <section className="card pad">
          <h2>Getting paid</h2>
          <div className="two"><Field label="BSB"><input value={business.bsb} onChange={(e) => set("bsb", e.target.value)} /></Field>
            <Field label="Account number"><input value={business.account} onChange={(e) => set("account", e.target.value)} /></Field></div>
          <Field label="PayID"><input value={business.payid} onChange={(e) => set("payid", e.target.value)} /></Field>
          <h2 style={{ marginTop: 22 }}>Invoice accent</h2>
          <div className="swatches">{ACCENTS.map((c) => (<button key={c} className={"swatch" + (business.accent === c ? " on" : "")} style={{ background: c }} onClick={() => set("accent", c)} />))}</div>
        </section>
      </div>
    </div>
  );
}

function Editor({ inv, business, clients, onChange, onStatus, onPersist, onBack, onDelete, saving }) {
  const client = clients.find((c) => c.id === inv.clientId);
  const totals = calcTotals(inv.items);
  const setItem = (id, patch) => onChange({ items: inv.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  const addItem = () => onChange({ items: [...inv.items, { id: "l" + Date.now(), description: "", qty: 1, unitPrice: 0, taxable: true }] });
  const removeItem = (id) => onChange({ items: inv.items.filter((it) => it.id !== id) });

  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState(null); // { type: "ok" | "err", text }

  async function sendInvoice() {
    if (!client) { setSendMsg({ type: "err", text: "Pick a client first." }); return; }
    if (!client.email) { setSendMsg({ type: "err", text: "This client has no email — add one in Clients." }); return; }
    setSending(true); setSendMsg(null);
    try {
      await onPersist(); // save current edits before emailing
      const res = await fetch("/api/send-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice: inv, business, client }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the email.");
      onStatus("sent");
      setSendMsg({ type: "ok", text: `Sent to ${client.email}` });
    } catch (e) {
      setSendMsg({ type: "err", text: e.message });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page editor">
      <header className="editor-head no-print">
        <button className="ghost back" onClick={onBack}><ChevronLeft size={16} /> Back to invoices</button>
        <div className="editor-head-meta">
          <span className="editor-num mono">{inv.number}</span>
          <StatusPill inv={inv} />
        </div>
      </header>
      <div className="editor-grid">
        <div className="form-col no-print">
          <section className="card pad">
            <h2>Details</h2>
            <Field label="Client">
              <select value={inv.clientId} onChange={(e) => onChange({ clientId: e.target.value })}>
                <option value="">— select a client —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="two">
              <Field label="Issue date"><input type="date" value={inv.issueDate} onChange={(e) => onChange({ issueDate: e.target.value, dueDate: addDays(e.target.value, business.terms) })} /></Field>
              <Field label="Due date"><input type="date" value={inv.dueDate} onChange={(e) => onChange({ dueDate: e.target.value })} /></Field>
            </div>
          </section>
          <section className="card pad">
            <div className="line-head"><h2>Line items</h2><span className="gst-note">GST 10%</span></div>
            <div className="lines">
              {inv.items.map((it) => (
                <div className="line" key={it.id}>
                  <input className="ldesc" placeholder="Description of goods or services" value={it.description} onChange={(e) => setItem(it.id, { description: e.target.value })} />
                  <input className="lqty" type="number" min="0" value={it.qty} onChange={(e) => setItem(it.id, { qty: e.target.value })} />
                  <div className="lprice"><span>$</span><input type="number" min="0" step="0.01" value={it.unitPrice} onChange={(e) => setItem(it.id, { unitPrice: e.target.value })} /></div>
                  <button className={"gst-toggle" + (it.taxable ? " on" : "")} onClick={() => setItem(it.id, { taxable: !it.taxable })}>{it.taxable ? "GST" : "Free"}</button>
                  <span className="ltotal num">{fmtAUD(lineTotal(it))}</span>
                  <button className="lrem" onClick={() => removeItem(it.id)} disabled={inv.items.length === 1}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button className="addline" onClick={addItem}><Plus size={14} /> Add line</button>
          </section>
          <section className="card pad"><Field label="Notes (appears on invoice)"><textarea rows={2} value={inv.notes} onChange={(e) => onChange({ notes: e.target.value })} /></Field></section>
        </div>
        <div className="preview-col">
          <div className="preview" id="invoice-print">
            <div className="pv-top" style={{ borderColor: business.accent }}>
              <div>
                <h3 className="pv-biz">{business.name}</h3>
                <p className="pv-small">ABN {business.abn}</p>
                <p className="pv-small pre">{business.address}</p>
                <p className="pv-small">{business.email}{business.phone ? " · " + business.phone : ""}</p>
              </div>
              <div className="pv-title"><h2 style={{ color: business.accent }}>TAX INVOICE</h2><p className="pv-num">{inv.number}</p><span className="pv-status"><StatusPill inv={inv} /></span></div>
            </div>
            <div className="pv-parties">
              <div><p className="pv-eyebrow">Bill to</p><strong>{client?.name || "—"}</strong>{client?.abn && <p className="pv-small">ABN {client.abn}</p>}<p className="pv-small pre">{client?.address}</p></div>
              <div className="pv-dates">
                <div><span>Issue date</span><strong>{fmtDate(inv.issueDate)}</strong></div>
                <div><span>Due date</span><strong>{fmtDate(inv.dueDate)}</strong></div>
                <div><span>Amount due</span><strong className="pv-due" style={{ color: business.accent }}>{fmtAUD(totals.total)}</strong></div>
              </div>
            </div>
            <table className="pv-tbl">
              <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Unit (ex GST)</th><th className="c">GST</th><th className="r">Amount</th></tr></thead>
              <tbody>{inv.items.map((it) => (
                <tr key={it.id}><td>{it.description || <span className="pv-ph">Item description</span>}</td><td className="r num">{it.qty}</td><td className="r num">{fmtAUD(Number(it.unitPrice) || 0)}</td><td className="c">{it.taxable ? "10%" : "—"}</td><td className="r num">{fmtAUD(lineTotal(it))}</td></tr>
              ))}</tbody>
            </table>
            <div className="pv-sum"><div className="pv-sum-rows">
              <div><span>Subtotal (ex GST)</span><span className="num">{fmtAUD(totals.subtotal)}</span></div>
              <div><span>GST (10%)</span><span className="num">{fmtAUD(totals.gst)}</span></div>
              <div className="pv-grand" style={{ color: business.accent }}><span>Total (inc GST)</span><span className="num">{fmtAUD(totals.total)}</span></div>
            </div></div>
            <div className="pv-pay" style={{ background: business.accent + "0f" }}>
              <p className="pv-eyebrow"><Banknote size={13} /> Payment details</p>
              <div className="pv-pay-grid">
                <div><span>BSB</span><strong>{business.bsb}</strong></div>
                <div><span>Account</span><strong>{business.account}</strong></div>
                <div><span>PayID</span><strong>{business.payid}</strong></div>
                <div><span>Reference</span><strong>{inv.number}</strong></div>
              </div>
            </div>
            {inv.notes && <p className="pv-notes">{inv.notes}</p>}
            <p className="pv-foot">GST has been included where shown. Please pay by {fmtDate(inv.dueDate)} quoting reference {inv.number}.</p>
          </div>
        </div>
      </div>

      {/* ---- pinned bottom action bar ---- */}
      <div className="action-bar no-print">
        <div className="action-bar-inner">
          <div className="ab-left">
            {inv.status !== "paid" && <button className="ab-ghost" onClick={() => onStatus("sent")}><Send size={15} /> Mark sent</button>}
            {inv.status !== "paid"
              ? <button className="ab-ghost good" onClick={() => onStatus("paid")}><CheckCircle2 size={15} /> Mark paid</button>
              : <button className="ab-ghost" onClick={() => onStatus("sent")}>Reopen</button>}
            <button className="ab-ghost danger" onClick={onDelete}><Trash2 size={15} /> Delete</button>
          </div>
          <div className="ab-right">
            {sendMsg && <span className={"ab-msg " + sendMsg.type}>{sendMsg.text}</span>}
            <button className="ab-secondary" onClick={() => window.print()}><Printer size={15} /> Print / PDF</button>
            <button className="ab-send" onClick={sendInvoice} disabled={sending}><Mail size={15} /> {sending ? "Sending…" : "Send invoice"}</button>
            <button className="ab-primary" onClick={onPersist} disabled={saving}><Save size={15} /> {saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) { return <label className="field"><span>{label}</span>{children}</label>; }

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap');

.iau *{box-sizing:border-box;margin:0;padding:0;}
.iau{
  --ink:#16232e; --ink2:#243744; --paper:#f7f8f6; --surface:#ffffff;
  --line:#e7e9e4; --muted:#6b7a82; --eucalypt:#1f7a66; --euc-soft:#e7f1ed;
  --wattle:#e0a32e; --clay:#c2492f; --good:#1f7a66;
  display:grid; grid-template-columns:248px 1fr; min-height:100vh;
  background:var(--paper); color:var(--ink);
  font-family:'Inter',system-ui,sans-serif; font-size:14px; line-height:1.5;
  font-feature-settings:"tnum" 1, "cv05" 1;
}
.iau h1,.iau h2,.iau h3,.iau .stat-num,.iau .brand-text strong{font-family:'Space Grotesk',sans-serif;letter-spacing:-.01em;}
.num,.mono{font-variant-numeric:tabular-nums;}

/* sidebar */
.side{background:var(--ink);color:#dfe7e4;padding:22px 16px;display:flex;flex-direction:column;gap:8px;position:sticky;top:0;height:100vh;}
.brand{display:flex;gap:11px;align-items:center;padding:4px 6px 18px;}
.brand-mark{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;color:#fff;flex:none;}
.brand-text strong{display:block;font-size:16px;color:#fff;}
.brand-text small{color:#8aa39b;font-size:11.5px;}
.nav{display:flex;flex-direction:column;gap:3px;margin-top:6px;}
.nav-btn{display:flex;align-items:center;gap:11px;width:100%;padding:9px 11px;border:0;border-radius:9px;background:transparent;color:#b9c7c2;font-size:13.5px;cursor:pointer;text-align:left;font-family:inherit;transition:.15s;}
.nav-btn:hover{background:rgba(255,255,255,.06);color:#fff;}
.nav-btn.on{background:rgba(255,255,255,.1);color:#fff;}
.newbtn{margin-top:14px;display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border:1px dashed rgba(255,255,255,.25);border-radius:10px;background:transparent;color:#dfe7e4;cursor:pointer;font-family:inherit;font-size:13px;transition:.15s;}
.newbtn:hover{border-color:var(--wattle);color:var(--wattle);}
.side-foot{margin-top:auto;font-size:11.5px;color:#7e948d;display:flex;align-items:center;gap:7px;}
.dot{width:7px;height:7px;border-radius:50%;background:var(--wattle);display:inline-block;}

/* main / page */
.main{padding:34px 40px 60px;overflow:auto;}
.page{max-width:1080px;margin:0 auto;}
.page-head{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:26px;gap:20px;}
.eyebrow{font-size:11.5px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);font-weight:600;margin-bottom:5px;}
.page-head h1{font-size:25px;}

.primary{display:inline-flex;align-items:center;gap:7px;background:var(--ink);color:#fff;border:0;padding:10px 16px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;}
.primary:hover{background:var(--ink2);}
.primary.wide{width:100%;justify-content:center;margin-top:8px;}

/* stats */
.stat-row{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:16px;margin-bottom:26px;}
.stat{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px 22px;position:relative;}
.stat.hero{background:linear-gradient(150deg,var(--ink),var(--ink2));color:#fff;border:0;}
.stat-ico{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--euc-soft);color:var(--eucalypt);margin-bottom:14px;}
.stat.hero .stat-ico{background:rgba(255,255,255,.14);color:#fff;}
.stat-ico.warn{background:#fbe9e3;color:var(--clay);}
.stat-ico.good{background:var(--euc-soft);color:var(--good);}
.stat-label{font-size:12.5px;color:var(--muted);font-weight:600;}
.stat.hero .stat-label{color:#a9c2bb;}
.stat-num{font-size:30px;font-weight:700;margin:3px 0 4px;}
.stat-sub{font-size:12px;color:var(--muted);}
.stat.hero .stat-sub{color:#8fb0a8;}

/* card + table */
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
.card.pad{padding:22px 24px;margin-bottom:18px;}
.card-head{padding:18px 22px 4px;}
.card h2{font-size:15px;margin-bottom:14px;}
.card-head h2{margin:0;}
.tbl{width:100%;border-collapse:collapse;}
.tbl th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:600;padding:12px 22px;border-bottom:1px solid var(--line);}
.tbl td{padding:14px 22px;border-bottom:1px solid var(--line);font-size:13.5px;}
.tbl tbody tr{cursor:pointer;transition:.12s;}
.tbl tbody tr:hover{background:var(--euc-soft);}
.tbl tbody tr:last-child td{border-bottom:0;}
.tbl .r{text-align:right;}.tbl .c{text-align:center;}
.muted{color:var(--muted);}
.empty{padding:40px;text-align:center;color:var(--muted);}

.pill{display:inline-block;padding:4px 10px;border-radius:99px;font-size:11.5px;font-weight:600;}
.pill.draft{background:#eef0ee;color:#5b6b6f;}
.pill.sent{background:#e8eefb;color:#2b5cab;}
.pill.paid{background:var(--euc-soft);color:var(--eucalypt);}
.pill.overdue{background:#fbe9e3;color:var(--clay);}

/* searchbar */
.searchbar{display:flex;align-items:center;gap:9px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:10px 14px;margin-bottom:16px;color:var(--muted);max-width:380px;}
.searchbar input{border:0;outline:0;font-family:inherit;font-size:14px;width:100%;background:transparent;color:var(--ink);}

/* fields */
.field{display:block;margin-bottom:14px;}
.field>span{display:block;font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:6px;}
.field input,.field textarea,.field select{width:100%;border:1px solid var(--line);border-radius:9px;padding:9px 11px;font-family:inherit;font-size:13.5px;color:var(--ink);background:var(--surface);outline:none;transition:.15s;}
.field input:focus,.field textarea:focus,.field select:focus{border-color:var(--eucalypt);box-shadow:0 0 0 3px var(--euc-soft);}
.field textarea{resize:vertical;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}

/* clients */
.client-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;}
.client-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;cursor:pointer;transition:.15s;}
.client-card:hover{border-color:var(--eucalypt);transform:translateY(-2px);}
.client-top{display:flex;gap:12px;align-items:center;margin-bottom:12px;}
.avatar{width:38px;height:38px;border-radius:10px;background:var(--euc-soft);color:var(--eucalypt);display:grid;place-items:center;font-weight:700;font-family:'Space Grotesk';}
.client-top small{color:var(--muted);font-size:11.5px;}
.client-meta{font-size:12.5px;color:var(--muted);display:flex;align-items:center;gap:6px;margin-bottom:10px;}
.client-billed{font-size:18px;font-weight:700;font-family:'Space Grotesk';}
.client-billed span{font-size:11.5px;font-weight:500;color:var(--muted);}

/* modal */
.modal-bg{position:fixed;inset:0;background:rgba(20,30,38,.5);display:grid;place-items:center;z-index:50;padding:20px;}
.modal{background:var(--surface);border-radius:16px;padding:24px;width:100%;max-width:440px;}
.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
.modal-head h2{font-size:18px;}
.modal-head button{border:0;background:#eef0ee;border-radius:8px;width:30px;height:30px;display:grid;place-items:center;cursor:pointer;color:var(--ink2);}

/* settings */
.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;}
.swatches{display:flex;gap:10px;}
.swatch{width:34px;height:34px;border-radius:9px;border:3px solid transparent;cursor:pointer;outline:1px solid var(--line);}
.swatch.on{border-color:#fff;outline:2px solid var(--ink);}

/* editor */
.editor{padding-bottom:96px;} /* room for the pinned action bar */
.editor-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:14px;}
.editor-head-meta{display:flex;align-items:center;gap:12px;}
.editor-num{font-size:14px;font-weight:600;color:var(--ink2);}
.ghost{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:8px 13px;font-size:13px;font-family:inherit;cursor:pointer;color:var(--ink2);transition:.15s;}
.ghost:hover{border-color:var(--ink2);}
.ghost.danger{color:var(--clay);}
.editor-grid{display:grid;grid-template-columns:minmax(380px,1fr) 1.05fr;gap:22px;align-items:start;}

.line-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
.line-head h2{margin:0;}
.gst-note{font-size:11px;background:var(--euc-soft);color:var(--eucalypt);padding:3px 9px;border-radius:99px;font-weight:600;}
.lines{display:flex;flex-direction:column;gap:8px;}
.line{display:grid;grid-template-columns:1fr 52px 96px 52px 84px 28px;gap:7px;align-items:center;}
.line input{border:1px solid var(--line);border-radius:8px;padding:8px;font-family:inherit;font-size:13px;outline:none;width:100%;}
.line input:focus{border-color:var(--eucalypt);}
.lqty{text-align:center;}
.lprice{position:relative;display:flex;align-items:center;}
.lprice span{position:absolute;left:8px;color:var(--muted);font-size:13px;}
.lprice input{padding-left:18px;text-align:right;}
.gst-toggle{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 0;font-size:11px;font-weight:600;cursor:pointer;color:var(--muted);font-family:inherit;}
.gst-toggle.on{background:var(--euc-soft);color:var(--eucalypt);border-color:var(--euc-soft);}
.ltotal{text-align:right;font-size:13px;font-weight:600;}
.lrem{border:0;background:transparent;color:var(--muted);cursor:pointer;display:grid;place-items:center;}
.lrem:hover{color:var(--clay);}
.lrem:disabled{opacity:.25;cursor:not-allowed;}
.addline{margin-top:12px;display:inline-flex;align-items:center;gap:6px;background:transparent;border:1px dashed var(--line);border-radius:9px;padding:9px 13px;font-size:13px;color:var(--ink2);cursor:pointer;font-family:inherit;}
.addline:hover{border-color:var(--eucalypt);color:var(--eucalypt);}

/* ---- pinned bottom action bar ---- */
.action-bar{
  position:fixed;left:248px;right:0;bottom:0;z-index:40;
  background:rgba(255,255,255,.9);backdrop-filter:blur(10px);
  border-top:1px solid var(--line);padding:12px 40px;
  box-shadow:0 -8px 24px -18px rgba(20,30,38,.4);
}
.action-bar-inner{max-width:1080px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:14px;}
.ab-left,.ab-right{display:flex;align-items:center;gap:8px;}
.ab-ghost{display:inline-flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:9px 14px;font-size:13px;font-family:inherit;cursor:pointer;color:var(--ink2);transition:.15s;}
.ab-ghost:hover{border-color:var(--ink2);}
.ab-ghost.good{color:var(--eucalypt);background:var(--euc-soft);border-color:var(--euc-soft);}
.ab-ghost.good:hover{border-color:var(--eucalypt);}
.ab-ghost.danger{color:var(--clay);}
.ab-ghost.danger:hover{border-color:var(--clay);}
.ab-secondary{display:inline-flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 17px;font-size:13.5px;font-weight:600;font-family:inherit;cursor:pointer;color:var(--ink);transition:.15s;}
.ab-secondary:hover{border-color:var(--ink2);}
.ab-send{display:inline-flex;align-items:center;gap:7px;background:var(--eucalypt);color:#fff;border:0;padding:11px 18px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;}
.ab-send:hover{filter:brightness(1.07);}
.ab-send:disabled{opacity:.55;cursor:default;}
.ab-msg{font-size:12.5px;font-weight:600;align-self:center;}
.ab-msg.ok{color:var(--eucalypt);}
.ab-msg.err{color:var(--clay);}
.ab-primary{display:inline-flex;align-items:center;gap:7px;background:var(--ink);color:#fff;border:0;padding:11px 22px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;}
.ab-primary:hover{background:var(--ink2);}
.ab-primary:disabled{opacity:.55;cursor:default;}

/* preview */
.preview-col{position:sticky;top:20px;}
.preview{background:#fff;border:1px solid var(--line);border-radius:14px;padding:34px;box-shadow:0 10px 40px -18px rgba(20,30,38,.25);}
.pv-top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid;padding-bottom:20px;gap:20px;}
.pv-biz{font-size:20px;}
.pv-small{font-size:11.5px;color:var(--muted);line-height:1.55;}
.pv-small.pre{white-space:pre-line;}
.pv-title{text-align:right;}
.pv-title h2{font-size:21px;letter-spacing:.04em;}
.pv-num{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;margin:2px 0 8px;}
.pv-parties{display:flex;justify-content:space-between;gap:24px;padding:22px 0;}
.pv-eyebrow{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:5px;}
.pv-dates{display:flex;flex-direction:column;gap:8px;text-align:right;min-width:160px;}
.pv-dates>div{display:flex;justify-content:space-between;gap:18px;font-size:12.5px;}
.pv-dates span{color:var(--muted);}
.pv-due{font-size:15px;}
.pv-tbl{width:100%;border-collapse:collapse;margin-top:6px;}
.pv-tbl th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);}
.pv-tbl td{padding:11px 8px;border-bottom:1px solid var(--line);font-size:12.5px;vertical-align:top;}
.pv-tbl .r{text-align:right;}.pv-tbl .c{text-align:center;}
.pv-ph{color:#c2c8c4;}
.pv-sum{display:flex;justify-content:flex-end;margin-top:16px;}
.pv-sum-rows{width:260px;display:flex;flex-direction:column;gap:7px;}
.pv-sum-rows>div{display:flex;justify-content:space-between;font-size:13px;}
.pv-sum-rows span:first-child{color:var(--muted);}
.pv-grand{border-top:1px solid var(--line);padding-top:9px;margin-top:3px;font-size:17px;font-weight:700;font-family:'Space Grotesk';}
.pv-grand span:first-child{color:inherit !important;}
.pv-pay{margin-top:24px;border-radius:11px;padding:16px 18px;}
.pv-pay-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;margin-top:8px;}
.pv-pay-grid>div{display:flex;justify-content:space-between;font-size:12.5px;border-bottom:1px dotted var(--line);padding-bottom:5px;}
.pv-pay-grid span{color:var(--muted);}
.pv-notes{margin-top:18px;font-size:12.5px;color:var(--ink2);font-style:italic;}
.pv-foot{margin-top:14px;font-size:11px;color:var(--muted);border-top:1px solid var(--line);padding-top:12px;}

@media (max-width:1100px){
  .iau{grid-template-columns:1fr;}
  .side{position:relative;height:auto;flex-direction:row;align-items:center;flex-wrap:wrap;}
  .nav{flex-direction:row;flex-wrap:wrap;margin:0;}.newbtn{margin:0;}.side-foot{display:none;}
  .editor-grid,.settings-grid,.stat-row{grid-template-columns:1fr;}
  .preview-col{position:static;}

  /* action bar goes full-width and stacks on mobile */
  .action-bar{left:0;padding:10px 16px;}
  .action-bar-inner{flex-direction:column;align-items:stretch;gap:8px;}
  .ab-left,.ab-right{width:100%;}
  .ab-left{justify-content:space-between;}
  .ab-left .ab-ghost{flex:1;justify-content:center;padding:9px 8px;}
  .ab-right .ab-secondary,.ab-right .ab-primary{flex:1;justify-content:center;}
  .ab-send{flex:1;justify-content:center;}
  .ab-msg{flex-basis:100%;text-align:center;order:-1;}
  .editor{padding-bottom:150px;} /* taller bar when stacked */
}

@media print{
  .no-print,.side,.action-bar{display:none !important;}
  .iau{display:block;background:#fff;}
  .main{padding:0;}
  .editor{padding-bottom:0;}
  .editor-grid{display:block;}
  .preview{border:0;box-shadow:none;border-radius:0;padding:0;}
}

.side-foot{margin-top:auto;display:flex;flex-direction:column;gap:6px;}
.signout{display:inline-flex;align-items:center;gap:7px;background:transparent;border:1px solid rgba(255,255,255,.18);color:#dfe7e4;border-radius:9px;padding:8px 11px;font-size:12.5px;cursor:pointer;font-family:inherit;}
.signout:hover{border-color:var(--clay);color:#f3b8a8;}
.side-email{font-size:11px;color:#7e948d;overflow:hidden;text-overflow:ellipsis;}
`;

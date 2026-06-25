import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Resend } from "resend";

export const runtime = "nodejs";

const GST_RATE = 0.1;
const fmtAUD = (n) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number.isFinite(n) ? n : 0);
const fmtDate = (iso) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const lineTotal = (it) => (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
const calcTotals = (items = []) => {
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const gst = items.reduce((s, it) => s + (it.taxable ? lineTotal(it) * GST_RATE : 0), 0);
  return { subtotal, gst, total: subtotal + gst };
};

function hexToRgb(hex = "#1f7a66") {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

async function buildPdf({ invoice, business, client }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 48;
  let y = height - margin;

  const ink = rgb(0.086, 0.137, 0.18);
  const muted = rgb(0.42, 0.48, 0.51);
  const accent = hexToRgb(business.accent);

  const T = (s, x, yy, { size = 10, f = font, color = ink } = {}) =>
    page.drawText(String(s ?? ""), { x, y: yy, size, font: f, color });
  const right = (s, xEnd, yy, opts = {}) => {
    const f = opts.f || font, size = opts.size || 10;
    T(s, xEnd - f.widthOfTextAtSize(String(s ?? ""), size), yy, opts);
  };

  // header
  T(business.name || "My business", margin, y, { size: 18, f: bold });
  right("TAX INVOICE", width - margin, y, { size: 16, f: bold, color: accent });
  y -= 18;
  T(`ABN ${business.abn || ""}`, margin, y, { size: 9, color: muted });
  right(invoice.number || "", width - margin, y, { size: 10, f: bold });
  y -= 14;
  (business.address || "").split("\n").forEach((ln) => { T(ln, margin, y, { size: 9, color: muted }); y -= 12; });
  T(`${business.email || ""}${business.phone ? " · " + business.phone : ""}`, margin, y, { size: 9, color: muted });
  y -= 20;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: accent });
  y -= 22;

  // bill to + dates
  const topY = y;
  T("BILL TO", margin, y, { size: 8, f: bold, color: muted }); y -= 14;
  T(client.name || "—", margin, y, { size: 11, f: bold }); y -= 13;
  if (client.abn) { T(`ABN ${client.abn}`, margin, y, { size: 9, color: muted }); y -= 12; }
  (client.address || "").split("\n").forEach((ln) => { T(ln, margin, y, { size: 9, color: muted }); y -= 12; });

  const totals = calcTotals(invoice.items);
  let ry = topY;
  const rLabelX = width - margin - 200;
  const rrow = (label, val, opts = {}) => {
    T(label, rLabelX, ry, { size: 9, color: muted });
    right(val, width - margin, ry, opts);
    ry -= 16;
  };
  rrow("Issue date", fmtDate(invoice.issueDate));
  rrow("Due date", fmtDate(invoice.dueDate));
  rrow("Amount due", fmtAUD(totals.total), { f: bold, size: 12, color: accent });

  y = Math.min(y, ry) - 16;

  // items
  T("DESCRIPTION", margin, y, { size: 8, f: bold, color: muted });
  T("QTY", 330, y, { size: 8, f: bold, color: muted });
  T("UNIT", 380, y, { size: 8, f: bold, color: muted });
  T("GST", 460, y, { size: 8, f: bold, color: muted });
  right("AMOUNT", width - margin, y, { size: 8, f: bold, color: muted });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.75, color: rgb(0.9, 0.91, 0.89) });
  y -= 15;

  (invoice.items || []).forEach((it) => {
    T(it.description || "Item", margin, y, { size: 9.5 });
    T(String(it.qty ?? 0), 330, y, { size: 9.5 });
    T(fmtAUD(Number(it.unitPrice) || 0), 380, y, { size: 9.5 });
    T(it.taxable ? "10%" : "—", 460, y, { size: 9.5 });
    right(fmtAUD(lineTotal(it)), width - margin, y, { size: 9.5 });
    y -= 8;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.93, 0.94, 0.92) });
    y -= 14;
  });

  // totals
  y -= 6;
  const tLabelX = width - margin - 200;
  const trow = (label, val, opts = {}) => {
    T(label, tLabelX, y, { size: opts.size || 10, color: opts.lc || muted, f: opts.f || font });
    right(val, width - margin, y, { size: opts.size || 10, f: opts.f || font, color: opts.color || ink });
    y -= 16;
  };
  trow("Subtotal (ex GST)", fmtAUD(totals.subtotal));
  trow("GST (10%)", fmtAUD(totals.gst));
  page.drawLine({ start: { x: tLabelX, y: y + 8 }, end: { x: width - margin, y: y + 8 }, thickness: 0.75, color: rgb(0.9, 0.91, 0.89) });
  trow("Total (inc GST)", fmtAUD(totals.total), { size: 12, f: bold, color: accent, lc: ink });

  // payment box
  y -= 12;
  const boxH = 72;
  page.drawRectangle({ x: margin, y: y - boxH, width: width - margin * 2, height: boxH, color: accent, opacity: 0.06 });
  let by = y - 16;
  T("PAYMENT DETAILS", margin + 14, by, { size: 8, f: bold, color: muted }); by -= 16;
  T(`BSB ${business.bsb || "—"}`, margin + 14, by, { size: 9.5 });
  T(`Account ${business.account || "—"}`, margin + 180, by, { size: 9.5 }); by -= 14;
  T(`PayID ${business.payid || "—"}`, margin + 14, by, { size: 9.5 });
  T(`Reference ${invoice.number || ""}`, margin + 180, by, { size: 9.5 });

  y = y - boxH - 22;
  if (invoice.notes) { T(invoice.notes, margin, y, { size: 9, color: ink }); y -= 16; }
  T(`Please pay by ${fmtDate(invoice.dueDate)} quoting reference ${invoice.number || ""}.`, margin, y, { size: 8, color: muted });

  return doc.save();
}

export async function POST(req) {
  try {
    const { invoice, business, client } = await req.json();

    if (!process.env.RESEND_API_KEY)
      return NextResponse.json({ error: "RESEND_API_KEY is not set on the server." }, { status: 500 });
    if (!client?.email)
      return NextResponse.json({ error: "This client has no email address." }, { status: 400 });

    const pdfBytes = await buildPdf({ invoice, business, client });
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const totals = calcTotals(invoice.items);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.INVOICE_FROM_EMAIL || "Invoices <onboarding@resend.dev>";

    const { error } = await resend.emails.send({
      from,
      to: [client.email],
      subject: `Tax Invoice ${invoice.number} from ${business.name || "us"}`,
      html: `
        <div style="font-family:Arial,sans-serif;color:#16232e;line-height:1.6">
          <p>Hi ${client.name || "there"},</p>
          <p>Please find attached tax invoice <strong>${invoice.number}</strong> for
             <strong>${fmtAUD(totals.total)}</strong> (inc GST).</p>
          <p>Due by <strong>${fmtDate(invoice.dueDate)}</strong>. Payment details are on the invoice.</p>
          ${invoice.notes ? `<p>${invoice.notes}</p>` : ""}
          <p>Thanks,<br/>${business.name || ""}</p>
        </div>`,
      attachments: [{ filename: `${invoice.number || "invoice"}.pdf`, content: pdfBase64 }],
    });

    if (error) return NextResponse.json({ error: error.message || "Resend rejected the email." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Unexpected error." }, { status: 500 });
  }
}
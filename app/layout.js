import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata = {
  applicationName: "InvoiceAU",
  title: { default: "InvoiceAU — GST invoicing", template: "%s · InvoiceAU" },
  description: "Create GST-compliant Australian tax invoices and track who owes you.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "InvoiceAU",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  formatDetection: { telephone: false },
};

// Next.js 14 wants viewport + themeColor exported separately.
export const viewport = {
  themeColor: "#1f7a66",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-AU">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

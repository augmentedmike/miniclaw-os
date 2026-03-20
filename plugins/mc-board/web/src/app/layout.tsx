import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "highlight.js/styles/atom-one-dark.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MiniClaw Cognitive Framework",
    template: "MiniClaw Cognitive Framework — %s",
  },
  description: "Your own AI. Your Mac. Your data.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  other: {
    "model-context": "supported",
    "webmcp-version": "1.0",
    "webmcp-site": "miniclaw.bot",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="webmcp-manifest" href="/.well-known/webmcp.json" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Script src="/webmcp-tools.js" strategy="afterInteractive" />
        <Script src="/webmcp-init-miniclaw.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}

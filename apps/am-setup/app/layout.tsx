import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AM Setup",
  description: "Set up your personal AI assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0f0f0f] text-[#f0f0f0]">
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "Memory" };

export default function MemoryPage() {
  return <AppShell initialTab="memory" />;
}

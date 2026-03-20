import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "Scheduling" };

export default function SchedulingPage() {
  return <AppShell initialTab="board" />;
}

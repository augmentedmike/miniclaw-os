import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "Agent Office" };

export default function OfficePage() {
  return <AppShell initialTab="office" />;
}

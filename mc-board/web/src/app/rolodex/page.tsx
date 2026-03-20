import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "Rolodex" };

export default function RolodexPage() {
  return <AppShell initialTab="rolodex" />;
}

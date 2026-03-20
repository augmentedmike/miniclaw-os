import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings-page";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default function Settings() {
  return <SettingsPage />;
}

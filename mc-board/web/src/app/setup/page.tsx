import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/setup-state";

export const metadata: Metadata = {
  title: "Installation and Setup",
};

export const dynamic = "force-dynamic";

export default function SetupIndex() {
  if (isSetupComplete()) {
    redirect("/settings");
  }
  redirect("/setup/meet");
}

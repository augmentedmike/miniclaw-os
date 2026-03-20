import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/setup-state";

export const dynamic = "force-dynamic";

export default function Home() {
  if (!isSetupComplete()) {
    redirect("/setup/meet");
  }
  redirect("/board");
}

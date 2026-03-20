import { redirect } from "next/navigation";
import { isSetupComplete } from "@/lib/setup-state";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Force Next.js to treat this as dynamic (read headers to bust cache)
  await headers();

  if (isSetupComplete()) {
    redirect("http://localhost:4220");
  } else {
    redirect("/setup/meet");
  }
}

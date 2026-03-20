import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = { title: "Brain Board" };

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (sp.project) {
    redirect(`/board/project/${encodeURIComponent(sp.project)}`);
  }
  return <AppShell initialTab="board" />;
}

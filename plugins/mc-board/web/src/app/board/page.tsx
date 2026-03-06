import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";

export default async function BoardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (sp.project) {
    redirect(`/board/project/${encodeURIComponent(sp.project)}`);
  }
  return <AppShell initialTab="board" />;
}

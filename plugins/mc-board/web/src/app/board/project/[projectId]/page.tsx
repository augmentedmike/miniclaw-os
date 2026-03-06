import { AppShell } from "@/components/AppShell";

export default async function BoardProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <AppShell initialTab="board" initialProjectId={projectId} />;
}

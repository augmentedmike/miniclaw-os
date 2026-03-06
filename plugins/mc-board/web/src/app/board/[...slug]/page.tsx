import { AppShell } from "@/components/AppShell";

// Handles:
//   /board/c/crd_xxx            → open card
//   /board/p/prj_xxx            → filter project
//   /board/p/prj_xxx/c/crd_xxx  → filter project + open card
export default async function BoardSlugPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const cIdx = slug.indexOf("c");
  const pIdx = slug.indexOf("p");
  const cardId    = cIdx >= 0 ? slug[cIdx + 1] : undefined;
  const projectId = pIdx >= 0 ? slug[pIdx + 1] : undefined;
  return <AppShell initialTab="board" initialCardId={cardId} initialProjectId={projectId} />;
}

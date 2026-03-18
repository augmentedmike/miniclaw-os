export interface PostSchedule {
  id: number;
  trigger_at: string;
  type: string;
}

export interface SubstackDraft {
  id: number;
  draft_title: string;
  draft_subtitle: string;
  draft_body: string; // Tiptap JSON string
  is_published: boolean;
  post_date: string | null;
  postSchedules?: PostSchedule[];
  slug: string;
  type: string;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface TiptapDoc {
  type: "doc";
  content: TiptapNode[];
}

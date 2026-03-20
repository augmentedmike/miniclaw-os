import * as fs from "node:fs";
import * as path from "node:path";
import type { SubstackConfig } from "./config.js";
import type { SubstackDraft, TiptapDoc, TiptapNode } from "./types.js";

/**
 * Convert markdown text to Substack's TipTap/ProseMirror JSON format.
 * Handles: headings, bold, italic, links, bullet lists, code blocks, horizontal rules, paragraphs.
 */
export function markdownToTiptap(md: string): string {
  const lines = md.split("\n");
  const nodes: TiptapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") { i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      nodes.push({ type: "horizontalRule" });
      i++; continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push({
        type: "heading",
        attrs: { level, textAlign: null },
        content: parseInline(headingMatch[2]),
      });
      i++; continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim() || null;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      nodes.push({
        type: "codeBlock",
        attrs: { language: lang },
        content: [{ type: "text", text: codeLines.join("\n") }],
      });
      continue;
    }

    // Bullet list
    if (/^[-*]\s+/.test(line)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^[-*]\s+/, "");
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", attrs: { textAlign: null }, content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: "bulletList", content: items });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s+/.test(line)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\d+\.\s+/, "");
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", attrs: { textAlign: null }, content: parseInline(itemText) }],
        });
        i++;
      }
      nodes.push({ type: "orderedList", attrs: { start: 1 }, content: items });
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      nodes.push({
        type: "blockquote",
        content: [{ type: "paragraph", attrs: { textAlign: null }, content: parseInline(quoteLines.join(" ")) }],
      });
      continue;
    }

    // Regular paragraph
    nodes.push({
      type: "paragraph",
      attrs: { textAlign: null },
      content: parseInline(line),
    });
    i++;
  }

  return JSON.stringify({ type: "doc", content: nodes });
}

/** Parse inline markdown (bold, italic, links, code) into TipTap text nodes. */
function parseInline(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = [];
  // Combined regex: bold, italic, inline code, links
  const re = /\*\*(.+?)\*\*|_(.+?)_|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    // Text before match
    if (m.index > last) {
      nodes.push({ type: "text", text: text.slice(last, m.index) });
    }

    if (m[1] !== undefined) {
      // **bold**
      nodes.push({ type: "text", marks: [{ type: "bold" }], text: m[1] });
    } else if (m[2] !== undefined || m[3] !== undefined) {
      // _italic_ or *italic*
      nodes.push({ type: "text", marks: [{ type: "italic" }], text: m[2] ?? m[3] });
    } else if (m[4] !== undefined) {
      // `code`
      nodes.push({ type: "text", marks: [{ type: "code" }], text: m[4] });
    } else if (m[5] !== undefined && m[6] !== undefined) {
      // [text](url)
      nodes.push({
        type: "text",
        marks: [{ type: "link", attrs: { href: m[6], target: "_blank", rel: "noopener noreferrer nofollow", class: null } }],
        text: m[5],
      });
    }

    last = m.index + m[0].length;
  }

  // Remaining text
  if (last < text.length) {
    nodes.push({ type: "text", text: text.slice(last) });
  }

  return nodes.length > 0 ? nodes : [{ type: "text", text: text || " " }];
}

/** Detect if a string is markdown (has ## headers, **bold**, [links], etc.) */
function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s/m.test(text) || /\*\*.+?\*\*/.test(text) || /\[.+?\]\(.+?\)/.test(text) || /^[-*]\s+/m.test(text);
}

export class SubstackClient {
  private base: string;
  private sid: string;

  constructor(cfg: SubstackConfig, sid: string) {
    this.base = `https://${cfg.subdomain}.substack.com`;
    this.sid = sid;
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Cookie: `substack.sid=${this.sid}`,
      Accept: "application/json",
      ...extra,
    };
  }

  async createDraft(fields: Partial<SubstackDraft> = {}): Promise<SubstackDraft> {
    const body = {
      type: "newsletter",
      audience: "everyone",
      draft_title: "",
      draft_subtitle: "",
      draft_body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: null } }] }),
      draft_bylines: [],
      ...fields,
    };
    const resp = await fetch(`${this.base}/api/v1/drafts`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`POST /api/v1/drafts failed ${resp.status}: ${text.substring(0, 300)}`);
    }
    return resp.json() as Promise<SubstackDraft>;
  }

  async getDraft(id: number | string): Promise<SubstackDraft> {
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      headers: this.headers(),
    });
    if (!resp.ok) throw new Error(`GET draft ${id} failed: ${resp.status}`);
    return resp.json() as Promise<SubstackDraft>;
  }

  async listDrafts(limit = 25): Promise<SubstackDraft[]> {
    const resp = await fetch(`${this.base}/api/v1/drafts?limit=${Math.min(limit, 25)}`, {
      headers: this.headers(),
    });
    if (!resp.ok) throw new Error(`List drafts failed: ${resp.status}`);
    const data = await resp.json() as SubstackDraft[];
    return data;
  }

  async updateDraft(id: number | string, fields: Partial<SubstackDraft>): Promise<void> {
    // Auto-convert markdown → TipTap JSON if draft_body looks like markdown
    if (fields.draft_body && typeof fields.draft_body === "string") {
      try {
        JSON.parse(fields.draft_body); // Already JSON — leave it
      } catch {
        // Not JSON — treat as markdown
        if (looksLikeMarkdown(fields.draft_body)) {
          fields.draft_body = markdownToTiptap(fields.draft_body);
        }
      }
    }
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(fields),
    });
    if (!resp.ok) throw new Error(`PUT draft ${id} failed: ${resp.status}`);
  }

  async schedulePost(id: number | string, isoDateTime: string): Promise<void> {
    // Publish first, then set post_date for future scheduling
    const pubResp = await fetch(`${this.base}/api/v1/drafts/${id}/publish`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ send: false, share_automatically: false }),
    });
    if (!pubResp.ok) {
      const text = await pubResp.text();
      throw new Error(`Publish draft ${id} failed ${pubResp.status}: ${text.substring(0, 300)}`);
    }
    const dateResp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ post_date: isoDateTime }),
    });
    if (!dateResp.ok) {
      const text = await dateResp.text();
      throw new Error(`Set post_date ${id} failed ${dateResp.status}: ${text.substring(0, 300)}`);
    }
  }

  async deleteDraft(id: number | string): Promise<boolean> {
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      method: "DELETE",
      headers: this.headers(),
    });
    return resp.ok;
  }

  async publishDraft(id: number | string, options: { send?: boolean; shareAutomatically?: boolean } = {}): Promise<boolean> {
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}/publish`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        send: options.send ?? false,
        share_automatically: options.shareAutomatically ?? false,
      }),
    });
    return resp.ok;
  }

  async patchBodyText(id: number | string, search: string, replace: string): Promise<number> {
    const draft = await this.getDraft(id);
    const original = draft.draft_body;
    const patched = original.split(search).join(replace);
    const count = (original.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    if (count === 0) return 0;
    await this.updateDraft(id, { draft_body: patched });
    return count;
  }

  async uploadImage(filePath: string): Promise<string> {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";

    const b64 = data.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;

    const resp = await fetch(`${this.base}/api/v1/image`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image: dataUrl }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Image upload failed ${resp.status}: ${text.substring(0, 200)}`);
    }

    const result = await resp.json() as { url?: string; src?: string; imageUrl?: string };
    const url = result.url || result.src || result.imageUrl;
    if (!url) throw new Error(`Upload returned no URL: ${JSON.stringify(result)}`);
    return url;
  }

  // Insert a paragraph after the paragraph containing `afterText`.
  // Supports **bold** inline syntax in `text`.
  // If afterText is null, appends at end.
  insertParagraphIntoDraft(body: string, text: string, afterText: string | null): string {
    const doc = JSON.parse(body) as TiptapDoc;

    // Parse **bold** markers into Tiptap inline nodes
    const content: TiptapNode[] = [];
    const boldRe = /\*\*(.*?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = boldRe.exec(text)) !== null) {
      if (m.index > last) content.push({ type: "text", text: text.slice(last, m.index) });
      content.push({ type: "text", marks: [{ type: "bold" }], text: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length) content.push({ type: "text", text: text.slice(last) });

    const paraNode: TiptapNode = {
      type: "paragraph",
      attrs: { textAlign: null },
      content,
    };

    if (!afterText) {
      doc.content.push(paraNode);
      return JSON.stringify(doc);
    }

    function containsText(node: TiptapNode, target: string): boolean {
      if (node.type === "text" && node.text?.includes(target)) return true;
      return (node.content ?? []).some((c) => containsText(c, target));
    }

    const idx = doc.content.findIndex((n) => containsText(n, afterText));
    if (idx === -1) throw new Error(`Could not find paragraph containing: "${afterText}"`);

    doc.content.splice(idx + 1, 0, paraNode);
    return JSON.stringify(doc);
  }

  // Insert an image node after the paragraph containing `afterText`.
  // If afterText is null, appends at the end.
  insertImageIntoDraft(body: string, imageUrl: string, afterText: string | null): string {
    const doc = JSON.parse(body) as TiptapDoc;

    const imageNode: TiptapNode = {
      type: "captionedImage",
      content: [
        {
          type: "image2",
          attrs: {
            src: imageUrl,
            fullscreen: null,
            imageSize: "normal",
            height: 672,
            width: 1584,
            resizeWidth: 728,
            bytes: null,
            alt: null,
            title: null,
            href: null,
            belowTheFold: false,
            topImage: false,
            internalRedirectUrl: null,
            isProcessing: false,
            align: "center",
          },
        },
        { type: "paragraph", attrs: { textAlign: null } },
      ],
    };

    if (!afterText) {
      doc.content.push(imageNode);
      return JSON.stringify(doc);
    }

    // Find the paragraph index containing afterText
    function containsText(node: TiptapNode, target: string): boolean {
      if (node.type === "text" && node.text?.includes(target)) return true;
      return (node.content ?? []).some((c) => containsText(c, target));
    }

    const idx = doc.content.findIndex((n) => containsText(n, afterText));
    if (idx === -1) throw new Error(`Could not find paragraph containing: "${afterText}"`);

    doc.content.splice(idx + 1, 0, imageNode);
    return JSON.stringify(doc);
  }
}

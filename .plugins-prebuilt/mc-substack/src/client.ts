import * as fs from "node:fs";
import * as path from "node:path";
import type { SubstackConfig } from "./config.js";
import type { SubstackDraft, TiptapDoc, TiptapNode } from "./types.js";

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

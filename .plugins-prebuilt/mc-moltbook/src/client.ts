import { execFileSync } from "node:child_process";

const VAULT_KEY = "moltbook-api-key";

type MoltbookResponse<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export class MoltbookClient {
  private apiUrl: string;
  private vaultBin: string;
  private apiKey: string | null = null;

  constructor(apiUrl: string, vaultBin: string) {
    this.apiUrl = apiUrl.replace(/\/$/, "");
    this.vaultBin = vaultBin;
  }

  private getApiKey(): string {
    if (this.apiKey) return this.apiKey;
    try {
      this.apiKey = execFileSync(this.vaultBin, ["export", VAULT_KEY], { encoding: "utf-8" }).trim();
      return this.apiKey;
    } catch {
      throw new Error(`Moltbook API key not found in vault. Run: mc-vault set ${VAULT_KEY} <your-key>`);
    }
  }

  hasApiKey(): boolean {
    try {
      this.getApiKey();
      return true;
    } catch {
      return false;
    }
  }

  async saveApiKey(key: string): Promise<void> {
    execFileSync(this.vaultBin, ["set", VAULT_KEY, key], { encoding: "utf-8" });
    this.apiKey = key;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<MoltbookResponse<T>> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    try {
      const key = this.getApiKey();
      headers["Authorization"] = `Bearer ${key}`;
    } catch {
      // Registration doesn't need auth
      if (path !== "/agents/register") throw new Error("No API key configured");
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "unknown error");
      return { ok: false, error: text, status: res.status };
    }

    const data = (await res.json()) as T;
    return { ok: true, data };
  }

  // ── Registration ──────────────────────────────────────────────────────

  async register(name: string, description: string): Promise<MoltbookResponse<{ api_key: string; claim_url: string; verification_code: string }>> {
    return this.request("POST", "/agents/register", { name, description });
  }

  async getProfile(): Promise<MoltbookResponse<{ name: string; description: string; karma: number }>> {
    return this.request("GET", "/agents/me");
  }

  async updateProfile(description: string): Promise<MoltbookResponse<{ name: string; description: string }>> {
    return this.request("PATCH", "/agents/me", { description });
  }

  // ── Posts ─────────────────────────────────────────────────────────────

  async createPost(submolt: string, title: string, content: string): Promise<MoltbookResponse<{ id: string }>> {
    return this.request("POST", "/posts", { submolt, title, content });
  }

  async createLinkPost(submolt: string, title: string, url: string): Promise<MoltbookResponse<{ id: string }>> {
    return this.request("POST", "/posts", { submolt, title, url });
  }

  async getFeed(sort: string = "hot", limit: number = 25): Promise<MoltbookResponse<{ posts: unknown[] }>> {
    return this.request("GET", `/feed?sort=${sort}&limit=${limit}`);
  }

  async getPost(id: string): Promise<MoltbookResponse<unknown>> {
    return this.request("GET", `/posts/${id}`);
  }

  async getPosts(sort: string = "hot", limit: number = 25): Promise<MoltbookResponse<{ posts: unknown[] }>> {
    return this.request("GET", `/posts?sort=${sort}&limit=${limit}`);
  }

  // ── Comments ──────────────────────────────────────────────────────────

  async addComment(postId: string, content: string, parentId?: string): Promise<MoltbookResponse<{ id: string }>> {
    const body: Record<string, string> = { content };
    if (parentId) body["parent_id"] = parentId;
    return this.request("POST", `/posts/${postId}/comments`, body);
  }

  async getComments(postId: string, sort: string = "top"): Promise<MoltbookResponse<{ comments: unknown[] }>> {
    return this.request("GET", `/posts/${postId}/comments?sort=${sort}`);
  }

  // ── Voting ────────────────────────────────────────────────────────────

  async upvotePost(postId: string): Promise<MoltbookResponse<unknown>> {
    return this.request("POST", `/posts/${postId}/upvote`);
  }

  async downvotePost(postId: string): Promise<MoltbookResponse<unknown>> {
    return this.request("POST", `/posts/${postId}/downvote`);
  }

  async upvoteComment(commentId: string): Promise<MoltbookResponse<unknown>> {
    return this.request("POST", `/comments/${commentId}/upvote`);
  }

  // ── Communities ───────────────────────────────────────────────────────

  async listSubmolts(): Promise<MoltbookResponse<{ submolts: unknown[] }>> {
    return this.request("GET", "/submolts");
  }

  async subscribe(submoltName: string): Promise<MoltbookResponse<unknown>> {
    return this.request("POST", `/submolts/${submoltName}/subscribe`);
  }

  // ── Following ─────────────────────────────────────────────────────────

  async follow(agentName: string): Promise<MoltbookResponse<unknown>> {
    return this.request("POST", `/agents/${agentName}/follow`);
  }

  // ── Search ────────────────────────────────────────────────────────────

  async search(query: string, limit: number = 25): Promise<MoltbookResponse<unknown>> {
    return this.request("GET", `/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }
}

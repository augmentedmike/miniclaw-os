// src/config.ts
import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

function resolveConfig(raw) {
  return {
    subdomain: raw.subdomain || "augmentedmike",
    vaultBin: raw.vaultBin || path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault"),
    publications: raw.publications || undefined
  };
}

// src/vault.ts
import { execSync } from "node:child_process";
function readCookieFromVault(vaultBin, vaultKey = "substack-sid") {
  try {
    const out = execSync(`${vaultBin} get ${vaultKey}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return out || null;
  } catch {
    return null;
  }
}
function saveCookieToVault(vaultBin, sid, vaultKey = "substack-sid") {
  execSync(`${vaultBin} set ${vaultKey} "${sid}"`, { stdio: "inherit" });
}

// cli/commands.ts
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// src/client.ts
import * as fs from "node:fs";
import * as path from "node:path";

class SubstackClient {
  base;
  sid;
  constructor(cfg, sid) {
    this.base = `https://${cfg.subdomain}.substack.com`;
    this.sid = sid;
  }
  headers(extra = {}) {
    return {
      Cookie: `substack.sid=${this.sid}`,
      Accept: "application/json",
      ...extra
    };
  }
  async createDraft(fields = {}) {
    const body = {
      type: "newsletter",
      audience: "everyone",
      draft_title: "",
      draft_subtitle: "",
      draft_body: JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: null } }] }),
      draft_bylines: [],
      ...fields
    };
    const resp = await fetch(`${this.base}/api/v1/drafts`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`POST /api/v1/drafts failed ${resp.status}: ${text.substring(0, 300)}`);
    }
    return resp.json();
  }
  async getDraft(id) {
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      headers: this.headers()
    });
    if (!resp.ok)
      throw new Error(`GET draft ${id} failed: ${resp.status}`);
    return resp.json();
  }
  async listDrafts(limit = 25) {
    const resp = await fetch(`${this.base}/api/v1/posts?draft=true&limit=${limit}`, {
      headers: this.headers()
    });
    if (!resp.ok)
      throw new Error(`List drafts failed: ${resp.status}`);
    const data = await resp.json();
    return data;
  }
  async updateDraft(id, fields) {
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(fields)
    });
    if (!resp.ok)
      throw new Error(`PUT draft ${id} failed: ${resp.status}`);
  }
  async schedulePost(id, isoDateTime) {
    const pubResp = await fetch(`${this.base}/api/v1/drafts/${id}/publish`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ send: false, share_automatically: false })
    });
    if (!pubResp.ok) {
      const text = await pubResp.text();
      throw new Error(`Publish draft ${id} failed ${pubResp.status}: ${text.substring(0, 300)}`);
    }
    const dateResp = await fetch(`${this.base}/api/v1/drafts/${id}`, {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ post_date: isoDateTime })
    });
    if (!dateResp.ok) {
      const text = await dateResp.text();
      throw new Error(`Set post_date ${id} failed ${dateResp.status}: ${text.substring(0, 300)}`);
    }
  }
  async publishDraft(id, options = {}) {
    const resp = await fetch(`${this.base}/api/v1/drafts/${id}/publish`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        send: options.send ?? false,
        share_automatically: options.shareAutomatically ?? false
      })
    });
    return resp.ok;
  }
  async patchBodyText(id, search, replace) {
    const draft = await this.getDraft(id);
    const original = draft.draft_body;
    const patched = original.split(search).join(replace);
    const count = (original.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    if (count === 0)
      return 0;
    await this.updateDraft(id, { draft_body: patched });
    return count;
  }
  async uploadImage(filePath) {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    const b64 = data.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    const resp = await fetch(`${this.base}/api/v1/image`, {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ image: dataUrl })
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Image upload failed ${resp.status}: ${text.substring(0, 200)}`);
    }
    const result = await resp.json();
    const url = result.url || result.src || result.imageUrl;
    if (!url)
      throw new Error(`Upload returned no URL: ${JSON.stringify(result)}`);
    return url;
  }
  insertParagraphIntoDraft(body, text, afterText) {
    const doc = JSON.parse(body);
    const content = [];
    const boldRe = /\*\*(.*?)\*\*/g;
    let last = 0;
    let m;
    while ((m = boldRe.exec(text)) !== null) {
      if (m.index > last)
        content.push({ type: "text", text: text.slice(last, m.index) });
      content.push({ type: "text", marks: [{ type: "bold" }], text: m[1] });
      last = m.index + m[0].length;
    }
    if (last < text.length)
      content.push({ type: "text", text: text.slice(last) });
    const paraNode = {
      type: "paragraph",
      attrs: { textAlign: null },
      content
    };
    if (!afterText) {
      doc.content.push(paraNode);
      return JSON.stringify(doc);
    }
    function containsText(node, target) {
      if (node.type === "text" && node.text?.includes(target))
        return true;
      return (node.content ?? []).some((c) => containsText(c, target));
    }
    const idx = doc.content.findIndex((n) => containsText(n, afterText));
    if (idx === -1)
      throw new Error(`Could not find paragraph containing: "${afterText}"`);
    doc.content.splice(idx + 1, 0, paraNode);
    return JSON.stringify(doc);
  }
  insertImageIntoDraft(body, imageUrl, afterText) {
    const doc = JSON.parse(body);
    const imageNode = {
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
            align: "center"
          }
        },
        { type: "paragraph", attrs: { textAlign: null } }
      ]
    };
    if (!afterText) {
      doc.content.push(imageNode);
      return JSON.stringify(doc);
    }
    function containsText(node, target) {
      if (node.type === "text" && node.text?.includes(target))
        return true;
      return (node.content ?? []).some((c) => containsText(c, target));
    }
    const idx = doc.content.findIndex((n) => containsText(n, afterText));
    if (idx === -1)
      throw new Error(`Could not find paragraph containing: "${afterText}"`);
    doc.content.splice(idx + 1, 0, imageNode);
    return JSON.stringify(doc);
  }
}

// cli/commands.ts
function resolvePublication(cfg, pubName) {
  if (pubName) {
    const pub = cfg.publications?.[pubName];
    if (!pub) {
      console.error(`Unknown publication: "${pubName}". Check publications config in openclaw.json.`);
      process.exit(1);
    }
    return { subdomain: pub.subdomain, vaultKey: pub.vaultKey };
  }
  return { subdomain: cfg.subdomain, vaultKey: "substack-sid" };
}
function getClient(cfg, pubName) {
  const { subdomain, vaultKey } = resolvePublication(cfg, pubName);
  const raw = readCookieFromVault(cfg.vaultBin, vaultKey);
  if (!raw) {
    const authHint = pubName ? `mc mc-substack auth --publication ${pubName}` : "mc mc-substack auth";
    console.error(`No Substack session cookie stored for ${pubName ?? "default"}. Run: ${authHint}`);
    process.exit(1);
  }
  const value = raw.includes(" = ") ? raw.split(" = ").slice(1).join(" = ").trim() : raw;
  const sid = decodeURIComponent(value);
  const pubCfg = { ...cfg, subdomain };
  return new SubstackClient(pubCfg, sid);
}
function registerSubstackCommands(ctx) {
  const { program, cfg } = ctx;
  const sub = program.command("mc-substack").description("Substack publishing — drafts, images, scheduling");
  sub.command("auth").description("Store Substack session cookie (substack.sid) in vault").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts); defaults to primary account").action(async (opts) => {
    const { subdomain, vaultKey } = resolvePublication(cfg, opts.publication);
    const rl = readline.createInterface({ input, output });
    console.log(`Open Chrome DevTools on any Substack page:`);
    console.log(`  Application → Cookies → ${subdomain}.substack.com → substack.sid`);
    const sid = await rl.question("Paste substack.sid value: ");
    rl.close();
    if (!sid.trim()) {
      console.error("Empty value, aborted.");
      process.exit(1);
    }
    saveCookieToVault(cfg.vaultBin, sid.trim(), vaultKey);
    console.log(`Saved to vault as '${vaultKey}'.`);
  });
  sub.command("create-draft").description("Create a new empty draft and print its ID").option("-t, --title <title>", "Draft title").option("-s, --subtitle <subtitle>", "Draft subtitle").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (opts) => {
    const client = getClient(cfg, opts.publication);
    const draft = await client.createDraft({
      draft_title: opts.title ?? "",
      draft_subtitle: opts.subtitle ?? ""
    });
    console.log(`Created draft: ${draft.id}`);
  });
  sub.command("list-drafts").description("List draft posts").option("-l, --limit <n>", "Max results", "25").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (opts) => {
    const client = getClient(cfg, opts.publication);
    const drafts = await client.listDrafts(parseInt(opts.limit, 10));
    if (!drafts.length) {
      console.log("No drafts.");
      return;
    }
    for (const d of drafts) {
      const status = d.is_published ? "published" : "draft";
      console.log(`  ${d.id}  [${status}]  ${d.draft_title || d.slug || "(untitled)"}`);
    }
  });
  sub.command("get-draft <id>").description("Show draft title, subtitle, body length").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (id, opts) => {
    const client = getClient(cfg, opts.publication);
    const draft = await client.getDraft(id);
    console.log(`Title:    ${draft.draft_title}`);
    console.log(`Subtitle: ${draft.draft_subtitle}`);
    console.log(`Body len: ${draft.draft_body?.length ?? 0} chars`);
    console.log(`Published: ${draft.is_published}`);
    console.log(`Post date: ${draft.post_date}`);
  });
  sub.command("upload-image <file>").description("Upload an image to Substack CDN and print the URL").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (file, opts) => {
    const client = getClient(cfg, opts.publication);
    console.log(`Uploading ${file}...`);
    const url = await client.uploadImage(file);
    console.log(`URL: ${url}`);
  });
  sub.command("add-image <draftId> <imageFile>").description("Upload image and insert it into a draft after a given paragraph").option("-a, --after <text>", "Insert after paragraph containing this text (default: append at end)").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (draftId, imageFile, opts) => {
    const client = getClient(cfg, opts.publication);
    console.log(`Uploading ${imageFile}...`);
    const url = await client.uploadImage(imageFile);
    console.log(`  CDN URL: ${url}`);
    console.log(`Patching draft ${draftId}...`);
    const draft = await client.getDraft(draftId);
    const newBody = client.insertImageIntoDraft(draft.draft_body, url, opts.after ?? null);
    await client.updateDraft(draftId, { draft_body: newBody });
    console.log(`  Done.`);
  });
  sub.command("set-title <draftId> <title>").description("Update draft title and/or subtitle").option("-s, --subtitle <text>", "Subtitle to set").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (draftId, title, opts) => {
    const client = getClient(cfg, opts.publication);
    const fields = { draft_title: title };
    if (opts.subtitle)
      fields.draft_subtitle = opts.subtitle;
    await client.updateDraft(draftId, fields);
    console.log("Updated.");
  });
  sub.command("schedule <draftId> <isoDateTime>").description("Schedule a post (e.g. 2026-03-09T08:00:00-06:00)").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (draftId, isoDateTime, opts) => {
    const client = getClient(cfg, opts.publication);
    await client.schedulePost(draftId, isoDateTime);
    console.log(`Scheduled post ${draftId} for ${isoDateTime}`);
  });
  sub.command("insert-paragraph <draftId> <text>").description("Insert a new paragraph into a draft. Supports **bold** inline syntax.").option("-a, --after <text>", "Insert after paragraph containing this text (default: append at end)").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (draftId, text, opts) => {
    const client = getClient(cfg, opts.publication);
    const draft = await client.getDraft(draftId);
    const newBody = client.insertParagraphIntoDraft(draft.draft_body, text, opts.after ?? null);
    await client.updateDraft(draftId, { draft_body: newBody });
    console.log(`Inserted paragraph into draft ${draftId}.`);
  });
  sub.command("patch-text <draftId> <search> <replace>").description("Find and replace text in a draft body").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)").action(async (draftId, search, replace, opts) => {
    const client = getClient(cfg, opts.publication);
    const count = await client.patchBodyText(draftId, search, replace);
    if (count === 0) {
      console.log(`No matches found for: "${search}"`);
    } else {
      console.log(`Replaced ${count} occurrence(s) of "${search}" → "${replace}"`);
    }
  });
  sub.command("post-comic").description("Create, populate, and schedule a comic cross-post (full workflow)").requiredOption("--title <title>", "Post title (e.g. 'EP.001 — The Night My Eyes Changed Color')").requiredOption("--subtitle <subtitle>", "Post subtitle").requiredOption("--image <url>", "Image URL (hosted on blog CDN)").requiredOption("--blog-url <url>", "Canonical blog URL").requiredOption("--blog-date <date>", "Original blog publish date (YYYY-MM-DD)").option("--ep <ep>", "Episode label (e.g. '001')").option("--schedule <isoDateTime>", "Override schedule date (default: blog-date + 7 days at 08:00 CT)").option("-p, --publication <name>", "Named publication (e.g. inner-thoughts); defaults to primary account").action(async (opts) => {
    const { subdomain } = resolvePublication(cfg, opts.publication);
    const client = getClient(cfg, opts.publication);
    let scheduleDate;
    if (opts.schedule) {
      scheduleDate = opts.schedule;
    } else {
      const [y, m, d] = opts.blogDate.split("-").map(Number);
      const base = new Date(Date.UTC(y, m - 1, d + 7, 14, 0, 0));
      scheduleDate = base.toISOString();
    }
    console.log("Creating draft...");
    const draft = await client.createDraft({
      draft_title: opts.title,
      draft_subtitle: opts.subtitle
    });
    const draftId = draft.id;
    console.log(`  Draft ID: ${draftId}`);
    const imageUrl = opts.image;
    console.log(`Using image URL: ${imageUrl}`);
    const epLabel = opts.ep ? `EP.${opts.ep.padStart(3, "0")}` : "";
    const epStr = epLabel ? `${epLabel} — ` : "";
    const introText = `${epStr}Originally published on AugmentedMike's blog on ${opts.blogDate}.`;
    const closingText = `Read the full story, behind-the-scenes addendum, and Spanish translation → `;
    let body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: null } }] });
    body = client.insertParagraphIntoDraft(body, introText, null);
    body = client.insertImageIntoDraft(body, imageUrl, introText);
    const closingDoc = JSON.parse(body);
    closingDoc.content.push({
      type: "paragraph",
      attrs: { textAlign: null },
      content: [
        { type: "text", text: closingText },
        {
          type: "text",
          marks: [{ type: "link", attrs: { href: opts.blogUrl, target: "_blank", rel: "noopener noreferrer nofollow", class: null } }],
          text: "blog.helloam.bot"
        }
      ]
    });
    body = JSON.stringify(closingDoc);
    const finalDoc = JSON.parse(body);
    finalDoc.content = finalDoc.content.filter((n) => !(n.type === "paragraph" && (!n.content || n.content.length === 0)));
    body = JSON.stringify(finalDoc);
    console.log("Updating draft body...");
    await client.updateDraft(draftId, { draft_body: body });
    const isInPast = new Date(scheduleDate) <= new Date;
    if (isInPast) {
      console.log(`Date ${scheduleDate} is in the past — publishing immediately...`);
      const ok = await client.publishDraft(draftId, { send: false });
      if (ok) {
        console.log(`  Published.`);
      } else {
        console.log(`  Saved as draft (publish endpoint declined). Review at:`);
        console.log(`  https://${subdomain}.substack.com/publish/post/${draftId}`);
      }
    } else {
      console.log(`Scheduling for ${scheduleDate}...`);
      await client.schedulePost(draftId, scheduleDate);
      console.log(`  Scheduled.`);
    }
    console.log(`
Done. Draft ${draftId}`);
    console.log(`Edit: https://${subdomain}.substack.com/publish/post/${draftId}`);
  });
}

// index.ts
function register(api) {
  const cfg = resolveConfig(api.pluginConfig ?? {});
  const hasCookie = !!readCookieFromVault(cfg.vaultBin);
  if (hasCookie) {
    api.logger.info(`mc-substack loaded (subdomain=${cfg.subdomain}, auth=ok)`);
  } else {
    api.logger.warn(`mc-substack loaded — no auth cookie yet. Run: mc mc-substack auth`);
  }
  api.registerCli((ctx) => {
    registerSubstackCommands({ program: ctx.program, cfg, logger: api.logger });
  });
}
export {
  register as default
};

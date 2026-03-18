import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { SubstackConfig } from "../src/config.js";
import { SubstackClient } from "../src/client.js";
import { readCookieFromVault, saveCookieToVault } from "../src/vault.js";

interface Ctx {
  program: Command;
  cfg: SubstackConfig;
  logger: Logger;
}

function resolvePublication(cfg: SubstackConfig, pubName?: string): { subdomain: string; vaultKey: string } {
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

function getClient(cfg: SubstackConfig, pubName?: string): SubstackClient {
  const { subdomain, vaultKey } = resolvePublication(cfg, pubName);
  const raw = readCookieFromVault(cfg.vaultBin, vaultKey);
  if (!raw) {
    const authHint = pubName ? `mc mc-substack auth --publication ${pubName}` : "mc mc-substack auth";
    console.error(`No Substack session cookie stored for ${pubName ?? "default"}. Run: ${authHint}`);
    process.exit(1);
  }
  // vault `get` returns "key = value" — extract value and URL-decode
  const value = raw.includes(" = ") ? raw.split(" = ").slice(1).join(" = ").trim() : raw;
  const sid = decodeURIComponent(value);
  const pubCfg = { ...cfg, subdomain };
  return new SubstackClient(pubCfg, sid);
}

export function registerSubstackCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-substack")
    .description("Substack publishing — drafts, images, scheduling");

  // ---- auth ----
  sub
    .command("auth")
    .description("Store Substack session cookie (substack.sid) in vault")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts); defaults to primary account")
    .action(async (opts: { publication?: string }) => {
      const { subdomain, vaultKey } = resolvePublication(cfg, opts.publication);
      const rl = readline.createInterface({ input, output });
      console.log(`Open Chrome DevTools on any Substack page:`);
      console.log(`  Application → Cookies → ${subdomain}.substack.com → substack.sid`);
      const sid = await rl.question("Paste substack.sid value: ");
      rl.close();
      if (!sid.trim()) { console.error("Empty value, aborted."); process.exit(1); }
      saveCookieToVault(cfg.vaultBin, sid.trim(), vaultKey);
      console.log(`Saved to vault as '${vaultKey}'.`);
    });

  // ---- create-draft ----
  sub
    .command("create-draft")
    .description("Create a new empty draft and print its ID")
    .option("-t, --title <title>", "Draft title")
    .option("-s, --subtitle <subtitle>", "Draft subtitle")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (opts: { title?: string; subtitle?: string; publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      const draft = await client.createDraft({
        draft_title: opts.title ?? "",
        draft_subtitle: opts.subtitle ?? "",
      });
      console.log(`Created draft: ${draft.id}`);
    });

  // ---- list-drafts ----
  sub
    .command("list-drafts")
    .description("List draft posts")
    .option("-l, --limit <n>", "Max results", "25")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (opts: { limit: string; publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      const drafts = await client.listDrafts(parseInt(opts.limit, 10));
      if (!drafts.length) { console.log("No drafts."); return; }
      for (const d of drafts) {
        const status = d.is_published ? "published" : "draft";
        console.log(`  ${d.id}  [${status}]  ${d.draft_title || d.slug || "(untitled)"}`);
      }
    });

  // ---- get-draft ----
  sub
    .command("get-draft <id>")
    .description("Show draft title, subtitle, body length")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (id: string, opts: { publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      const draft = await client.getDraft(id);
      console.log(`Title:    ${draft.draft_title}`);
      console.log(`Subtitle: ${draft.draft_subtitle}`);
      console.log(`Body len: ${draft.draft_body?.length ?? 0} chars`);
      console.log(`Published: ${draft.is_published}`);
      console.log(`Post date: ${draft.post_date}`);
      const schedules = draft.postSchedules ?? [];
      if (schedules.length > 0) {
        console.log(`Scheduled: ${schedules.map(s => s.trigger_at).join(", ")}`);
      } else {
        console.log(`Scheduled: none`);
      }
    });

  // ---- delete-draft ----
  sub
    .command("delete-draft [id]")
    .description("Delete a draft/post by ID. Use --all to delete every non-published draft.")
    .option("--all", "Delete all non-published drafts")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (id: string | undefined, opts: { all?: boolean; publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      if (opts.all) {
        const drafts = await client.listDrafts(50);
        const targets = drafts.filter((d) => !d.is_published);
        if (!targets.length) { console.log("No unpublished drafts found."); return; }
        console.log(`Deleting ${targets.length} draft(s)...`);
        for (const d of targets) {
          const ok = await client.deleteDraft(d.id);
          console.log(`  ${ok ? "✓" : "✗"} ${d.id}  ${d.draft_title || "(untitled)"}`);
        }
        return;
      }
      if (!id) { console.error("Provide a draft ID or use --all."); process.exit(1); }
      const ok = await client.deleteDraft(id);
      if (ok) {
        console.log(`Deleted draft ${id}.`);
      } else {
        console.error(`Failed to delete draft ${id}.`);
        process.exit(1);
      }
    });

  // ---- upload-image ----
  sub
    .command("upload-image <file>")
    .description("Upload an image to Substack CDN and print the URL")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (file: string, opts: { publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      console.log(`Uploading ${file}...`);
      const url = await client.uploadImage(file);
      console.log(`URL: ${url}`);
    });

  // ---- add-image ----
  sub
    .command("add-image <draftId> <imageFile>")
    .description("Upload image and insert it into a draft after a given paragraph")
    .option("-a, --after <text>", "Insert after paragraph containing this text (default: append at end)")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (draftId: string, imageFile: string, opts: { after?: string; publication?: string }) => {
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

  // ---- set-title ----
  sub
    .command("set-title <draftId> <title>")
    .description("Update draft title and/or subtitle")
    .option("-s, --subtitle <text>", "Subtitle to set")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (draftId: string, title: string, opts: { subtitle?: string; publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      const fields: Record<string, string> = { draft_title: title };
      if (opts.subtitle) fields.draft_subtitle = opts.subtitle;
      await client.updateDraft(draftId, fields as never);
      console.log("Updated.");
    });

  // ---- schedule ----
  sub
    .command("schedule <draftId> <isoDateTime>")
    .description("Schedule a post (e.g. 2026-03-09T08:00:00-06:00)")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (draftId: string, isoDateTime: string, opts: { publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      await client.schedulePost(draftId, isoDateTime);
      console.log(`Scheduled post ${draftId} for ${isoDateTime}`);
    });

  // ---- insert-paragraph ----
  sub
    .command("insert-paragraph <draftId> <text>")
    .description("Insert a new paragraph into a draft. Supports **bold** inline syntax.")
    .option("-a, --after <text>", "Insert after paragraph containing this text (default: append at end)")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (draftId: string, text: string, opts: { after?: string; publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      const draft = await client.getDraft(draftId);
      const newBody = client.insertParagraphIntoDraft(draft.draft_body, text, opts.after ?? null);
      await client.updateDraft(draftId, { draft_body: newBody });
      console.log(`Inserted paragraph into draft ${draftId}.`);
    });

  // ---- patch-text ----
  sub
    .command("patch-text <draftId> <search> <replace>")
    .description("Find and replace text in a draft body")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (draftId: string, search: string, replace: string, opts: { publication?: string }) => {
      const client = getClient(cfg, opts.publication);
      const count = await client.patchBodyText(draftId, search, replace);
      if (count === 0) {
        console.log(`No matches found for: "${search}"`);
      } else {
        console.log(`Replaced ${count} occurrence(s) of "${search}" → "${replace}"`);
      }
    });

  // ---- copy-images ----
  sub
    .command("copy-images <fromId> <toId>")
    .description("Copy captionedImage nodes from one draft to another (no re-upload)")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts)")
    .action(async (fromId: string, toId: string, opts: { publication?: string }) => {
      const client = getClient(cfg, opts.publication);

      console.log(`Fetching source draft ${fromId}...`);
      const src = await client.getDraft(fromId);
      const srcDoc = JSON.parse(src.draft_body) as { type: string; content: Array<{ type: string; [k: string]: unknown }> };
      const imgNodes = srcDoc.content.filter((n) => n.type === "captionedImage");
      if (imgNodes.length === 0) {
        console.error(`No captionedImage nodes found in draft ${fromId}.`);
        process.exit(1);
      }
      console.log(`  Found ${imgNodes.length} captionedImage node(s).`);

      console.log(`Fetching target draft ${toId}...`);
      const dst = await client.getDraft(toId);
      const dstDoc = JSON.parse(dst.draft_body) as { type: string; content: Array<{ type: string; [k: string]: unknown }> };

      // Remove any existing captionedImage nodes from target to avoid dupes
      const filtered = dstDoc.content.filter((n) => n.type !== "captionedImage");

      // Splice before the last paragraph (or append if no paragraphs)
      const lastParaIdx = filtered.reduce((acc, n, i) => (n.type === "paragraph" ? i : acc), -1);
      const insertAt = lastParaIdx >= 0 ? lastParaIdx : filtered.length;
      filtered.splice(insertAt, 0, ...imgNodes);
      dstDoc.content = filtered;

      console.log(`Updating target draft ${toId}...`);
      await client.updateDraft(toId, { draft_body: JSON.stringify(dstDoc) });
      console.log(`  Done. Copied ${imgNodes.length} image(s) from ${fromId} → ${toId}.`);
    });

  // ---- post-comic ----
  sub
    .command("post-comic")
    .description("Create, populate, and schedule a comic cross-post (full workflow)")
    .requiredOption("--title <title>", "Post title (e.g. 'EP.001 — The Night My Eyes Changed Color')")
    .requiredOption("--subtitle <subtitle>", "Post subtitle")
    .requiredOption("--image <url>", "Image URL (hosted on blog CDN)")
    .requiredOption("--blog-url <url>", "Canonical blog URL")
    .requiredOption("--blog-date <date>", "Original blog publish date (YYYY-MM-DD)")
    .option("--ep <ep>", "Episode label (e.g. '001')")
    .option("--schedule <isoDateTime>", "Override schedule date (default: blog-date + 7 days at 08:00 CT)")
    .option("-p, --publication <name>", "Named publication (e.g. inner-thoughts); defaults to primary account")
    .action(async (opts: {
      title: string;
      subtitle: string;
      image: string;   // hosted URL
      blogUrl: string;
      blogDate: string;
      ep?: string;
      schedule?: string;
      publication?: string;
    }) => {
      const { subdomain } = resolvePublication(cfg, opts.publication);
      const client = getClient(cfg, opts.publication);

      // Compute schedule date: blog date + 7 days at 08:00 America/Chicago
      let scheduleDate: string;
      if (opts.schedule) {
        scheduleDate = opts.schedule;
      } else {
        const [y, m, d] = opts.blogDate.split("-").map(Number);
        const base = new Date(Date.UTC(y, m - 1, d + 7, 14, 0, 0)); // 08:00 CT = 14:00 UTC
        scheduleDate = base.toISOString();
      }

      // 1. Create draft
      console.log("Creating draft...");
      const draft = await client.createDraft({
        draft_title: opts.title,
        draft_subtitle: opts.subtitle,
      });
      const draftId = draft.id;
      console.log(`  Draft ID: ${draftId}`);

      // 2. Use hosted image URL directly
      const imageUrl = opts.image;
      console.log(`Using image URL: ${imageUrl}`);

      // 3. Build body: intro → image → closing
      const epLabel = opts.ep ? `EP.${opts.ep.padStart(3, "0")}` : "";
      const epStr = epLabel ? `${epLabel} — ` : "";
      const introText = `${epStr}Originally published on AugmentedMike's blog on ${opts.blogDate}.`;
      const closingText = `Read the full story, behind-the-scenes addendum, and Spanish translation → `;

      // Start from blank doc
      let body = JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { textAlign: null } }] });

      // Insert intro paragraph (replace the blank one)
      body = client.insertParagraphIntoDraft(body, introText, null);

      // Insert image after intro
      body = client.insertImageIntoDraft(body, imageUrl, introText);

      // Insert closing paragraph with link after image
      const closingDoc = JSON.parse(body);
      closingDoc.content.push({
        type: "paragraph",
        attrs: { textAlign: null },
        content: [
          { type: "text", text: closingText },
          {
            type: "text",
            marks: [{ type: "link", attrs: { href: opts.blogUrl, target: "_blank", rel: "noopener noreferrer nofollow", class: null } }],
            text: "blog.helloam.bot",
          },
        ],
      });
      body = JSON.stringify(closingDoc);

      // Remove the initial blank paragraph
      const finalDoc = JSON.parse(body);
      finalDoc.content = finalDoc.content.filter((n: { type: string; content?: unknown[] }) =>
        !(n.type === "paragraph" && (!n.content || n.content.length === 0))
      );
      body = JSON.stringify(finalDoc);

      // 4. Update draft with full body
      console.log("Updating draft body...");
      await client.updateDraft(draftId, { draft_body: body });

      // 5. Schedule or publish
      const isInPast = new Date(scheduleDate) <= new Date();
      if (isInPast) {
        // Backfill: try to publish immediately (Substack may allow backdated posts)
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

      console.log(`\nDone. Draft ${draftId}`);
      console.log(`Edit: https://${subdomain}.substack.com/publish/post/${draftId}`);
    });
}

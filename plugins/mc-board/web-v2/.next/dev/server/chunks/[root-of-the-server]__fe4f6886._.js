module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[project]/src/lib/data.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getActiveIds",
    ()=>getActiveIds,
    "getCard",
    ()=>getCard,
    "listCards",
    ()=>listCards,
    "listProjects",
    ()=>listProjects,
    "parseCard",
    ()=>parseCard
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs [external] (node:fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$js$2d$yaml$2f$dist$2f$js$2d$yaml$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/js-yaml/dist/js-yaml.mjs [app-route] (ecmascript)");
;
;
;
function resolvePath(p) {
    return p.startsWith("~") ? p.replace("~", process.env.HOME ?? "") : p;
}
const CARDS_DIR = resolvePath(process.env.BOARD_CARDS_DIR ?? "");
const PROJECTS_DIR = resolvePath(process.env.BOARD_PROJECTS_DIR ?? "");
const ACTIVE_WORK = resolvePath(process.env.BOARD_ACTIVE_WORK ?? "");
function parseFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return {
        meta: {},
        body: raw
    };
    try {
        const meta = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$js$2d$yaml$2f$dist$2f$js$2d$yaml$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"].load(match[1]);
        return {
            meta: meta ?? {},
            body: match[2]
        };
    } catch  {
        return {
            meta: {},
            body: raw
        };
    }
}
function parseBody(body) {
    const sections = {
        problem_description: "",
        implementation_plan: "",
        acceptance_criteria: "",
        notes: "",
        review_notes: ""
    };
    let current = "";
    const SECTION_MAP = {
        "problem description": "problem_description",
        "implementation plan": "implementation_plan",
        "acceptance criteria": "acceptance_criteria",
        "notes / outcome": "notes",
        "notes": "notes",
        "review notes": "review_notes"
    };
    for (const line of body.split("\n")){
        const hm = line.match(/^##\s+(.+)$/);
        if (hm) {
            current = SECTION_MAP[hm[1].toLowerCase()] ?? "";
            continue;
        }
        if (current) sections[current] = (sections[current] + "\n" + line).trimStart();
    }
    for (const k of Object.keys(sections))sections[k] = sections[k].trim();
    return sections;
}
function parseCard(content) {
    const { meta, body } = parseFrontmatter(content);
    const sections = parseBody(body);
    const historyRaw = meta.history ?? [];
    return {
        id: String(meta.id ?? ""),
        title: String(meta.title ?? ""),
        column: meta.column ?? "backlog",
        priority: meta.priority ?? "medium",
        tags: meta.tags ?? [],
        project_id: meta.project_id ? String(meta.project_id) : undefined,
        created_at: String(meta.created_at ?? ""),
        updated_at: String(meta.updated_at ?? ""),
        history: historyRaw.map((h)=>({
                column: h.column,
                moved_at: h.moved_at
            })),
        problem_description: sections.problem_description ?? "",
        implementation_plan: sections.implementation_plan ?? "",
        acceptance_criteria: sections.acceptance_criteria ?? "",
        notes: sections.notes ?? "",
        review_notes: sections.review_notes ?? ""
    };
}
function listCards(projectId) {
    if (!CARDS_DIR || !__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["existsSync"](CARDS_DIR)) return [];
    const files = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readdirSync"](CARDS_DIR).filter((f)=>f.endsWith(".md"));
    const byId = new Map();
    for (const f of files){
        try {
            const content = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readFileSync"](__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["join"](CARDS_DIR, f), "utf-8");
            const card = parseCard(content);
            const existing = byId.get(card.id);
            if (!existing || card.updated_at > existing.updated_at) byId.set(card.id, card);
        } catch  {}
    }
    const cards = [
        ...byId.values()
    ];
    return projectId ? cards.filter((c)=>c.project_id === projectId) : cards;
}
function getCard(id) {
    if (!CARDS_DIR || !__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["existsSync"](CARDS_DIR)) return null;
    const files = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readdirSync"](CARDS_DIR).filter((f)=>f.startsWith(id) && f.endsWith(".md"));
    if (!files[0]) return null;
    try {
        const content = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readFileSync"](__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["join"](CARDS_DIR, files[0]), "utf-8");
        return parseCard(content);
    } catch  {
        return null;
    }
}
function listProjects() {
    if (!PROJECTS_DIR || !__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["existsSync"](PROJECTS_DIR)) return [];
    const files = __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readdirSync"](PROJECTS_DIR).filter((f)=>f.endsWith(".json"));
    return files.flatMap((f)=>{
        try {
            const raw = JSON.parse(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readFileSync"](__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["join"](PROJECTS_DIR, f), "utf-8"));
            return [
                {
                    id: raw.id,
                    name: raw.name ?? f.replace(".json", ""),
                    description: raw.description
                }
            ];
        } catch  {
            return [];
        }
    });
}
function getActiveIds() {
    if (!ACTIVE_WORK || !__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["existsSync"](ACTIVE_WORK)) return [];
    try {
        const data = JSON.parse(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["readFileSync"](ACTIVE_WORK, "utf-8"));
        return (data.active ?? []).map((e)=>e.cardId);
    } catch  {
        return [];
    }
}
}),
"[project]/src/app/api/board/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "dynamic",
    ()=>dynamic
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$data$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/data.ts [app-route] (ecmascript)");
;
;
const dynamic = "force-dynamic";
function GET(req) {
    const projectId = req.nextUrl.searchParams.get("project") ?? undefined;
    const cards = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$data$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["listCards"])(projectId);
    const projects = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$data$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["listProjects"])();
    const activeIds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$data$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getActiveIds"])();
    const counts = {
        backlog: cards.filter((c)=>c.column === "backlog").length,
        inProgress: cards.filter((c)=>c.column === "in-progress").length,
        inReview: cards.filter((c)=>c.column === "in-review").length,
        shipped: cards.filter((c)=>c.column === "shipped").length
    };
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        cards,
        projects,
        activeIds,
        counts
    });
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__fe4f6886._.js.map
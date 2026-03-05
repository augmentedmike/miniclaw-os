(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/src/components/CardItem.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CardItem",
    ()=>CardItem
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
"use client";
;
;
const PRIORITY_DOT = {
    high: "bg-red-500",
    medium: "bg-yellow-400",
    low: "bg-zinc-500"
};
const PRIORITY_BORDER = {
    high: "border-l-red-500",
    medium: "border-l-yellow-400",
    low: "border-l-zinc-600"
};
function criteriaProgress(criteria) {
    const lines = criteria.split("\n").filter((l)=>l.match(/^\s*-\s*\[/));
    const checked = lines.filter((l)=>l.match(/^\s*-\s*\[x\]/i)).length;
    return {
        checked,
        total: lines.length
    };
}
function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
    });
}
const CardItem = /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["memo"])(_c = function CardItem({ card, projectName, isActive, onClick }) {
    const { checked, total } = criteriaProgress(card.acceptance_criteria);
    const pct = total > 0 ? Math.round(checked / total * 100) : -1;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: `
        group relative bg-zinc-800 border border-zinc-700 border-l-4 rounded-sm
        cursor-pointer select-none
        hover:bg-zinc-750 hover:border-zinc-600
        transition-colors duration-100
        ${PRIORITY_BORDER[card.priority]}
        ${isActive ? "ring-1 ring-emerald-500" : ""}
      `,
        onClick: ()=>onClick(card.id),
        children: [
            isActive && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                className: "absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
            }, void 0, false, {
                fileName: "[project]/src/components/CardItem.tsx",
                lineNumber: 54,
                columnNumber: 9
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "px-3 py-2.5",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-start gap-1.5 mb-1",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: `mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[card.priority]}`
                            }, void 0, false, {
                                fileName: "[project]/src/components/CardItem.tsx",
                                lineNumber: 59,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-sm text-zinc-100 leading-snug font-medium",
                                children: card.title
                            }, void 0, false, {
                                fileName: "[project]/src/components/CardItem.tsx",
                                lineNumber: 60,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/CardItem.tsx",
                        lineNumber: 58,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-2 text-xs text-zinc-500 mt-1.5 flex-wrap",
                        children: [
                            projectName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-zinc-400 font-mono truncate max-w-[120px]",
                                children: projectName
                            }, void 0, false, {
                                fileName: "[project]/src/components/CardItem.tsx",
                                lineNumber: 65,
                                columnNumber: 13
                            }, this),
                            card.tags.slice(0, 3).map((tag)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "bg-zinc-700 text-zinc-400 px-1 rounded",
                                    children: tag
                                }, tag, false, {
                                    fileName: "[project]/src/components/CardItem.tsx",
                                    lineNumber: 68,
                                    columnNumber: 13
                                }, this)),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "ml-auto shrink-0",
                                children: fmtDate(card.created_at)
                            }, void 0, false, {
                                fileName: "[project]/src/components/CardItem.tsx",
                                lineNumber: 70,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/CardItem.tsx",
                        lineNumber: 63,
                        columnNumber: 9
                    }, this),
                    pct >= 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "mt-2",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "flex items-center gap-1.5",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                    className: "flex-1 h-0.5 bg-zinc-700 rounded-full overflow-hidden",
                                    children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "h-full bg-emerald-500 rounded-full transition-all duration-300",
                                        style: {
                                            width: `${pct}%`
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/CardItem.tsx",
                                        lineNumber: 77,
                                        columnNumber: 17
                                    }, this)
                                }, void 0, false, {
                                    fileName: "[project]/src/components/CardItem.tsx",
                                    lineNumber: 76,
                                    columnNumber: 15
                                }, this),
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                    className: "text-[10px] text-zinc-500 shrink-0",
                                    children: [
                                        checked,
                                        "/",
                                        total
                                    ]
                                }, void 0, true, {
                                    fileName: "[project]/src/components/CardItem.tsx",
                                    lineNumber: 82,
                                    columnNumber: 15
                                }, this)
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/CardItem.tsx",
                            lineNumber: 75,
                            columnNumber: 13
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/CardItem.tsx",
                        lineNumber: 74,
                        columnNumber: 11
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/CardItem.tsx",
                lineNumber: 57,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/CardItem.tsx",
        lineNumber: 42,
        columnNumber: 5
    }, this);
});
_c1 = CardItem;
var _c, _c1;
__turbopack_context__.k.register(_c, "CardItem$memo");
__turbopack_context__.k.register(_c1, "CardItem");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Column.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Column",
    ()=>Column
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$CardItem$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/CardItem.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const PRIORITY_RANK = {
    high: 0,
    medium: 1,
    low: 2
};
const COL_LABELS = {
    backlog: "Backlog",
    "in-progress": "In Progress",
    "in-review": "In Review",
    shipped: "Shipped"
};
const COL_BADGE = {
    backlog: "bg-zinc-700 text-zinc-300",
    "in-progress": "bg-blue-900 text-blue-300",
    "in-review": "bg-purple-900 text-purple-300",
    shipped: "bg-emerald-900 text-emerald-300"
};
function sortCards(cards, activeIds) {
    return [
        ...cards
    ].sort((a, b)=>{
        const aActive = activeIds.has(a.id) ? 0 : 1;
        const bActive = activeIds.has(b.id) ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pd !== 0) return pd;
        return a.created_at < b.created_at ? -1 : 1;
    });
}
function Column({ column, cards, projects, activeIds, onCardClick }) {
    _s();
    const projectMap = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "Column.useMemo[projectMap]": ()=>Object.fromEntries(projects.map({
                "Column.useMemo[projectMap]": (p)=>[
                        p.id,
                        p.name
                    ]
            }["Column.useMemo[projectMap]"]))
    }["Column.useMemo[projectMap]"], [
        projects
    ]);
    const colCards = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "Column.useMemo[colCards]": ()=>sortCards(cards.filter({
                "Column.useMemo[colCards]": (c)=>c.column === column
            }["Column.useMemo[colCards]"]), activeIds)
    }["Column.useMemo[colCards]"], [
        cards,
        column,
        activeIds
    ]);
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col min-w-[280px] max-w-[320px] flex-1 bg-zinc-900 rounded border border-zinc-800",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 shrink-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: `text-xs font-semibold px-2 py-0.5 rounded-full ${COL_BADGE[column]}`,
                        children: COL_LABELS[column]
                    }, void 0, false, {
                        fileName: "[project]/src/components/Column.tsx",
                        lineNumber: 56,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-xs text-zinc-500 ml-auto",
                        children: colCards.length
                    }, void 0, false, {
                        fileName: "[project]/src/components/Column.tsx",
                        lineNumber: 59,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Column.tsx",
                lineNumber: 55,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0",
                children: colCards.length === 0 ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                    className: "text-xs text-zinc-600 text-center py-6",
                    children: "empty"
                }, void 0, false, {
                    fileName: "[project]/src/components/Column.tsx",
                    lineNumber: 64,
                    columnNumber: 11
                }, this) : colCards.map((card)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$CardItem$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardItem"], {
                        card: card,
                        projectName: card.project_id ? projectMap[card.project_id] : undefined,
                        isActive: activeIds.has(card.id),
                        onClick: onCardClick
                    }, card.id, false, {
                        fileName: "[project]/src/components/Column.tsx",
                        lineNumber: 67,
                        columnNumber: 13
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/Column.tsx",
                lineNumber: 62,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Column.tsx",
        lineNumber: 54,
        columnNumber: 5
    }, this);
}
_s(Column, "HpE+MlM4KSxvCsetroAzV7UxjlA=");
_c = Column;
var _c;
__turbopack_context__.k.register(_c, "Column");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/CardModal.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CardModal",
    ()=>CardModal
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-client] (ecmascript) <locals>");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
const fetcher = (url)=>fetch(url).then((r)=>r.json());
function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}
function renderMarkdown(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`(.+?)`/g, "<code>$1</code>").replace(/^\s*-\s*\[x\]\s*(.+)$/gim, '<span class="flex gap-2"><span class="text-emerald-400">✓</span><span class="line-through text-zinc-500">$1</span></span>').replace(/^\s*-\s*\[ \]\s*(.+)$/gim, '<span class="flex gap-2"><span class="text-zinc-600">☐</span><span>$1</span></span>').replace(/^\s*-\s*(.+)$/gim, '<span class="flex gap-2 ml-2"><span class="text-zinc-500">·</span><span>$1</span></span>').replace(/\n/g, "<br>");
}
const SECTIONS = [
    {
        label: "Problem",
        field: "problem_description"
    },
    {
        label: "Plan",
        field: "implementation_plan"
    },
    {
        label: "Criteria",
        field: "acceptance_criteria"
    },
    {
        label: "Notes",
        field: "notes"
    },
    {
        label: "Review",
        field: "review_notes"
    }
];
function CardModal({ cardId, projects, onClose }) {
    _s();
    const { data: card } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(cardId ? `/api/card/${cardId}` : null, fetcher, {
        refreshInterval: 5000
    });
    const projectMap = Object.fromEntries(projects.map((p)=>[
            p.id,
            p.name
        ]));
    const handleKey = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useCallback"])({
        "CardModal.useCallback[handleKey]": (e)=>{
            if (e.key === "Escape") onClose();
        }
    }["CardModal.useCallback[handleKey]"], [
        onClose
    ]);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "CardModal.useEffect": ()=>{
            document.addEventListener("keydown", handleKey);
            return ({
                "CardModal.useEffect": ()=>document.removeEventListener("keydown", handleKey)
            })["CardModal.useEffect"];
        }
    }["CardModal.useEffect"], [
        handleKey
    ]);
    if (!cardId) return null;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-16",
        onClick: (e)=>{
            if (e.target === e.currentTarget) onClose();
        },
        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl",
            children: !card ? /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "p-8 text-center text-zinc-500",
                children: "Loading..."
            }, void 0, false, {
                fileName: "[project]/src/components/CardModal.tsx",
                lineNumber: 74,
                columnNumber: 11
            }, this) : /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "sticky top-0 bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-start gap-3",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "flex-1 min-w-0",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex items-center gap-2 mb-1",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: `text-xs px-1.5 py-0.5 rounded font-medium ${card.priority === "high" ? "bg-red-900 text-red-300" : card.priority === "medium" ? "bg-yellow-900 text-yellow-300" : "bg-zinc-700 text-zinc-400"}`,
                                                children: card.priority
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/CardModal.tsx",
                                                lineNumber: 80,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-zinc-500 uppercase tracking-wide",
                                                children: card.column.replace("-", " ")
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/CardModal.tsx",
                                                lineNumber: 85,
                                                columnNumber: 19
                                            }, this),
                                            card.project_id && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                className: "text-xs text-zinc-400 ml-auto",
                                                children: projectMap[card.project_id] ?? card.project_id
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/CardModal.tsx",
                                                lineNumber: 87,
                                                columnNumber: 21
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/CardModal.tsx",
                                        lineNumber: 79,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        className: "text-base font-semibold text-zinc-100 leading-snug",
                                        children: card.title
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/CardModal.tsx",
                                        lineNumber: 90,
                                        columnNumber: 17
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "flex gap-3 mt-1 text-xs text-zinc-600",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: [
                                                    "Created ",
                                                    fmtDate(card.created_at)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/CardModal.tsx",
                                                lineNumber: 92,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: "·"
                                            }, void 0, false, {
                                                fileName: "[project]/src/components/CardModal.tsx",
                                                lineNumber: 93,
                                                columnNumber: 19
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: [
                                                    "Updated ",
                                                    fmtDate(card.updated_at)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/src/components/CardModal.tsx",
                                                lineNumber: 94,
                                                columnNumber: 19
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/src/components/CardModal.tsx",
                                        lineNumber: 91,
                                        columnNumber: 17
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/CardModal.tsx",
                                lineNumber: 78,
                                columnNumber: 15
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                onClick: onClose,
                                className: "shrink-0 text-zinc-500 hover:text-zinc-300 text-xl leading-none mt-0.5",
                                children: "×"
                            }, void 0, false, {
                                fileName: "[project]/src/components/CardModal.tsx",
                                lineNumber: 97,
                                columnNumber: 15
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/CardModal.tsx",
                        lineNumber: 77,
                        columnNumber: 13
                    }, this),
                    card.tags.length > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-5 pt-3 flex flex-wrap gap-1",
                        children: card.tags.map((tag)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded",
                                children: tag
                            }, tag, false, {
                                fileName: "[project]/src/components/CardModal.tsx",
                                lineNumber: 106,
                                columnNumber: 19
                            }, this))
                    }, void 0, false, {
                        fileName: "[project]/src/components/CardModal.tsx",
                        lineNumber: 104,
                        columnNumber: 15
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "px-5 py-4 space-y-5",
                        children: SECTIONS.map(({ label, field })=>{
                            const val = card[field];
                            if (!val?.trim()) return null;
                            return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        className: "text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2",
                                        children: label
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/CardModal.tsx",
                                        lineNumber: 117,
                                        columnNumber: 21
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "text-sm text-zinc-300 leading-relaxed space-y-1 font-mono",
                                        dangerouslySetInnerHTML: {
                                            __html: renderMarkdown(val)
                                        }
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/CardModal.tsx",
                                        lineNumber: 118,
                                        columnNumber: 21
                                    }, this)
                                ]
                            }, field, true, {
                                fileName: "[project]/src/components/CardModal.tsx",
                                lineNumber: 116,
                                columnNumber: 19
                            }, this);
                        })
                    }, void 0, false, {
                        fileName: "[project]/src/components/CardModal.tsx",
                        lineNumber: 111,
                        columnNumber: 13
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "border-t border-zinc-800 px-5 py-3",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                            className: "text-xs text-zinc-600 font-mono",
                            children: card.id
                        }, void 0, false, {
                            fileName: "[project]/src/components/CardModal.tsx",
                            lineNumber: 128,
                            columnNumber: 15
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/CardModal.tsx",
                        lineNumber: 127,
                        columnNumber: 13
                    }, this)
                ]
            }, void 0, true)
        }, void 0, false, {
            fileName: "[project]/src/components/CardModal.tsx",
            lineNumber: 72,
            columnNumber: 7
        }, this)
    }, void 0, false, {
        fileName: "[project]/src/components/CardModal.tsx",
        lineNumber: 68,
        columnNumber: 5
    }, this);
}
_s(CardModal, "sCrKANr4y8pHhsY+e+HsprZogA8=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]
    ];
});
_c = CardModal;
var _c;
__turbopack_context__.k.register(_c, "CardModal");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/src/components/Board.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Board",
    ()=>Board
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/swr/dist/index/index.mjs [app-client] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Column$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/Column.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$CardModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/components/CardModal.tsx [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
"use client";
;
;
;
;
const fetcher = (url)=>fetch(url).then((r)=>r.json());
const ACTIVE_COLS = [
    "backlog",
    "in-progress",
    "in-review"
];
function Board() {
    _s();
    const [selectedProject, setSelectedProject] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])("");
    const [openCardId, setOpenCardId] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useState"])(null);
    const qs = selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : "";
    const { data, isLoading } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])(`/api/board${qs}`, fetcher, {
        refreshInterval: 10000,
        revalidateOnFocus: false,
        keepPreviousData: true
    });
    const activeIds = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useMemo"])({
        "Board.useMemo[activeIds]": ()=>new Set(data?.activeIds ?? [])
    }["Board.useMemo[activeIds]"], [
        data?.activeIds
    ]);
    if (isLoading && !data) {
        return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
            className: "flex items-center justify-center h-full text-zinc-500 text-sm",
            children: "Loading board..."
        }, void 0, false, {
            fileName: "[project]/src/components/Board.tsx",
            lineNumber: 35,
            columnNumber: 7
        }, this);
    }
    const cards = data?.cards ?? [];
    const projects = data?.projects ?? [];
    const counts = data?.counts;
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "flex flex-col h-full bg-zinc-950 text-zinc-100",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex items-center gap-4 px-4 py-2.5 border-b border-zinc-800 shrink-0",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                        className: "text-sm font-semibold text-zinc-200",
                        children: "Board"
                    }, void 0, false, {
                        fileName: "[project]/src/components/Board.tsx",
                        lineNumber: 49,
                        columnNumber: 9
                    }, this),
                    counts && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-3 text-xs text-zinc-500",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-zinc-300 font-medium",
                                        children: counts.backlog
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/Board.tsx",
                                        lineNumber: 54,
                                        columnNumber: 19
                                    }, this),
                                    " backlog"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/Board.tsx",
                                lineNumber: 54,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-blue-400 font-medium",
                                        children: counts.inProgress
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/Board.tsx",
                                        lineNumber: 55,
                                        columnNumber: 19
                                    }, this),
                                    " active"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/Board.tsx",
                                lineNumber: 55,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-purple-400 font-medium",
                                        children: counts.inReview
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/Board.tsx",
                                        lineNumber: 56,
                                        columnNumber: 19
                                    }, this),
                                    " review"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/Board.tsx",
                                lineNumber: 56,
                                columnNumber: 13
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        className: "text-emerald-400 font-medium",
                                        children: counts.shipped
                                    }, void 0, false, {
                                        fileName: "[project]/src/components/Board.tsx",
                                        lineNumber: 57,
                                        columnNumber: 19
                                    }, this),
                                    " shipped"
                                ]
                            }, void 0, true, {
                                fileName: "[project]/src/components/Board.tsx",
                                lineNumber: 57,
                                columnNumber: 13
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Board.tsx",
                        lineNumber: 53,
                        columnNumber: 11
                    }, this),
                    activeIds.size > 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "flex items-center gap-1.5 text-xs text-emerald-400 ml-2",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                className: "w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                            }, void 0, false, {
                                fileName: "[project]/src/components/Board.tsx",
                                lineNumber: 64,
                                columnNumber: 13
                            }, this),
                            activeIds.size,
                            " agent",
                            activeIds.size > 1 ? "s" : "",
                            " working"
                        ]
                    }, void 0, true, {
                        fileName: "[project]/src/components/Board.tsx",
                        lineNumber: 63,
                        columnNumber: 11
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                        className: "ml-auto",
                        children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("select", {
                            value: selectedProject,
                            onChange: (e)=>setSelectedProject(e.target.value),
                            className: "bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500",
                            children: [
                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                    value: "",
                                    children: "All projects"
                                }, void 0, false, {
                                    fileName: "[project]/src/components/Board.tsx",
                                    lineNumber: 76,
                                    columnNumber: 13
                                }, this),
                                projects.map((p)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("option", {
                                        value: p.id,
                                        children: p.name
                                    }, p.id, false, {
                                        fileName: "[project]/src/components/Board.tsx",
                                        lineNumber: 78,
                                        columnNumber: 15
                                    }, this))
                            ]
                        }, void 0, true, {
                            fileName: "[project]/src/components/Board.tsx",
                            lineNumber: 71,
                            columnNumber: 11
                        }, this)
                    }, void 0, false, {
                        fileName: "[project]/src/components/Board.tsx",
                        lineNumber: 70,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/src/components/Board.tsx",
                lineNumber: 48,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "flex flex-1 gap-3 p-3 overflow-x-auto min-h-0",
                children: ACTIVE_COLS.map((col)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$Column$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Column"], {
                        column: col,
                        cards: cards,
                        projects: projects,
                        activeIds: activeIds,
                        onCardClick: setOpenCardId
                    }, col, false, {
                        fileName: "[project]/src/components/Board.tsx",
                        lineNumber: 87,
                        columnNumber: 11
                    }, this))
            }, void 0, false, {
                fileName: "[project]/src/components/Board.tsx",
                lineNumber: 85,
                columnNumber: 7
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$components$2f$CardModal$2e$tsx__$5b$app$2d$client$5d$__$28$ecmascript$29$__["CardModal"], {
                cardId: openCardId,
                projects: projects,
                onClose: ()=>setOpenCardId(null)
            }, void 0, false, {
                fileName: "[project]/src/components/Board.tsx",
                lineNumber: 99,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/src/components/Board.tsx",
        lineNumber: 46,
        columnNumber: 5
    }, this);
}
_s(Board, "CuMdZcdicUa2LV/eG3kpm8TxMHU=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$swr$2f$dist$2f$index$2f$index$2e$mjs__$5b$app$2d$client$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"]
    ];
});
_c = Board;
var _c;
__turbopack_context__.k.register(_c, "Board");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=src_components_b8e873f7._.js.map
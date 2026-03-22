import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      try { return hljs.highlight(code, { language }).value; } catch { return code; }
    },
  }),
  { breaks: true, gfm: true }
);

if (marked.defaults.renderer) {
  marked.defaults.renderer.listitem = function(token) {
    if (token.task) {
      const checkbox = token.checked
        ? '<span style="color:var(--accent)">✓</span>'
        : '<span class="text-zinc-600">☐</span>';
      const textClass = token.checked ? "line-through text-zinc-500" : "";
      return `<li class="flex gap-2">${checkbox}<span class="${textClass}">${token.text}</span></li>`;
    }
    return `<li>${token.text}</li>`;
  };
}

export function unescapeNewlines(s: string): string { return s.replace(/\\n/g, "\n"); }

const FILE_PATH_RE = /(~\/[\w./@-]+(?:\/[\w./@-]+)*|\/[\w./@-]+(?:\/[\w./@-]+)+\.[\w]+|(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|sh|py|png|jpg|jpeg|gif|svg|css|html|yaml|yml|toml|rs|go|sql|rb|java|kt|swift|c|cpp|h|hpp|lock|env))/g;

function linkifyFilePaths(html: string): string {
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    if (!text) return "";
    return text.replace(FILE_PATH_RE, (fp: string) =>
      `<span data-fp="${fp}" style="color:#60a5fa;cursor:pointer;text-decoration:underline;text-decoration-style:dashed">${fp}</span>`
    );
  });
}

export function renderMarkdown(text: string): string {
  if (!text) return "";
  try { return linkifyFilePaths(marked(unescapeNewlines(text), { async: false }) as string); } catch { return text; }
}

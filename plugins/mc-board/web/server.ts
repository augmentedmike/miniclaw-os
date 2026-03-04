import * as http from "node:http";
import * as url from "node:url";
import type { CardStore } from "../src/store.js";
import type { ProjectStore } from "../src/project-store.js";
import { renderPage } from "./template.js";

export function startWebServer(
  store: CardStore,
  projects: ProjectStore,
  port: number,
  logger: { info: (m: string) => void; error: (m: string) => void },
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    const parsed = url.parse(req.url ?? "/", true);
    const pathname = parsed.pathname ?? "/";

    if (pathname !== "/" && pathname !== "/index.html") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    try {
      const allCards = store.list();
      const allProjects = projects.list(true); // include archived so linked cards still show project name

      const selectedProjectId = typeof parsed.query.project === "string"
        ? parsed.query.project
        : "";

      const cards = selectedProjectId
        ? allCards.filter(c => c.project_id === selectedProjectId)
        : allCards;

      const html = renderPage(cards, allProjects, selectedProjectId, new Date());
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(html);
    } catch (err) {
      logger.error(`brain web: render error: ${err}`);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  });

  server.listen(port, "127.0.0.1", () => {
    logger.info(`brain web: listening at http://localhost:${port}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`brain web: port ${port} already in use — web view not started`);
    } else {
      logger.error(`brain web: server error: ${err.message}`);
    }
  });

  return server;
}

import * as http from "node:http";
import type { CardStore } from "../core/store.js";
import { renderPage } from "./template.js";

export function startWebServer(store: CardStore, port: number, logger: { info: (m: string) => void; error: (m: string) => void }): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method !== "GET") {
      res.writeHead(405, { "Content-Type": "text/plain" });
      res.end("Method Not Allowed");
      return;
    }

    const url = req.url ?? "/";
    if (url !== "/" && url !== "/index.html") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    try {
      const cards = store.list();
      const html = renderPage(cards, new Date());
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

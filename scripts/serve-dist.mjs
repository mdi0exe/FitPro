// Minimal static file server used for headless screenshot verification.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = path.join(root, url === "/" ? "index.html" : url);
    if (!file.startsWith(root)) file = path.join(root, "index.html");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, "index.html");
    const body = fs.readFileSync(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  })
  .listen(4400, "127.0.0.1", () => console.log("static server on http://127.0.0.1:4400"));

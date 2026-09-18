#!/usr/bin/env node
import http from "http";

const AUTH = { host: "127.0.0.1", port: 9999 };
const REST = { host: "127.0.0.1", port: 54321 };
const PORT = 54320;

function proxy(req, res, target, stripPrefix) {
  const url = req.url.replace(stripPrefix, "") || "/";
  const headers = { ...req.headers, host: `${target.host}:${target.port}` };
  const p = http.request(
    { ...target, path: url, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  p.on("error", (err) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  });
  req.pipe(p);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith("/auth/v1")) return proxy(req, res, AUTH, "/auth/v1");
    if (req.url.startsWith("/rest/v1")) return proxy(req, res, REST, "/rest/v1");
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(404);
    res.end("not found");
  })
  .listen(PORT, "0.0.0.0", () => console.log(`gateway on :${PORT}`));

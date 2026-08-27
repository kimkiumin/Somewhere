#!/usr/bin/env node

import http from "node:http";
import https from "node:https";

const HOST = "127.0.0.1";
const PROXY_PORT = 8788;
const UPSTREAM_PORT = 8787;
const UPSTREAM_PROTOCOL = process.env.SOMEWHERE_UPSTREAM_PROTOCOL === "http" ? "http" : "https";
const UPSTREAM_ORIGIN = `${UPSTREAM_PROTOCOL}://${HOST}:${UPSTREAM_PORT}`;
const LOG_REQUESTS = process.env.SOMEWHERE_PROXY_LOG === "1";

function rewriteRequestHeaders(headers) {
  const rewritten = { ...headers, host: `${HOST}:${UPSTREAM_PORT}`, origin: UPSTREAM_ORIGIN };
  if (rewritten.cookie) {
    rewritten.cookie = rewritten.cookie.replaceAll("somewhere_session=", "__Host-somewhere_session=");
  }
  return rewritten;
}

function rewriteResponseHeaders(headers) {
  const rewritten = { ...headers };
  const cookies = rewritten["set-cookie"];
  if (cookies !== undefined) {
    const values = Array.isArray(cookies) ? cookies : [cookies];
    rewritten["set-cookie"] = values.map((value) =>
      value
        .replaceAll("__Host-somewhere_session=", "somewhere_session=")
        .replace(/;\s*Secure/gi, ""),
    );
  }
  return rewritten;
}

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const requestModule = UPSTREAM_PROTOCOL === "https" ? https : http;
    const upstream = requestModule.request(
      {
        hostname: HOST,
        port: UPSTREAM_PORT,
        method: request.method,
        path: request.url,
        headers: rewriteRequestHeaders(request.headers),
        ...(UPSTREAM_PROTOCOL === "https" ? { rejectUnauthorized: false } : {}),
      },
      (upstreamResponse) => {
        if (LOG_REQUESTS) {
          console.log(`[proxy] ${request.method} ${request.url} -> ${upstreamResponse.statusCode}`);
        }
        response.writeHead(
          upstreamResponse.statusCode ?? 502,
          rewriteResponseHeaders(upstreamResponse.headers),
        );
        upstreamResponse.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end("loopback proxy error");
    });
    upstream.end(Buffer.concat(chunks));
  });
});

server.listen(PROXY_PORT, HOST, () => {
  console.log(`Somewhere iOS loopback proxy: ${UPSTREAM_ORIGIN} -> http://${HOST}:${PROXY_PORT}`);
  console.log("This proxy is loopback-only and rewrites the development session cookie; never use it for a field or production origin.");
});

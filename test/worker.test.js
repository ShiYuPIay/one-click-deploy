import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

function request(path, options = {}) {
  return new Request(`https://example.test${path}`, options);
}

test("GET /health returns a healthy API response", async () => {
  const response = await worker.fetch(request("/health"), {}, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.service, "One-Click Deploy Platform API");
});

test("GET / serves the control panel instead of a blank response", async () => {
  const response = await worker.fetch(request("/"), {}, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.match(html, /id="app"/);
  assert.match(html, /Loading control panel/);
});

test("GET /api/search returns bounded template results", async () => {
  const response = await worker.fetch(request("/api/search?q=react&limit=3"), {}, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.query, "react");
  assert.ok(body.results.length <= 3);
  assert.ok(body.results.every((item) => /react/i.test(item.name) || /react/i.test(item.framework) || /react/i.test(item.desc)));
});

test("GET /api/templates exposes daily refresh and monthly catalog policies", async () => {
  const response = await worker.fetch(request("/api/templates"), {}, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.refreshPolicy, "daily");
  assert.equal(body.catalogPolicy, "monthly");
  assert.match(body.catalogCycle, /^\d{4}-\d{2}$/);
  assert.ok(Array.isArray(body.templates));
});

test("POST /api/test-connection rejects incomplete credentials", async () => {
  const response = await worker.fetch(
    request("/api/test-connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
    {},
    {},
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.ok, false);
});

test("GET /health reports version 2.2.0", async () => {
  const response = await worker.fetch(request("/health"), {}, {});
  const body = await response.json();
  assert.equal(body.version, "2.2.0");
});

test("POST /api/deploy rejects missing template fields", async () => {
  const response = await worker.fetch(
    request("/api/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cfToken: "tok", cfAccountId: "id",
        ghToken: "gh", ghUsername: "user",
        template: { name: "Test" }, // missing buildCmd and outputDir
      }),
    }),
    {},
    {},
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /buildCmd/);
});

test("POST /api/deploy rejects shell-injection characters in buildCmd", async () => {
  const response = await worker.fetch(
    request("/api/deploy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        cfToken: "tok", cfAccountId: "id",
        ghToken: "gh", ghUsername: "user",
        template: { buildCmd: "npm run build; rm -rf /", outputDir: "dist" },
      }),
    }),
    {},
    {},
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.error, /disallowed/);
});

test("GET /api/search with no query returns all static templates", async () => {
  const response = await worker.fetch(request("/api/search"), {}, {});
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(Array.isArray(body.results));
  assert.ok(body.total > 0);
});

test("GET /api/search returns 404 for unknown route", async () => {
  const response = await worker.fetch(request("/api/unknown-route"), {}, {});
  assert.equal(response.status, 404);
});

test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const response = await worker.fetch(
    request("/api/deploy", { method: "OPTIONS" }),
    {},
    {},
  );
  assert.equal(response.status, 204);
  assert.ok(response.headers.get("access-control-allow-origin"));
});

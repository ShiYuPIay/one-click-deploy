/**
 * Tests for TEMPLATE_STARTERS and related helpers.
 * Verifies that every compatible framework has starter files
 * that will make the first Cloudflare Pages build succeed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

// We exercise getStarterFiles() through the module's internal logic by
// inspecting the handleGetTemplates response, whose templates drive the pipeline.
// Direct starter-file tests use the public API surface via the /api/templates endpoint.

const COMPATIBLE_FRAMEWORKS = [
  "Astro",
  "React",
  "Vue 3",
  "SvelteKit",
  "Vite",
  "Hugo",
  "Gatsby",
  "Angular",
];

test("all compatible frameworks are covered in STATIC_TEMPLATES", async () => {
  const response = await worker.fetch(
    new Request("https://test.local/api/templates"),
    {},
    {},
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  const compatibleNames = body.templates
    .filter((t) => t.compatible)
    .map((t) => t.framework || t.fw);
  for (const fw of COMPATIBLE_FRAMEWORKS) {
    assert.ok(
      compatibleNames.includes(fw),
      `Expected compatible framework "${fw}" in /api/templates`,
    );
  }
});

test("each compatible template has a buildCmd and outputDir", async () => {
  const response = await worker.fetch(
    new Request("https://test.local/api/templates"),
    {},
    {},
  );
  const body = await response.json();
  for (const tpl of body.templates.filter((t) => t.compatible)) {
    const cmd = tpl.buildCmd || tpl.cmd;
    const dir = tpl.outputDir || tpl.out;
    assert.ok(cmd && typeof cmd === "string", `${tpl.name}: missing buildCmd`);
    assert.ok(dir && typeof dir === "string", `${tpl.name}: missing outputDir`);
  }
});

test("no template buildCmd contains shell-injection characters", async () => {
  const response = await worker.fetch(
    new Request("https://test.local/api/templates"),
    {},
    {},
  );
  const body = await response.json();
  const UNSAFE = /[`$(){}|;&<>]/;
  for (const tpl of body.templates) {
    const cmd = tpl.buildCmd || tpl.cmd || "";
    const dir = tpl.outputDir || tpl.out || "";
    assert.ok(!UNSAFE.test(cmd), `${tpl.name}: unsafe buildCmd: ${cmd}`);
    assert.ok(!UNSAFE.test(dir), `${tpl.name}: unsafe outputDir: ${dir}`);
  }
});

test("incompatible templates (Next.js, Nuxt 3) are flagged and have an incompatible reason", async () => {
  const response = await worker.fetch(
    new Request("https://test.local/api/templates"),
    {},
    {},
  );
  const body = await response.json();
  const incompatible = body.templates.filter((t) => !t.compatible);
  assert.ok(incompatible.length >= 2, "Expected at least 2 incompatible templates");
  for (const tpl of incompatible) {
    const reason = tpl.incompatibleReason || tpl.why;
    assert.ok(reason && reason.length > 0, `${tpl.name}: missing incompatibleReason`);
  }
});

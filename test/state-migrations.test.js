import test from "node:test";
import assert from "node:assert/strict";
import { createInitialDeployState, migrateDeployState, needsMigration } from "../migrations/state.js";

test("new deploy state uses the current schema", () => {
  const state = createInitialDeployState("deploy-123", "Astro");
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.status, "running");
  assert.equal(state.secretState, "pending");
  assert.equal(state.template, "Astro");
  assert.equal(state.logs.length, 1);
});

test("legacy state migrates from secretBurned to secretState", () => {
  const state = migrateDeployState({
    status: "complete",
    secretBurned: true,
    result: { password: "redacted" },
  });

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.secretState, "burned");
  assert.equal("secretBurned" in state, false);
});

test("legacy unburned state remains deliverable", () => {
  const state = migrateDeployState({
    status: "complete",
    result: { password: "temporary-secret" },
  });

  assert.equal(state.schemaVersion, 2);
  assert.equal(state.secretState, "pending");
});

test("current state does not require migration", () => {
  const state = { schemaVersion: 2, status: "running", secretState: "pending" };
  assert.equal(needsMigration(state), false);
  assert.deepEqual(migrateDeployState(state), state);
});

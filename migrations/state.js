/**
 * Deploy-state schema migrations.
 *
 * KV records are long-lived state, so readers must accept older records and
 * normalize them before business logic uses them.
 */

export const CURRENT_STATE_VERSION = 2;

export function createInitialDeployState(deployId, templateName) {
  return {
    schemaVersion: CURRENT_STATE_VERSION,
    status: "running",
    step: 0,
    logs: [
      {
        ts: new Date().toISOString().slice(11, 19),
        text: `[System] Deploy job started: ${deployId}`,
        type: "info",
      },
    ],
    startedAt: Date.now(),
    template: templateName,
    secretState: "pending",
  };
}

export function migrateDeployState(input) {
  const source = input && typeof input === "object" ? input : {};
  const version = Number(source.schemaVersion || 1);
  let state = { ...source };

  if (version < 2) {
    state = {
      ...state,
      schemaVersion: 2,
      secretState: state.secretBurned ? "burned" : "pending",
    };
    delete state.secretBurned;
  }

  if (!state.schemaVersion) state.schemaVersion = CURRENT_STATE_VERSION;
  if (!state.secretState) {
    state.secretState = state.secretBurned ? "burned" : "pending";
  }

  return state;
}

export function needsMigration(input) {
  return Number(input?.schemaVersion || 1) < CURRENT_STATE_VERSION;
}

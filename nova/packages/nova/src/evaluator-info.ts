// Mirror naive-evaluator's `evaluatorInfo` (packages/naive-evaluator/src/mod.ts).
// Naive reads `name`/`version` from its own package.json via `resolveJsonModule`
// (not enabled in this package's tsconfig), so the values are hardcoded here;
// keep them in sync with the package.json on version bumps.
const name = "@dicexp/nova";
const version = "0.1.0";

export const evaluatorInfo = {
  nameWithoutVersion: name,
  version,
  get nameWithVersion() {
    return `${evaluatorInfo.nameWithoutVersion}@${evaluatorInfo.version}`;
  },
};

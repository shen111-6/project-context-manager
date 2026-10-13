export type ResultAction =
  "refresh" | "handoff" | "copyRecovery" | "openArtifact" | "history";
const allowed = new Set<ResultAction>([
  "refresh",
  "handoff",
  "copyRecovery",
  "openArtifact",
  "history",
]);
export function parseResultAction(input: unknown): ResultAction | null {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).join(",") !== "action"
  )
    return null;
  const action = (input as { action: unknown }).action;
  return typeof action === "string" && allowed.has(action as ResultAction)
    ? (action as ResultAction)
    : null;
}

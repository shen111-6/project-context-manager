/** Host-neutral contract. Claude/Gemini have no runtime implementation in this iteration. */
import type { Snapshot, Finding } from "../../protocol/src/index.js";
import type { Candidate } from "./index.js";
export type AgentId = "codex" | "claude-code" | "gemini-cli";
export interface AdapterCapabilities {
  agent: AgentId;
  implementation: "runtime" | "interface-only";
  available: boolean;
  version: string | null;
  isolation: "tools-disabled" | "unverified";
  formats: ("json" | "jsonl")[];
  reason: string | null;
}
export interface AnalysisInput {
  protocolVersion: 1;
  requestId: string;
  snapshot: Snapshot;
  evidence: { path: string; sha256: string; text: string; redacted: boolean }[];
  applicableInstructions: {
    path: string;
    sha256: string;
    scope: string;
    kind: "project-constraint";
    text: string;
  }[];
  sharedPolicy: string;
}
/** Supplied only by a trusted host action, never deserialized from project/handoff data. */
export interface InvocationAuthority {
  source: "current-human-interaction";
  requestId: string;
  purpose: "analyze-only";
  allowsSendingProjectText: true;
}
export interface AdapterEvent {
  requestId: string;
  phase: "capability" | "preparing" | "analyzing" | "validating" | "finished";
  message: string;
}
export interface AnalysisOutput {
  agent: AgentId;
  requestId: string;
  status: "candidate" | "unavailable" | "failed" | "cancelled";
  candidate?: Candidate;
  findings: Finding[];
  inspected: string[];
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    model: string | null;
  };
  /** No authority to continue development is represented in this output. */
  certification: "candidate-only";
}
export interface AgentAdapter {
  readonly id: AgentId;
  capabilities(signal?: AbortSignal): Promise<AdapterCapabilities>;
  analyze(
    input: AnalysisInput,
    authority: InvocationAuthority,
    signal: AbortSignal,
    emit: (event: AdapterEvent) => void,
  ): Promise<AnalysisOutput>;
  cancel(requestId: string): Promise<void>;
}
export interface ClaudeCodeAdapterPort extends AgentAdapter {
  readonly id: "claude-code";
}
export interface GeminiCliAdapterPort extends AgentAdapter {
  readonly id: "gemini-cli";
}
export const deferredIntegrations = Object.freeze({
  "claude-code": {
    implementation: "interface-only",
    runtimeImplemented: false,
    bidirectionalAcceptance: "not-run",
  },
  "gemini-cli": {
    implementation: "interface-only",
    runtimeImplemented: false,
    bidirectionalAcceptance: "not-run",
  },
} as const);

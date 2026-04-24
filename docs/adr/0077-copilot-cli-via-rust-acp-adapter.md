---
type: ADR
id: "0077"
title: "Copilot CLI through a Rust ACP adapter"
status: active
date: 2026-04-24
---

## Context

Tolaria already supports multiple local CLI agents through one shared frontend contract and one Rust streaming boundary. Claude Code streams NDJSON directly from its CLI, while Codex uses JSONL from `codex exec --json`. Adding GitHub Copilot CLI as a third supported agent should preserve that shared architecture instead of introducing a separate Node or Python sidecar path.

Copilot CLI now exposes ACP server mode, and ACP has official SDKs for Rust, TypeScript, and Python. This decision needed to settle which SDK should own Tolaria's Copilot integration, how MCP should keep flowing into the session, and how to preserve ADR-0074's least-privilege requirement while Copilot ACP permission prompts do not yet have a dedicated Tolaria approval UI.

## Decision

**Tolaria integrates Copilot CLI through the Rust ACP SDK inside the existing Tauri backend.** The backend keeps owning agent detection, session startup, MCP injection, event normalization, and Tauri event emission, while Copilot-specific ACP handling lives in a dedicated Rust adapter module instead of a TypeScript or Python sidecar.

## Options considered

- **Option A** (chosen): Rust ACP adapter in the Tauri backend — aligns with Tolaria's current AI architecture, avoids a new runtime, keeps MCP wiring and stream normalization close to existing Claude/Codex code, and minimizes packaging complexity. The downside is owning a small ACP client adapter in Rust and handling current permission-request limitations conservatively.
- **Option B**: TypeScript ACP sidecar — would reuse an official SDK and fit the existing Node MCP toolchain, but it would add another long-lived bridge between Rust and Node for a problem Tolaria already solves in Rust.
- **Option C**: Python ACP sidecar — also has an official SDK, but it introduces a third runtime, additional packaging and auth surface, and a maintenance path that does not match Tolaria's existing desktop agent adapters.

## Consequences

- Positive: Copilot CLI becomes a first-class selectable agent without changing the shared frontend stream contract.
- Positive: Tolaria can inject its existing vault-scoped MCP server into Copilot ACP sessions using ACP-native `mcp_servers`, keeping the same vault tooling story as the other agents.
- Positive: The implementation stays consistent with the current Rust-owned availability checks, settings persistence, onboarding, and Tauri event streaming.
- Negative: Copilot ACP permission requests are currently answered with a least-privilege rejection until Tolaria grows an explicit approval UI, so some unattended tool flows may stop early instead of auto-approving.
- Negative: Tolaria now owns one more event-normalization adapter, including heuristics that map ACP tool-call kinds into the shared UI action model.
- Re-evaluate if Tolaria adds a dedicated permission-approval UI, if Copilot CLI changes its ACP startup contract, or if a future TypeScript ACP bridge becomes materially simpler than the Rust path.

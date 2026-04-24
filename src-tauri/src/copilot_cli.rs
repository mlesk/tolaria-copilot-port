use agent_client_protocol::schema::{
    ContentBlock, EnvVariable, InitializeRequest, McpServer, McpServerStdio, NewSessionRequest,
    PermissionOptionKind, PromptRequest, ProtocolVersion, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionNotification, SessionUpdate, StopReason, ToolCall, ToolCallContent, ToolCallStatus,
    ToolCallUpdate, ToolKind,
};
use agent_client_protocol::Client;
use agent_client_protocol_tokio::AcpAgent;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};

use crate::ai_agents::{AiAgentAvailability, AiAgentStreamEvent, AiAgentStreamRequest};

#[derive(Default)]
struct CopilotStreamState {
    saw_text: bool,
    rejected_permissions: usize,
    tools: HashMap<String, ToolCall>,
}

pub fn check_cli() -> AiAgentAvailability {
    let binary = match find_copilot_binary() {
        Ok(binary) => binary,
        Err(_) => {
            return AiAgentAvailability {
                installed: false,
                version: None,
            };
        }
    };

    AiAgentAvailability {
        installed: true,
        version: version_for_binary(&binary),
    }
}

pub fn run_agent_stream<F>(request: AiAgentStreamRequest, emit: F) -> Result<String, String>
where
    F: FnMut(AiAgentStreamEvent) + Send + 'static,
{
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("Failed to start Copilot ACP runtime: {error}"))?;

    runtime.block_on(run_agent_stream_async(request, emit))
}

async fn run_agent_stream_async<F>(request: AiAgentStreamRequest, emit: F) -> Result<String, String>
where
    F: FnMut(AiAgentStreamEvent) + Send + 'static,
{
    let binary = find_copilot_binary()?;
    let transport = build_copilot_transport(&binary);
    let emitter = Arc::new(Mutex::new(emit));
    let state = Arc::new(Mutex::new(CopilotStreamState::default()));
    let prompt = build_copilot_prompt(&request);
    let request_for_session = request.clone();

    Client
        .builder()
        .name("tolaria-copilot-cli")
        .on_receive_notification(
            {
                let emitter = emitter.clone();
                let state = state.clone();
                async move |notification: SessionNotification, _cx| {
                    handle_session_notification(&state, &emitter, notification);
                    Ok(())
                }
            },
            agent_client_protocol::on_receive_notification!(),
        )
        .on_receive_request(
            {
                let state = state.clone();
                async move |permission_request: RequestPermissionRequest, responder, _cx| {
                    let response = build_permission_response(&state, &permission_request);
                    responder.respond(response)
                }
            },
            agent_client_protocol::on_receive_request!(),
        )
        .connect_with(transport, async move |connection| {
            connection
                .send_request(InitializeRequest::new(ProtocolVersion::LATEST))
                .block_task()
                .await?;

            let session_request = build_session_request(&request_for_session)?;
            let session_response = connection
                .send_request(session_request)
                .block_task()
                .await?;
            let session_id = session_response.session_id.to_string();

            emit_event(
                &emitter,
                AiAgentStreamEvent::Init {
                    session_id: session_id.clone(),
                },
            );

            let prompt_response = connection
                .send_request(PromptRequest::new(
                    session_response.session_id,
                    vec![ContentBlock::from(prompt)],
                ))
                .block_task()
                .await?;

            maybe_emit_stop_reason_text(&state, &emitter, prompt_response.stop_reason);
            emit_event(&emitter, AiAgentStreamEvent::Done);

            Ok(session_id)
        })
        .await
        .map_err(|error| format_copilot_error(error.to_string()))
}

fn build_copilot_transport(binary: &Path) -> AcpAgent {
    AcpAgent::new(McpServer::Stdio(
        McpServerStdio::new("copilot", binary.to_path_buf()).args(vec!["--acp".into()]),
    ))
}

fn build_session_request(
    request: &AiAgentStreamRequest,
) -> Result<NewSessionRequest, agent_client_protocol::Error> {
    Ok(NewSessionRequest::new(PathBuf::from(&request.vault_path))
        .mcp_servers(vec![build_tolaria_mcp_server(&request.vault_path)?]))
}

fn build_tolaria_mcp_server(vault_path: &str) -> Result<McpServer, agent_client_protocol::Error> {
    let node = crate::mcp::find_node().map_err(agent_client_protocol::util::internal_error)?;
    let server_dir =
        crate::mcp::mcp_server_dir().map_err(agent_client_protocol::util::internal_error)?;
    let index_js = server_dir.join("index.js");

    Ok(McpServer::Stdio(
        McpServerStdio::new("tolaria", node)
            .args(vec![index_js.to_string_lossy().into_owned()])
            .env(vec![EnvVariable::new("VAULT_PATH", vault_path)]),
    ))
}

fn emit_event<F>(emitter: &Arc<Mutex<F>>, event: AiAgentStreamEvent)
where
    F: FnMut(AiAgentStreamEvent),
{
    if let Ok(mut emit) = emitter.lock() {
        emit(event);
    }
}

fn handle_session_notification<F>(
    state: &Arc<Mutex<CopilotStreamState>>,
    emitter: &Arc<Mutex<F>>,
    notification: SessionNotification,
) where
    F: FnMut(AiAgentStreamEvent),
{
    match notification.update {
        SessionUpdate::AgentMessageChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                if let Ok(mut guard) = state.lock() {
                    guard.saw_text = true;
                }
                emit_event(emitter, AiAgentStreamEvent::TextDelta { text: text.text });
            }
        }
        SessionUpdate::AgentThoughtChunk(chunk) => {
            if let ContentBlock::Text(text) = chunk.content {
                emit_event(
                    emitter,
                    AiAgentStreamEvent::ThinkingDelta { text: text.text },
                );
            }
        }
        SessionUpdate::ToolCall(tool_call) => handle_tool_call(state, emitter, tool_call),
        SessionUpdate::ToolCallUpdate(update) => handle_tool_call_update(state, emitter, update),
        _ => {}
    }
}

fn handle_tool_call<F>(
    state: &Arc<Mutex<CopilotStreamState>>,
    emitter: &Arc<Mutex<F>>,
    tool_call: ToolCall,
) where
    F: FnMut(AiAgentStreamEvent),
{
    let tool_id = tool_call.tool_call_id.to_string();
    let tool_name = normalize_tool_name(&tool_call);
    let input = json_value_to_string(tool_call.raw_input.as_ref());
    let status = tool_call.status;
    let output = tool_output_string(&tool_call);

    if let Ok(mut guard) = state.lock() {
        guard.tools.insert(tool_id.clone(), tool_call);
    }

    emit_event(
        emitter,
        AiAgentStreamEvent::ToolStart {
            tool_name,
            tool_id: tool_id.clone(),
            input,
        },
    );

    if matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed) {
        emit_event(emitter, AiAgentStreamEvent::ToolDone { tool_id, output });
    }
}

fn handle_tool_call_update<F>(
    state: &Arc<Mutex<CopilotStreamState>>,
    emitter: &Arc<Mutex<F>>,
    update: ToolCallUpdate,
) where
    F: FnMut(AiAgentStreamEvent),
{
    let tool_id = update.tool_call_id.to_string();
    let update_for_fallback = update.clone();
    let mut start_event = None;
    let mut done_event = None;

    if let Ok(mut guard) = state.lock() {
        if let Some(existing) = guard.tools.get_mut(&tool_id) {
            let previous_status = existing.status;
            existing.update(update.fields);
            if !matches!(
                previous_status,
                ToolCallStatus::Completed | ToolCallStatus::Failed
            ) && matches!(
                existing.status,
                ToolCallStatus::Completed | ToolCallStatus::Failed
            ) {
                done_event = Some(AiAgentStreamEvent::ToolDone {
                    tool_id: tool_id.clone(),
                    output: tool_output_string(existing),
                });
            }
        } else if let Ok(tool_call) = ToolCall::try_from(update_for_fallback) {
            let tool_name = normalize_tool_name(&tool_call);
            let input = json_value_to_string(tool_call.raw_input.as_ref());
            let status = tool_call.status;
            let output = tool_output_string(&tool_call);
            guard.tools.insert(tool_id.clone(), tool_call);
            start_event = Some(AiAgentStreamEvent::ToolStart {
                tool_name,
                tool_id: tool_id.clone(),
                input,
            });
            if matches!(status, ToolCallStatus::Completed | ToolCallStatus::Failed) {
                done_event = Some(AiAgentStreamEvent::ToolDone { tool_id, output });
            }
        }
    }

    if let Some(event) = start_event {
        emit_event(emitter, event);
    }
    if let Some(event) = done_event {
        emit_event(emitter, event);
    }
}

fn build_permission_response(
    state: &Arc<Mutex<CopilotStreamState>>,
    request: &RequestPermissionRequest,
) -> RequestPermissionResponse {
    if let Ok(mut guard) = state.lock() {
        guard.rejected_permissions += 1;
    }

    let outcome = request
        .options
        .iter()
        .find(|option| option.kind == PermissionOptionKind::RejectOnce)
        .or_else(|| {
            request
                .options
                .iter()
                .find(|option| option.kind == PermissionOptionKind::RejectAlways)
        })
        .map(|option| {
            RequestPermissionOutcome::Selected(SelectedPermissionOutcome::new(
                option.option_id.clone(),
            ))
        })
        .unwrap_or(RequestPermissionOutcome::Cancelled);

    RequestPermissionResponse::new(outcome)
}

fn maybe_emit_stop_reason_text<F>(
    state: &Arc<Mutex<CopilotStreamState>>,
    emitter: &Arc<Mutex<F>>,
    stop_reason: StopReason,
) where
    F: FnMut(AiAgentStreamEvent),
{
    let (saw_text, rejected_permissions) = if let Ok(guard) = state.lock() {
        (guard.saw_text, guard.rejected_permissions)
    } else {
        (false, 0)
    };

    let message = match stop_reason {
        StopReason::Cancelled if rejected_permissions > 0 && !saw_text => Some(
            "Copilot CLI requested ACP permission approval. Tolaria currently keeps Copilot ACP sessions least-privileged and rejects interactive permission prompts until a dedicated approval UI exists.".to_string(),
        ),
        StopReason::MaxTokens if !saw_text => {
            Some("Copilot CLI reached the maximum token budget for this turn.".to_string())
        }
        StopReason::MaxTurnRequests if !saw_text => Some(
            "Copilot CLI reached the maximum number of tool or agent requests for this turn."
                .to_string(),
        ),
        StopReason::Refusal if !saw_text => Some(
            "Copilot CLI refused to continue this turn. Adjust the request and try again."
                .to_string(),
        ),
        _ => None,
    };

    if let Some(text) = message {
        emit_event(emitter, AiAgentStreamEvent::TextDelta { text });
    }
}

fn normalize_tool_name(tool_call: &ToolCall) -> String {
    let title = tool_call.title.to_ascii_lowercase();

    match tool_call.kind {
        ToolKind::Execute => "Bash".into(),
        ToolKind::Read => "Read".into(),
        ToolKind::Search => "Grep".into(),
        ToolKind::Edit => {
            if title.contains("create") || title.contains("write") {
                "Write".into()
            } else {
                "Edit".into()
            }
        }
        ToolKind::Move | ToolKind::Delete => "Edit".into(),
        ToolKind::Fetch => "Fetch".into(),
        ToolKind::Think => "Think".into(),
        ToolKind::SwitchMode => "SwitchMode".into(),
        ToolKind::Other => {
            if title.contains("command") || title.contains("shell") || title.contains("terminal") {
                "Bash".into()
            } else if title.contains("write") || title.contains("create") {
                "Write".into()
            } else if title.contains("edit") || title.contains("update") {
                "Edit".into()
            } else if title.contains("read") {
                "Read".into()
            } else if title.contains("search") {
                "Grep".into()
            } else {
                tool_call.title.clone()
            }
        }
        _ => tool_call.title.clone(),
    }
}

fn tool_output_string(tool_call: &ToolCall) -> Option<String> {
    json_value_to_string(tool_call.raw_output.as_ref()).or_else(|| {
        let content = tool_call
            .content
            .iter()
            .filter_map(tool_call_content_string)
            .collect::<Vec<_>>()
            .join("\n");

        if content.trim().is_empty() {
            None
        } else {
            Some(content)
        }
    })
}

fn tool_call_content_string(content: &ToolCallContent) -> Option<String> {
    match content {
        ToolCallContent::Content(inner) => match &inner.content {
            ContentBlock::Text(text) => Some(text.text.clone()),
            other => serde_json::to_string(other).ok(),
        },
        ToolCallContent::Diff(diff) => serde_json::to_string(diff).ok(),
        ToolCallContent::Terminal(terminal) => Some(format!("terminal:{}", terminal.terminal_id)),
        _ => None,
    }
}

fn json_value_to_string(value: Option<&Value>) -> Option<String> {
    value.and_then(|value| serde_json::to_string(value).ok())
}

fn build_copilot_prompt(request: &AiAgentStreamRequest) -> String {
    match request
        .system_prompt
        .as_ref()
        .map(|prompt| prompt.trim())
        .filter(|prompt| !prompt.is_empty())
    {
        Some(system_prompt) => format!(
            "System instructions:\n{system_prompt}\n\nUser request:\n{}",
            request.message
        ),
        None => request.message.clone(),
    }
}

fn version_for_binary(binary: &PathBuf) -> Option<String> {
    Command::new(binary)
        .arg("--version")
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn find_copilot_binary() -> Result<PathBuf, String> {
    if let Some(binary) = find_binary_on_path("copilot")? {
        return Ok(binary);
    }

    if let Some(binary) = find_binary_in_user_shell("copilot") {
        return Ok(binary);
    }

    if let Some(binary) = find_existing_binary(copilot_binary_candidates()) {
        return Ok(binary);
    }

    Err("Copilot CLI not found. Install it: https://docs.github.com/copilot/concepts/agents/about-copilot-cli".into())
}

fn find_binary_on_path(command_name: &str) -> Result<Option<PathBuf>, String> {
    let output = Command::new("which")
        .arg(command_name)
        .output()
        .map_err(|error| format!("Failed to run `which {command_name}`: {error}"))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Ok(Some(PathBuf::from(path)));
        }
    }

    Ok(None)
}

fn find_binary_in_user_shell(command_name: &str) -> Option<PathBuf> {
    user_shell_candidates()
        .into_iter()
        .filter(|shell| shell.exists())
        .find_map(|shell| command_path_from_shell(&shell, command_name))
}

fn user_shell_candidates() -> Vec<PathBuf> {
    let mut shells = Vec::new();
    if let Some(shell) = std::env::var_os("SHELL") {
        if !shell.is_empty() {
            shells.push(PathBuf::from(shell));
        }
    }
    shells.push(PathBuf::from("/bin/zsh"));
    shells.push(PathBuf::from("/bin/bash"));
    shells
}

fn command_path_from_shell(shell: &Path, command: &str) -> Option<PathBuf> {
    Command::new(shell)
        .arg("-lc")
        .arg(format!("command -v {command}"))
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if path.is_empty() {
                    None
                } else {
                    let candidate = PathBuf::from(path);
                    candidate.exists().then_some(candidate)
                }
            } else {
                None
            }
        })
}

fn copilot_binary_candidates() -> Vec<PathBuf> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![
        home.join(".local/bin/copilot"),
        home.join(".npm-global/bin/copilot"),
        home.join(".npm/bin/copilot"),
        home.join(".volta/bin/copilot"),
        PathBuf::from("/usr/local/bin/copilot"),
        PathBuf::from("/opt/homebrew/bin/copilot"),
    ]
}

fn find_existing_binary(candidates: Vec<PathBuf>) -> Option<PathBuf> {
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn format_copilot_error(message: String) -> String {
    let lower = message.to_ascii_lowercase();
    if ["auth", "login", "sign in"]
        .iter()
        .any(|pattern| lower.contains(pattern))
    {
        "Copilot CLI is not authenticated. Run `copilot login` or launch `copilot` in your terminal."
            .into()
    } else {
        message
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use agent_client_protocol::schema::{
        Content, Diff, PermissionOption, PermissionOptionId, Terminal, TerminalId,
        ToolCallUpdateFields,
    };

    #[test]
    fn build_copilot_prompt_keeps_system_prompt_first() {
        let prompt = build_copilot_prompt(&AiAgentStreamRequest {
            agent: crate::ai_agents::AiAgentId::CopilotCli,
            message: "Summarize the note".into(),
            system_prompt: Some("Be concise".into()),
            vault_path: "/tmp/vault".into(),
        });

        assert!(prompt.starts_with("System instructions:\nBe concise"));
        assert!(prompt.contains("User request:\nSummarize the note"));
    }

    #[test]
    fn normalize_tool_name_maps_execute_to_bash() {
        let tool = ToolCall::new("tool_1", "Run shell command")
            .kind(ToolKind::Execute)
            .raw_input(Some(serde_json::json!({ "command": "pwd" })));

        assert_eq!(normalize_tool_name(&tool), "Bash");
    }

    #[test]
    fn handle_tool_call_update_emits_start_and_done_for_completed_update() {
        let state = Arc::new(Mutex::new(CopilotStreamState::default()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let emitter = Arc::new(Mutex::new({
            let events = events.clone();
            move |event| events.lock().unwrap().push(event)
        }));

        handle_tool_call_update(
            &state,
            &emitter,
            ToolCallUpdate::new(
                "tool_1",
                ToolCallUpdateFields::new()
                    .title(Some("Write note".into()))
                    .kind(Some(ToolKind::Edit))
                    .status(Some(ToolCallStatus::Completed))
                    .raw_input(Some(serde_json::json!({ "path": "/tmp/vault/note.md" })))
                    .raw_output(Some(serde_json::json!({ "ok": true }))),
            ),
        );

        let events = events.lock().unwrap().clone();
        assert!(matches!(
            &events[0],
            AiAgentStreamEvent::ToolStart { tool_name, tool_id, .. }
                if tool_name == "Write" && tool_id == "tool_1"
        ));
        assert!(matches!(
            &events[1],
            AiAgentStreamEvent::ToolDone { tool_id, output }
                if tool_id == "tool_1" && output.as_deref() == Some("{\"ok\":true}")
        ));
    }

    #[test]
    fn build_permission_response_prefers_reject_once() {
        let state = Arc::new(Mutex::new(CopilotStreamState::default()));
        let response = build_permission_response(
            &state,
            &RequestPermissionRequest::new(
                "session_1",
                ToolCallUpdate::new("tool_1", ToolCallUpdateFields::new()),
                vec![
                    PermissionOption::new(
                        PermissionOptionId::new("allow-once"),
                        "Allow once",
                        PermissionOptionKind::AllowOnce,
                    ),
                    PermissionOption::new(
                        PermissionOptionId::new("reject-once"),
                        "Reject once",
                        PermissionOptionKind::RejectOnce,
                    ),
                ],
            ),
        );

        assert!(matches!(
            response.outcome,
            RequestPermissionOutcome::Selected(ref selected)
                if selected.option_id.to_string() == "reject-once"
        ));
        assert_eq!(state.lock().unwrap().rejected_permissions, 1);
    }

    #[test]
    fn maybe_emit_stop_reason_text_explains_rejected_permissions() {
        let state = Arc::new(Mutex::new(CopilotStreamState {
            saw_text: false,
            rejected_permissions: 1,
            tools: HashMap::new(),
        }));
        let events = Arc::new(Mutex::new(Vec::new()));
        let emitter = Arc::new(Mutex::new({
            let events = events.clone();
            move |event| events.lock().unwrap().push(event)
        }));

        maybe_emit_stop_reason_text(&state, &emitter, StopReason::Cancelled);

        let events = events.lock().unwrap().clone();
        assert!(matches!(
            &events[0],
            AiAgentStreamEvent::TextDelta { text }
                if text.contains("rejects interactive permission prompts")
        ));
    }

    #[test]
    fn tool_output_string_falls_back_to_content_text() {
        let tool = ToolCall::new("tool_1", "Read file").content(vec![
            ToolCallContent::Content(Content::new(ContentBlock::from("hello"))),
            ToolCallContent::Diff(Diff::new("/tmp/vault/note.md", "updated")),
            ToolCallContent::Terminal(Terminal::new(TerminalId::new("term_1"))),
        ]);

        let output = tool_output_string(&tool).unwrap();
        assert!(output.contains("hello"));
        assert!(output.contains("/tmp/vault/note.md"));
        assert!(output.contains("terminal:term_1"));
    }
}

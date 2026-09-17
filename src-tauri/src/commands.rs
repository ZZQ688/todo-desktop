use std::sync::Mutex;

use serde::Serialize;

use crate::workspace::{self, Mutation, Workspace};

pub struct DatabaseState {
    pub connection: Mutex<Option<rusqlite::Connection>>,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
}

impl From<workspace::WorkspaceError> for CommandError {
    fn from(error: workspace::WorkspaceError) -> Self {
        let code = match &error {
            workspace::WorkspaceError::InvalidInput(_) => "invalid_input",
            workspace::WorkspaceError::MissingProject(_) => "missing_project",
            workspace::WorkspaceError::MissingTask(_) => "missing_task",
            workspace::WorkspaceError::MissingRule(_) => "missing_rule",
            workspace::WorkspaceError::StaleBatch => "stale_batch",
            workspace::WorkspaceError::Sqlite(_) => "database_error",
            workspace::WorkspaceError::Json(_) => "invalid_rule",
        };
        let detail = error.to_string();
        let message = match &error {
            workspace::WorkspaceError::Sqlite(_) => format!("本地数据操作失败：{detail}"),
            workspace::WorkspaceError::Json(_) => format!("重复规则数据无效：{detail}"),
            _ => detail,
        };
        Self {
            code: code.into(),
            message,
        }
    }
}

fn connection<'a>(
    state: &'a DatabaseState,
) -> Result<std::sync::MutexGuard<'a, Option<rusqlite::Connection>>, CommandError> {
    state.connection.lock().map_err(|_| CommandError {
        code: "database_unavailable".into(),
        message: "本地数据无法打开。".into(),
    })
}

#[tauri::command]
pub fn load_workspace(state: tauri::State<'_, DatabaseState>) -> Result<Workspace, CommandError> {
    let guard = connection(state.inner())?;
    let db = guard.as_ref().ok_or_else(|| CommandError {
        code: "database_unavailable".into(),
        message: "本地数据无法打开。".into(),
    })?;
    workspace::load_workspace(db).map_err(Into::into)
}

#[tauri::command]
pub fn mutate_workspace(
    state: tauri::State<'_, DatabaseState>,
    mutation: Mutation,
    today: String,
) -> Result<Workspace, CommandError> {
    let mut guard = connection(state.inner())?;
    let db = guard.as_mut().ok_or_else(|| CommandError {
        code: "database_unavailable".into(),
        message: "本地数据无法打开。".into(),
    })?;
    workspace::mutate_workspace(db, mutation, &today).map_err(Into::into)
}

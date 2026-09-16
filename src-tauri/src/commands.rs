use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;

use crate::storage::SCHEMA_VERSION;

pub struct DatabaseState {
    pub connection: Mutex<Option<Connection>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub schema_version: i64,
    pub database_ready: bool,
}

#[derive(Debug, Serialize)]
pub struct CommandError {
    pub code: &'static str,
    pub message: &'static str,
}

fn unavailable() -> CommandError {
    CommandError {
        code: "database_unavailable",
        message: "本地数据无法打开。已有文件已保留。",
    }
}

fn read_health(state: &DatabaseState) -> Result<HealthReport, CommandError> {
    let guard = state.connection.lock().map_err(|_| unavailable())?;
    let connection = guard.as_ref().ok_or_else(unavailable)?;
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|_| unavailable())?;
    if version != SCHEMA_VERSION {
        return Err(unavailable());
    }
    connection
        .query_row("SELECT id FROM settings WHERE id=1", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(|_| unavailable())?;
    Ok(HealthReport {
        schema_version: version,
        database_ready: true,
    })
}

#[tauri::command]
pub fn health_check(state: tauri::State<'_, DatabaseState>) -> Result<HealthReport, CommandError> {
    read_health(state.inner())
}

#[cfg(test)]
mod tests {
    use super::{read_health, DatabaseState};
    use crate::storage;
    use rusqlite::Connection;
    use std::sync::Mutex;

    #[test]
    fn reports_initialized_storage() {
        let mut connection = Connection::open_in_memory().unwrap();
        storage::initialize(&mut connection).unwrap();
        let state = DatabaseState { connection: Mutex::new(Some(connection)) };
        let report = read_health(&state).unwrap();
        assert_eq!(report.schema_version, 1);
        assert!(report.database_ready);
    }

    #[test]
    fn failed_startup_does_not_report_ready() {
        let state = DatabaseState { connection: Mutex::new(None) };
        let error = read_health(&state).unwrap_err();
        assert_eq!(error.code, "database_unavailable");
    }
}

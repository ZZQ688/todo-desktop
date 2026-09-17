use std::path::Path;

use rusqlite::Connection;
use thiserror::Error;

pub const SCHEMA_VERSION: i64 = 3;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("Unsupported database schema version: {0}")]
    UnsupportedVersion(i64),
    #[error(transparent)]
    Workspace(#[from] crate::workspace::WorkspaceError),
}

pub fn open_database(path: &Path) -> Result<Connection, StorageError> {
    let mut connection = Connection::open(path)?;
    initialize(&mut connection)?;
    Ok(connection)
}

pub fn initialize(connection: &mut Connection) -> Result<(), StorageError> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    let version: i64 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
    match version {
        0 => {
            let transaction = connection.transaction()?;
            transaction.execute_batch(include_str!("../migrations/001_initial.sql"))?;
            transaction.execute_batch(include_str!("../migrations/002_recurrence_cursor.sql"))?;
            transaction.execute_batch(include_str!("../migrations/003_redesign.sql"))?;
            crate::workspace::migrate_recurrence_rules(&transaction)?;
            transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            validate_schema(&transaction)?;
            transaction.commit()?;
        }
        1 => {
            let transaction = connection.transaction()?;
            transaction.execute_batch(include_str!("../migrations/002_recurrence_cursor.sql"))?;
            transaction.execute_batch(include_str!("../migrations/003_redesign.sql"))?;
            crate::workspace::migrate_recurrence_rules(&transaction)?;
            transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            validate_schema(&transaction)?;
            transaction.commit()?;
        }
        2 => {
            let transaction = connection.transaction()?;
            transaction.execute_batch(include_str!("../migrations/003_redesign.sql"))?;
            crate::workspace::migrate_recurrence_rules(&transaction)?;
            transaction.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            validate_schema(&transaction)?;
            transaction.commit()?;
        }
        SCHEMA_VERSION => {}
        other => return Err(StorageError::UnsupportedVersion(other)),
    }
    validate_schema(connection)?;
    Ok(())
}

fn validate_schema(connection: &Connection) -> Result<(), StorageError> {
    connection.prepare(
        "SELECT id,title,status,priority,repeat,created_on,recurrence_source_id,recurrence_generated_through FROM tasks LIMIT 0",
    )?;
    connection.prepare("SELECT source_task_id,occurrence_date,task_id FROM recurrence_occurrences LIMIT 0")?;
    connection.prepare("SELECT schema_version,locale,density FROM settings WHERE id=1")?;
    Ok(())
}

#[cfg(test)]
#[path = "storage/tests.rs"]
mod tests;

use std::path::Path;

use rusqlite::Connection;
use thiserror::Error;

pub const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Error)]
pub enum StorageError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("Unsupported database schema version: {0}")]
    UnsupportedVersion(i64),
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
    connection.prepare("SELECT id,title,status,priority FROM tasks LIMIT 0")?;
    connection.prepare("SELECT schema_version,locale,density FROM settings WHERE id=1")?;
    Ok(())
}

#[cfg(test)]
mod tests;

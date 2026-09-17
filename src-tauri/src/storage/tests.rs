use super::{initialize, open_database, StorageError, SCHEMA_VERSION};
use rusqlite::{params, Connection};

fn insert_task(conn: &Connection, id: &str, parent: Option<&str>) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO tasks(id,parent_id,title,status,priority,created_at,updated_at)
         VALUES (?1,?2,'Task','open','normal','2026-09-16T00:00:00Z','2026-09-16T00:00:00Z')",
        params![id, parent],
    )
}

#[test]
fn initializes_once_and_preserves_preferences_across_reopen() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("todo.sqlite");
    {
        let mut conn = open_database(&path).unwrap();
        conn.execute("UPDATE settings SET density='compact' WHERE id=1", [])
            .unwrap();
        initialize(&mut conn).unwrap();
    }
    let conn = open_database(&path).unwrap();
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    let foreign_keys: i64 = conn
        .pragma_query_value(None, "foreign_keys", |r| r.get(0))
        .unwrap();
    let density: String = conn
        .query_row("SELECT density FROM settings WHERE id=1", [], |r| r.get(0))
        .unwrap();
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(foreign_keys, 1);
    assert_eq!(density, "compact");
}

#[test]
fn failed_migration_rolls_back_and_preserves_existing_data() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch("CREATE TABLE tasks(id TEXT); INSERT INTO tasks VALUES ('preserve-me');")
        .unwrap();
    assert!(initialize(&mut conn).is_err());
    let existing: String = conn
        .query_row("SELECT id FROM tasks", [], |r| r.get(0))
        .unwrap();
    let projects: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='projects'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(existing, "preserve-me");
    assert_eq!(projects, 0);
    assert_eq!(version, 0);
}

#[test]
fn refuses_a_newer_schema_without_downgrading_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.pragma_update(None, "user_version", 2).unwrap();
    assert!(matches!(
        initialize(&mut conn),
        Err(StorageError::UnsupportedVersion(2))
    ));
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(version, 2);
}

#[test]
fn daily_references_require_a_task_and_cannot_duplicate_it() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    let sql = "INSERT INTO daily_entries(id,task_id,local_date) VALUES (?1,?2,'2026-09-16')";
    assert!(conn
        .execute(sql, params!["missing-entry", "missing-task"])
        .is_err());
    insert_task(&conn, "task-a", None).unwrap();
    conn.execute(sql, params!["entry-a", "task-a"]).unwrap();
    assert!(conn.execute(sql, params!["entry-b", "task-a"]).is_err());
    let count: i64 = conn
        .query_row("SELECT count(*) FROM daily_entries", [], |r| r.get(0))
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn prevents_deep_nesting_and_parent_cycles() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    insert_task(&conn, "parent", None).unwrap();
    insert_task(&conn, "child", Some("parent")).unwrap();
    assert!(insert_task(&conn, "grandchild", Some("child")).is_err());
    assert!(conn
        .execute("UPDATE tasks SET parent_id='child' WHERE id='parent'", [])
        .is_err());
    assert!(conn
        .execute("UPDATE tasks SET parent_id=id WHERE id='parent'", [])
        .is_err());
}

#[test]
fn one_rule_date_cannot_create_two_occurrences() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    insert_task(&conn, "occurrence-a", None).unwrap();
    insert_task(&conn, "occurrence-b", None).unwrap();
    conn.execute(
        "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone)
         VALUES ('rule-a',?1,'FREQ=DAILY','2026-09-16','Asia/Shanghai')",
        [r#"{"projectId":null,"title":"Task","priority":"normal","dueDate":null}"#],
    )
    .unwrap();
    let sql = "INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id)
               VALUES ('rule-a','2026-09-16',?1)";
    conn.execute(sql, ["occurrence-a"]).unwrap();
    assert!(conn.execute(sql, ["occurrence-b"]).is_err());
}

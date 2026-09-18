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
    let newer = SCHEMA_VERSION + 1;
    conn.pragma_update(None, "user_version", newer).unwrap();
    assert!(matches!(
        initialize(&mut conn),
        Err(StorageError::UnsupportedVersion(version)) if version == newer
    ));
    let version: i64 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .unwrap();
    assert_eq!(version, newer);
}

#[test]
fn migration_drops_scheduled_date_column_and_index() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../../migrations/001_initial.sql"))
        .unwrap();
    conn.execute_batch(include_str!("../../migrations/002_recurrence_cursor.sql"))
        .unwrap();
    conn.pragma_update(None, "user_version", 2).unwrap();
    insert_task(&conn, "task", None).unwrap();
    conn.execute(
        "UPDATE tasks SET scheduled_date='2026-09-16' WHERE id='task'",
        [],
    )
    .unwrap();

    initialize(&mut conn).unwrap();

    let scheduled_cols: i64 = conn
        .query_row(
            "SELECT count(*) FROM pragma_table_info('tasks') WHERE name='scheduled_date'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(scheduled_cols, 0);
    let index_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM pragma_index_list('tasks') WHERE name='tasks_scheduled_date'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(index_count, 0);
}

#[test]
fn migrates_version_one_rules_with_a_nullable_generation_cursor() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../../migrations/001_initial.sql"))
        .unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();
    conn.execute(
        "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone)
         VALUES ('rule',?1,'FREQ=DAILY','2026-09-16','Asia/Shanghai')",
        [r#"{"projectId":null,"title":"Task","priority":"normal","dueDate":null}"#],
    )
    .unwrap();
    insert_task(&conn, "scheduled", None).unwrap();
    conn.execute(
        "INSERT INTO daily_entries(id,task_id,local_date) VALUES ('entry','scheduled','2026-09-15')",
        [],
    )
    .unwrap();

    initialize(&mut conn).unwrap();

    let rgt: Option<String> = conn
        .query_row(
            "SELECT recurrence_generated_through FROM tasks WHERE id='series:rule'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(rgt, None);
    let created_on: String = conn
        .query_row(
            "SELECT created_on FROM tasks WHERE id='scheduled'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(created_on, "2026-09-16");
    let entry_count: i64 = conn
        .query_row("SELECT count(*) FROM daily_entries", [], |row| row.get(0))
        .unwrap();
    assert_eq!(entry_count, 1);
    assert_eq!(
        conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION
    );
}

#[test]
fn migrates_version_two_recurrence_rules_into_source_tasks() {
    let mut conn = Connection::open_in_memory().unwrap();
    conn.execute_batch(include_str!("../../migrations/001_initial.sql"))
        .unwrap();
    conn.execute_batch(include_str!("../../migrations/002_recurrence_cursor.sql"))
        .unwrap();
    conn.pragma_update(None, "user_version", 2).unwrap();
    conn.execute(
        "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone,generated_through)
         VALUES ('rule',?1,'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR','2026-09-16','Asia/Shanghai','2026-09-16')",
        [r#"{"projectId":null,"title":"Task","priority":"normal","dueDate":null}"#],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO tasks(id,title,status,priority,scheduled_date,created_at,updated_at)
         VALUES ('occurrence:rule:2026-09-16','Task','open','normal','2026-09-16','2026-09-16T00:00:00Z','2026-09-16T00:00:00Z')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id)
         VALUES ('rule','2026-09-16','occurrence:rule:2026-09-16')",
        [],
    )
    .unwrap();

    initialize(&mut conn).unwrap();

    let rules_table_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='recurrence_rules'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(rules_table_count, 0);

    let (repeat, created_on, rgt): (String, String, Option<String>) = conn
        .query_row(
            "SELECT repeat,created_on,recurrence_generated_through FROM tasks WHERE id='series:rule'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap();
    assert_eq!(repeat, r#"{"freq":"weekdays","interval":1}"#);
    assert_eq!(created_on, "2026-09-16");
    assert_eq!(rgt.as_deref(), Some("2026-09-16"));

    let rsi: Option<String> = conn
        .query_row(
            "SELECT recurrence_source_id FROM tasks WHERE id='occurrence:rule:2026-09-16'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(rsi.as_deref(), Some("series:rule"));

    let occ_count: i64 = conn
        .query_row(
            "SELECT count(*) FROM recurrence_occurrences WHERE source_task_id='series:rule' AND occurrence_date='2026-09-16'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(occ_count, 1);
    assert_eq!(
        conn.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))
            .unwrap(),
        SCHEMA_VERSION
    );
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
fn allows_deep_nesting() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    insert_task(&conn, "parent", None).unwrap();
    insert_task(&conn, "child", Some("parent")).unwrap();
    insert_task(&conn, "grandchild", Some("child")).unwrap();
    insert_task(&conn, "great-grandchild", Some("grandchild")).unwrap();
}

#[test]
fn one_source_date_cannot_create_two_occurrences() {
    let mut conn = Connection::open_in_memory().unwrap();
    initialize(&mut conn).unwrap();
    conn.execute(
        "INSERT INTO tasks(id,title,status,priority,created_on,created_at,updated_at)
         VALUES ('source','Task','open','normal','2026-09-16','2026-09-16T00:00:00Z','2026-09-16T00:00:00Z')",
        [],
    )
    .unwrap();
    insert_task(&conn, "occurrence-a", None).unwrap();
    insert_task(&conn, "occurrence-b", None).unwrap();
    let sql = "INSERT INTO recurrence_occurrences(source_task_id,occurrence_date,task_id)
               VALUES ('source','2026-09-16',?1)";
    conn.execute(sql, ["occurrence-a"]).unwrap();
    assert!(conn.execute(sql, ["occurrence-b"]).is_err());
}

use super::*;
use crate::storage;
use rusqlite::Connection;

fn memory_database() -> Connection {
    let mut connection = Connection::open_in_memory().unwrap();
    storage::initialize(&mut connection).unwrap();
    connection
}

fn task(
    id: &str,
    title: &str,
    project_id: Option<&str>,
    parent_id: Option<&str>,
    scheduled_date: Option<&str>,
) -> Mutation {
    Mutation::SaveTask {
        task: TaskDraft {
            id: id.into(),
            title: title.into(),
            project_id: project_id.map(str::to_owned),
            parent_id: parent_id.map(str::to_owned),
            priority: Priority::Normal,
            due_date: None,
            scheduled_date: scheduled_date.map(str::to_owned),
        },
    }
}

fn project(id: &str, name: &str) -> Mutation {
    Mutation::SaveProject {
        id: id.into(),
        name: name.into(),
    }
}

fn rule(id: &str, project_id: Option<&str>, title: &str) -> RecurrenceRule {
    RecurrenceRule {
        id: id.into(),
        template: TaskTemplate {
            project_id: project_id.map(str::to_owned),
            title: title.into(),
            priority: Priority::High,
            due_date: None,
        },
        rrule: "FREQ=DAILY".into(),
        start_date: "2026-09-01".into(),
        end_date: None,
        time_zone: "Asia/Shanghai".into(),
    }
}

#[test]
fn crud_persists_and_parent_project_changes_follow_to_child() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite");
    {
        let mut connection = storage::open_database(&path).unwrap();
        mutate_workspace(&mut connection, project("work", "Work"), "2026-09-17").unwrap();
        mutate_workspace(&mut connection, project("home", "Home"), "2026-09-17").unwrap();
        mutate_workspace(
            &mut connection,
            task("parent", "Parent", Some("work"), None, Some("2026-09-17")),
            "2026-09-17",
        )
        .unwrap();
        mutate_workspace(
            &mut connection,
            task(
                "child",
                "Child",
                Some("home"),
                Some("parent"),
                Some("2026-09-17"),
            ),
            "2026-09-17",
        )
        .unwrap();
        mutate_workspace(
            &mut connection,
            task(
                "parent",
                "Parent edited",
                Some("home"),
                None,
                Some("2026-09-17"),
            ),
            "2026-09-17",
        )
        .unwrap();
        mutate_workspace(
            &mut connection,
            Mutation::SetCompletion {
                id: "parent".into(),
                completed: true,
            },
            "2026-09-17",
        )
        .unwrap();
    }

    let connection = storage::open_database(&path).unwrap();
    let loaded = load_workspace(&connection).unwrap();
    let parent = loaded
        .tasks
        .iter()
        .find(|item| item.id == "parent")
        .unwrap();
    let child = loaded.tasks.iter().find(|item| item.id == "child").unwrap();
    assert_eq!(parent.title, "Parent edited");
    assert_eq!(parent.status, TaskStatus::Completed);
    assert_eq!(child.project_id.as_deref(), Some("home"));
    assert_eq!(child.status, TaskStatus::Open);
    assert_eq!(loaded.entries.len(), 2);
}

#[test]
fn project_delete_preserves_tasks_and_clears_rule_templates() {
    let mut connection = memory_database();
    mutate_workspace(&mut connection, project("work", "Work"), "2026-09-17").unwrap();
    mutate_workspace(
        &mut connection,
        task("task", "Task", Some("work"), None, None),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("rule", Some("work"), "Repeat"),
        },
        "2026-09-17",
    )
    .unwrap();

    let loaded = mutate_workspace(
        &mut connection,
        Mutation::DeleteProject { id: "work".into() },
        "2026-09-17",
    )
    .unwrap();
    assert!(loaded.projects.is_empty());
    assert_eq!(loaded.tasks[0].project_id, None);
    assert_eq!(loaded.rules[0].template.project_id, None);
}

#[test]
fn scheduling_keeps_history_and_null_only_removes_today_and_future() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, Some("2026-09-15")),
        "2026-09-15",
    )
    .unwrap();
    mutate_workspace(&mut connection, Mutation::Carryover, "2026-09-16").unwrap();
    mutate_workspace(
        &mut connection,
        task("task", "Edited", None, None, Some("2026-09-15")),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        task("task", "Deferred", None, None, Some("2026-09-20")),
        "2026-09-17",
    )
    .unwrap();
    let loaded = mutate_workspace(
        &mut connection,
        task("task", "Unscheduled", None, None, None),
        "2026-09-18",
    )
    .unwrap();

    let dates: Vec<_> = loaded
        .entries
        .iter()
        .map(|entry| entry.local_date.as_str())
        .collect();
    assert_eq!(dates, vec!["2026-09-15", "2026-09-16"]);
}

#[test]
fn carryover_handles_missed_days_deferral_and_completed_parent_with_open_child() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("old", "Old", None, None, Some("2026-09-10")),
        "2026-09-10",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        task("deferred", "Deferred", None, None, Some("2026-09-20")),
        "2026-09-10",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        task("parent", "Parent", None, None, Some("2026-09-11")),
        "2026-09-11",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        task("child", "Child", None, Some("parent"), Some("2026-09-11")),
        "2026-09-11",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            id: "parent".into(),
            completed: true,
        },
        "2026-09-12",
    )
    .unwrap();

    let loaded = mutate_workspace(&mut connection, Mutation::Carryover, "2026-09-17").unwrap();
    let today: Vec<_> = loaded
        .entries
        .iter()
        .filter(|entry| entry.local_date == "2026-09-17")
        .collect();
    assert_eq!(today.len(), 2);
    assert!(today
        .iter()
        .any(|entry| entry.task_id == "old"
            && entry.carried_from_date.as_deref() == Some("2026-09-10")));
    assert!(today.iter().any(|entry| entry.task_id == "child"
        && entry.carried_from_date.as_deref() == Some("2026-09-11")));
    assert!(!today
        .iter()
        .any(|entry| entry.task_id == "deferred" || entry.task_id == "parent"));
}

#[test]
fn a_new_unscheduled_child_inherits_the_parent_schedule() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("parent", "Parent", None, None, Some("2026-09-12")),
        "2026-09-12",
    )
    .unwrap();
    let loaded = mutate_workspace(
        &mut connection,
        task("child", "Child", None, Some("parent"), None),
        "2026-09-17",
    )
    .unwrap();
    assert!(loaded
        .entries
        .iter()
        .any(|entry| entry.task_id == "child" && entry.local_date == "2026-09-12"));

    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            id: "parent".into(),
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = mutate_workspace(&mut connection, Mutation::Carryover, "2026-09-18").unwrap();
    assert!(loaded
        .entries
        .iter()
        .any(|entry| entry.task_id == "child" && entry.local_date == "2026-09-18"));
}

#[test]
fn validation_and_failed_mutations_are_atomic() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("parent", "Parent", None, None, None),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        task("child", "Child", None, Some("parent"), None),
        "2026-09-17",
    )
    .unwrap();

    assert!(mutate_workspace(
        &mut connection,
        task("deep", "Deep", None, Some("child"), None),
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(
        &mut connection,
        task("bad-date", "Date", None, None, Some("2026-02-30")),
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(&mut connection, Mutation::Carryover, "0000-01-01").is_err());
    assert!(mutate_workspace(
        &mut connection,
        task("bad-parent", "Task", None, Some("missing"), None),
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(&mut connection, project("blank", "   "), "2026-09-17").is_err());
    assert_eq!(load_workspace(&connection).unwrap().tasks.len(), 2);
}

#[test]
fn clearing_a_schedule_prevents_later_carryover_without_deleting_history() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, Some("2026-09-15")),
        "2026-09-15",
    )
    .unwrap();
    let cleared = mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, None),
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(cleared.tasks[0].scheduled_date, None);
    assert!(cleared
        .entries
        .iter()
        .any(|entry| entry.local_date == "2026-09-15"));

    let carried = mutate_workspace(&mut connection, Mutation::Carryover, "2026-09-18").unwrap();
    assert_eq!(carried.tasks[0].scheduled_date, None);
    assert!(!carried
        .entries
        .iter()
        .any(|entry| entry.local_date == "2026-09-18"));
}

#[test]
fn materialization_uses_current_template_and_advances_empty_batches() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("daily", None, "Original"),
        },
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("daily", None, "Current"),
        },
        "2026-09-17",
    )
    .unwrap();

    let first = OccurrenceBatch {
        rule_id: "daily".into(),
        expected_through: None,
        through: "2026-09-18".into(),
        dates: vec!["2026-09-17".into(), "2026-09-18".into()],
    };
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::Materialize {
            batches: vec![first.clone()],
        },
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(loaded.tasks.len(), 2);
    assert!(loaded
        .tasks
        .iter()
        .all(|item| item.title == "Current" && item.priority == Priority::High));
    assert_eq!(
        loaded
            .entries
            .iter()
            .filter(|entry| entry.local_date.as_str() >= "2026-09-17")
            .count(),
        2
    );
    assert_eq!(
        loaded.rules[0].generated_through.as_deref(),
        Some("2026-09-18")
    );
    assert!(mutate_workspace(
        &mut connection,
        Mutation::Materialize {
            batches: vec![first]
        },
        "2026-09-17"
    )
    .is_err());

    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("daily", None, "Updated after generation"),
        },
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(
        load_workspace(&connection).unwrap().rules[0]
            .generated_through
            .as_deref(),
        Some("2026-09-18")
    );

    let empty = OccurrenceBatch {
        rule_id: "daily".into(),
        expected_through: Some("2026-09-18".into()),
        through: "2026-09-20".into(),
        dates: vec![],
    };
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::Materialize {
            batches: vec![empty],
        },
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(
        loaded.rules[0].generated_through.as_deref(),
        Some("2026-09-20")
    );
}

#[test]
fn recurrence_failures_roll_back_every_batch_and_deleted_occurrences_stay_deleted() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("first", None, "First"),
        },
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("second", None, "Second"),
        },
        "2026-09-17",
    )
    .unwrap();
    let invalid = Mutation::Materialize {
        batches: vec![
            OccurrenceBatch {
                rule_id: "first".into(),
                expected_through: None,
                through: "2026-09-17".into(),
                dates: vec!["2026-09-17".into()],
            },
            OccurrenceBatch {
                rule_id: "second".into(),
                expected_through: Some("2026-09-16".into()),
                through: "2026-09-17".into(),
                dates: vec!["2026-09-17".into()],
            },
        ],
    };
    assert!(mutate_workspace(&mut connection, invalid, "2026-09-17").is_err());
    assert!(load_workspace(&connection).unwrap().tasks.is_empty());

    let valid = OccurrenceBatch {
        rule_id: "first".into(),
        expected_through: None,
        through: "2026-09-17".into(),
        dates: vec!["2026-09-17".into()],
    };
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::Materialize {
            batches: vec![valid],
        },
        "2026-09-17",
    )
    .unwrap();
    let generated_id = loaded.tasks[0].id.clone();
    mutate_workspace(
        &mut connection,
        Mutation::DeleteTask { id: generated_id },
        "2026-09-17",
    )
    .unwrap();
    let stale_range = OccurrenceBatch {
        rule_id: "first".into(),
        expected_through: Some("2026-09-17".into()),
        through: "2026-09-18".into(),
        dates: vec!["2026-09-17".into(), "2026-09-18".into()],
    };
    assert!(mutate_workspace(
        &mut connection,
        Mutation::Materialize {
            batches: vec![stale_range]
        },
        "2026-09-17"
    )
    .is_err());
    assert!(load_workspace(&connection).unwrap().tasks.is_empty());
}

#[test]
fn deleting_a_rule_leaves_materialized_tasks() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        Mutation::SaveRule {
            rule: rule("daily", None, "Repeat"),
        },
        "2026-09-17",
    )
    .unwrap();
    let batch = OccurrenceBatch {
        rule_id: "daily".into(),
        expected_through: None,
        through: "2026-09-17".into(),
        dates: vec!["2026-09-17".into()],
    };
    mutate_workspace(
        &mut connection,
        Mutation::Materialize {
            batches: vec![batch],
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::DeleteRule { id: "daily".into() },
        "2026-09-17",
    )
    .unwrap();
    assert!(loaded.rules.is_empty());
    assert_eq!(loaded.tasks.len(), 1);
}

#[test]
fn settings_keep_the_public_schema_version() {
    let mut connection = memory_database();
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::SaveSettings {
            density: Density::Compact,
        },
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(loaded.settings.schema_version, 1);
    assert_eq!(loaded.settings.density, Density::Compact);
}

#[test]
fn serde_contract_matches_the_typescript_ipc_shape() {
    let mutation: Mutation = serde_json::from_value(serde_json::json!({
        "kind": "saveTask",
        "task": {
            "id": "task",
            "title": "Task",
            "projectId": null,
            "parentId": null,
            "priority": "normal",
            "dueDate": null,
            "scheduledDate": "2026-09-17"
        }
    }))
    .unwrap();
    assert!(matches!(mutation, Mutation::SaveTask { .. }));

    let mut connection = memory_database();
    let workspace = mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, Some("2026-09-17")),
        "2026-09-17",
    )
    .unwrap();
    let json = serde_json::to_value(workspace).unwrap();
    assert_eq!(json["tasks"][0]["scheduledDate"], "2026-09-17");
    assert_eq!(json["settings"]["schemaVersion"], 1);
}

#[test]
fn sql_failure_does_not_commit_a_partial_save() {
    let mut connection = memory_database();
    connection.execute_batch("CREATE TRIGGER reject_entry BEFORE INSERT ON daily_entries BEGIN SELECT RAISE(ABORT, 'forced failure'); END;").unwrap();
    let error = mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, Some("2026-09-17")),
        "2026-09-17",
    )
    .unwrap_err();
    assert!(error.to_string().contains("forced failure"));
    let count: i64 = connection
        .query_row("SELECT count(*) FROM tasks", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn recurrence_occurrence_rows_remain_unique() {
    let connection = memory_database();
    connection.execute(
        "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone,generated_through) VALUES ('rule',?1,'FREQ=DAILY','2026-09-01','UTC',NULL)",
        [r#"{"projectId":null,"title":"Task","priority":"normal","dueDate":null}"#],
    ).unwrap();
    for id in ["one", "two"] {
        connection.execute("INSERT INTO tasks(id,title,status,priority,created_at,updated_at) VALUES (?1,'Task','open','normal','2026-09-17T00:00:00Z','2026-09-17T00:00:00Z')", [id]).unwrap();
    }
    connection.execute("INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id) VALUES ('rule','2026-09-17','one')", []).unwrap();
    assert!(connection.execute("INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id) VALUES ('rule','2026-09-17','two')", []).is_err());
}

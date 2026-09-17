use super::*;
use crate::storage;
use rusqlite::Connection;

fn memory_database() -> Connection {
    let mut connection = Connection::open_in_memory().unwrap();
    storage::initialize(&mut connection).unwrap();
    connection
}

fn project(id: &str, name: &str) -> Mutation {
    Mutation::SaveProject {
        id: id.into(),
        name: name.into(),
    }
}

fn repeat(freq: &str, interval: i64) -> RepeatRule {
    RepeatRule {
        freq: freq.into(),
        interval,
    }
}

fn task(
    id: &str,
    title: &str,
    project_id: Option<&str>,
    parent_id: Option<&str>,
    repeat: Option<RepeatRule>,
    schedule_today: bool,
) -> Mutation {
    Mutation::SaveTask {
        task: TaskDraft {
            id: id.into(),
            title: title.into(),
            project_id: project_id.map(str::to_owned),
            parent_id: parent_id.map(str::to_owned),
            priority: Priority::Normal,
            due_date: None,
            repeat,
        },
        subtasks: vec![],
        schedule_today,
    }
}

fn task_with_subtasks(
    id: &str,
    title: &str,
    subtasks: &[&str],
    schedule_today: bool,
) -> Mutation {
    Mutation::SaveTask {
        task: TaskDraft {
            id: id.into(),
            title: title.into(),
            project_id: None,
            parent_id: None,
            priority: Priority::Normal,
            due_date: None,
            repeat: None,
        },
        subtasks: subtasks
            .iter()
            .map(|sub| SubtaskDraft {
                id: sub.to_string(),
                title: sub.to_string(),
            })
            .collect(),
        schedule_today,
    }
}

fn task_status(workspace: &Workspace, id: &str) -> TaskStatus {
    workspace
        .tasks
        .iter()
        .find(|t| t.id == id)
        .unwrap()
        .status
        .clone()
}

fn materialize_batch(source: &str, expected: Option<&str>, through: &str, dates: &[&str]) -> Mutation {
    Mutation::Materialize {
        batches: vec![OccurrenceBatch {
            source_task_id: source.into(),
            expected_through: expected.map(str::to_owned),
            through: through.into(),
            dates: dates.iter().map(|d| d.to_string()).collect(),
        }],
    }
}

#[test]
fn crud_persists_and_subtasks_follow_parent_group() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("workspace.sqlite");
    {
        let mut connection = storage::open_database(&path).unwrap();
        mutate_workspace(&mut connection, project("work", "Work"), "2026-09-17").unwrap();
        mutate_workspace(&mut connection, project("home", "Home"), "2026-09-17").unwrap();
        mutate_workspace(
            &mut connection,
            Mutation::SaveTask {
                task: TaskDraft {
                    id: "parent".into(),
                    title: "Parent".into(),
                    project_id: Some("work".into()),
                    parent_id: None,
                    priority: Priority::Normal,
                    due_date: None,
                    repeat: None,
                },
                subtasks: vec![SubtaskDraft {
                    id: "child".into(),
                    title: "Child".into(),
                }],
                schedule_today: true,
            },
            "2026-09-17",
        )
        .unwrap();
        mutate_workspace(
            &mut connection,
            Mutation::SaveTask {
                task: TaskDraft {
                    id: "parent".into(),
                    title: "Parent edited".into(),
                    project_id: Some("home".into()),
                    parent_id: None,
                    priority: Priority::Normal,
                    due_date: None,
                    repeat: None,
                },
                subtasks: vec![
                    SubtaskDraft {
                        id: "child".into(),
                        title: "Child".into(),
                    },
                    SubtaskDraft {
                        id: "child2".into(),
                        title: "Child 2".into(),
                    },
                ],
                schedule_today: true,
            },
            "2026-09-17",
        )
        .unwrap();
        mutate_workspace(
            &mut connection,
            Mutation::SetCompletion {
                ids: vec!["parent".into()],
                completed: true,
            },
            "2026-09-17",
        )
        .unwrap();
    }

    let connection = storage::open_database(&path).unwrap();
    let loaded = load_workspace(&connection).unwrap();
    let parent = loaded.tasks.iter().find(|t| t.id == "parent").unwrap();
    let child = loaded.tasks.iter().find(|t| t.id == "child").unwrap();
    let child2 = loaded.tasks.iter().find(|t| t.id == "child2").unwrap();
    assert_eq!(parent.title, "Parent edited");
    assert_eq!(parent.status, TaskStatus::Completed);
    assert_eq!(child.project_id.as_deref(), Some("home"));
    assert_eq!(child.status, TaskStatus::Completed);
    assert_eq!(child2.project_id.as_deref(), Some("home"));
    assert_eq!(loaded.entries.len(), 3);
}

#[test]
fn adding_a_child_in_the_today_context_lands_it_in_today() {
    let mut connection = memory_database();
    let today = "2026-09-18";
    mutate_workspace(&mut connection, task("parent", "Parent", None, None, None, true), today)
        .unwrap();
    mutate_workspace(
        &mut connection,
        task("child", "Child", None, Some("parent"), None, true),
        today,
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    let child_entries: Vec<_> = loaded
        .entries
        .iter()
        .filter(|e| e.task_id == "child")
        .collect();
    assert_eq!(child_entries.len(), 1);
    assert_eq!(child_entries[0].local_date, today);
}

#[test]
fn save_task_reconciles_subtasks_replacing_removed_ones() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["a", "b"], true),
        "2026-09-17",
    )
    .unwrap();
    let ids: Vec<String> = load_workspace(&connection)
        .unwrap()
        .tasks
        .iter()
        .map(|t| t.id.clone())
        .collect();
    assert!(ids.contains(&"parent".into()));
    assert!(ids.contains(&"a".into()));
    assert!(ids.contains(&"b".into()));

    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["a", "c"], true),
        "2026-09-17",
    )
    .unwrap();
    let ids: Vec<String> = load_workspace(&connection)
        .unwrap()
        .tasks
        .iter()
        .map(|t| t.id.clone())
        .collect();
    assert!(ids.contains(&"parent".into()));
    assert!(ids.contains(&"a".into()));
    assert!(!ids.contains(&"b".into()));
    assert!(ids.contains(&"c".into()));
}

#[test]
fn project_delete_preserves_tasks_and_clears_their_group() {
    let mut connection = memory_database();
    mutate_workspace(&mut connection, project("work", "Work"), "2026-09-17").unwrap();
    mutate_workspace(
        &mut connection,
        task("task", "Task", Some("work"), None, None, true),
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
    assert_eq!(loaded.tasks.len(), 1);
}

#[test]
fn completing_parent_completes_all_children() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["a", "b"], true),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["parent".into()],
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    assert_eq!(task_status(&loaded, "parent"), TaskStatus::Completed);
    assert_eq!(task_status(&loaded, "a"), TaskStatus::Completed);
    assert_eq!(task_status(&loaded, "b"), TaskStatus::Completed);
}

#[test]
fn completing_last_child_completes_parent() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["a", "b"], true),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["a".into()],
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    assert_eq!(task_status(&loaded, "a"), TaskStatus::Completed);
    assert_eq!(task_status(&loaded, "parent"), TaskStatus::Open);

    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["b".into()],
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    assert_eq!(task_status(&loaded, "parent"), TaskStatus::Completed);
}

#[test]
fn uncompleting_parent_opens_all_children() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["a", "b"], true),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["parent".into()],
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["parent".into()],
            completed: false,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    assert_eq!(task_status(&loaded, "parent"), TaskStatus::Open);
    assert_eq!(task_status(&loaded, "a"), TaskStatus::Open);
    assert_eq!(task_status(&loaded, "b"), TaskStatus::Open);
}

#[test]
fn uncompleting_any_child_opens_parent() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["a", "b"], true),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["parent".into()],
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["a".into()],
            completed: false,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    assert_eq!(task_status(&loaded, "a"), TaskStatus::Open);
    assert_eq!(task_status(&loaded, "parent"), TaskStatus::Open);
    assert_eq!(task_status(&loaded, "b"), TaskStatus::Completed);
}

#[test]
fn completing_an_instance_does_not_touch_its_source_or_real_children() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["child"], true),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        materialize_batch("series", None, "2026-09-17", &["2026-09-17"]),
        "2026-09-17",
    )
    .unwrap();

    mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["occurrence:series:2026-09-17".into()],
            completed: true,
        },
        "2026-09-17",
    )
    .unwrap();
    let loaded = load_workspace(&connection).unwrap();
    assert_eq!(task_status(&loaded, "series"), TaskStatus::Open);
    assert_eq!(task_status(&loaded, "parent"), TaskStatus::Open);
    assert_eq!(task_status(&loaded, "child"), TaskStatus::Open);
}

#[test]
fn add_to_today_is_idempotent() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, None, false),
        "2026-09-17",
    )
    .unwrap();
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::AddToToday {
            ids: vec!["task".into()],
        },
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(loaded.entries.len(), 1);
    let loaded = mutate_workspace(
        &mut connection,
        Mutation::AddToToday {
            ids: vec!["task".into()],
        },
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(loaded.entries.len(), 1);
}

#[test]
fn move_to_group_moves_root_and_children_and_validates_project() {
    let mut connection = memory_database();
    mutate_workspace(&mut connection, project("a", "A"), "2026-09-17").unwrap();
    mutate_workspace(&mut connection, project("b", "B"), "2026-09-17").unwrap();
    mutate_workspace(
        &mut connection,
        Mutation::SaveTask {
            task: TaskDraft {
                id: "parent".into(),
                title: "Parent".into(),
                project_id: Some("a".into()),
                parent_id: None,
                priority: Priority::Normal,
                due_date: None,
                repeat: None,
            },
            subtasks: vec![SubtaskDraft {
                id: "child".into(),
                title: "Child".into(),
            }],
            schedule_today: true,
        },
        "2026-09-17",
    )
    .unwrap();

    let loaded = mutate_workspace(
        &mut connection,
        Mutation::MoveToGroup {
            ids: vec!["parent".into()],
            project_id: Some("b".into()),
        },
        "2026-09-17",
    )
    .unwrap();
    let parent = loaded.tasks.iter().find(|t| t.id == "parent").unwrap();
    let child = loaded.tasks.iter().find(|t| t.id == "child").unwrap();
    assert_eq!(parent.project_id.as_deref(), Some("b"));
    assert_eq!(child.project_id.as_deref(), Some("b"));

    assert!(mutate_workspace(
        &mut connection,
        Mutation::MoveToGroup {
            ids: vec!["parent".into()],
            project_id: Some("missing".into()),
        },
        "2026-09-17"
    )
    .is_err());
}

#[test]
fn materialize_advances_cursor_and_rejects_stale_batches() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    let loaded = mutate_workspace(
        &mut connection,
        materialize_batch("series", None, "2026-09-18", &["2026-09-17", "2026-09-18"]),
        "2026-09-17",
    )
    .unwrap();
    assert_eq!(loaded.tasks.len(), 3);
    let source = loaded.tasks.iter().find(|t| t.id == "series").unwrap();
    assert_eq!(
        source.recurrence_generated_through.as_deref(),
        Some("2026-09-18")
    );
    assert!(loaded
        .tasks
        .iter()
        .all(|t| t.recurrence_source_id.as_deref() == Some("series")
            || t.id == "series"));

    // Replaying the same batch with a stale cursor is rejected.
    assert!(mutate_workspace(
        &mut connection,
        materialize_batch("series", None, "2026-09-18", &["2026-09-17"]),
        "2026-09-17"
    )
    .is_err());

    // An empty batch still advances the cursor.
    let loaded = mutate_workspace(
        &mut connection,
        materialize_batch("series", Some("2026-09-18"), "2026-09-20", &[]),
        "2026-09-17",
    )
    .unwrap();
    let source = loaded.tasks.iter().find(|t| t.id == "series").unwrap();
    assert_eq!(
        source.recurrence_generated_through.as_deref(),
        Some("2026-09-20")
    );
}

#[test]
fn materialize_supplements_across_days() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        materialize_batch("series", None, "2026-09-17", &["2026-09-17"]),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        materialize_batch("series", Some("2026-09-17"), "2026-09-18", &["2026-09-18"]),
        "2026-09-17",
    )
    .unwrap();
    let loaded = mutate_workspace(
        &mut connection,
        materialize_batch("series", Some("2026-09-18"), "2026-09-19", &["2026-09-19"]),
        "2026-09-17",
    )
    .unwrap();
    for date in ["2026-09-17", "2026-09-18", "2026-09-19"] {
        assert!(loaded
            .tasks
            .iter()
            .any(|t| t.id == format!("occurrence:series:{date}")));
    }
    assert_eq!(loaded.tasks.len(), 4);
}

#[test]
fn batch_mutations_reject_unknown_ids_atomically() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, None, true),
        "2026-09-17",
    )
    .unwrap();

    assert!(mutate_workspace(
        &mut connection,
        Mutation::SetCompletion {
            ids: vec!["task".into(), "missing".into()],
            completed: true,
        },
        "2026-09-17"
    )
    .is_err());
    assert_eq!(task_status(&load_workspace(&connection).unwrap(), "task"), TaskStatus::Open);

    assert!(mutate_workspace(
        &mut connection,
        Mutation::DeleteTasks {
            ids: vec!["missing".into()],
        },
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(
        &mut connection,
        Mutation::AddToToday {
            ids: vec!["missing".into()],
        },
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(
        &mut connection,
        Mutation::MoveToGroup {
            ids: vec!["missing".into()],
            project_id: None,
        },
        "2026-09-17"
    )
    .is_err());
    assert_eq!(load_workspace(&connection).unwrap().tasks.len(), 1);
}

#[test]
fn materialize_skips_tombstoned_dates() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    // A tombstone: an occurrence row whose task was already deleted.
    connection
        .execute(
            "INSERT INTO recurrence_occurrences(source_task_id,occurrence_date,task_id) VALUES ('series','2026-09-17',NULL)",
            [],
        )
        .unwrap();

    let loaded = mutate_workspace(
        &mut connection,
        materialize_batch(
            "series",
            None,
            "2026-09-18",
            &["2026-09-17", "2026-09-18"],
        ),
        "2026-09-17",
    )
    .unwrap();
    let has_17 = loaded
        .tasks
        .iter()
        .any(|t| t.id == "occurrence:series:2026-09-17");
    let has_18 = loaded
        .tasks
        .iter()
        .any(|t| t.id == "occurrence:series:2026-09-18");
    assert!(!has_17);
    assert!(has_18);
}

#[test]
fn deleting_an_instance_leaves_a_tombstone_and_stays_deleted() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        materialize_batch(
            "series",
            None,
            "2026-09-18",
            &["2026-09-17", "2026-09-18"],
        ),
        "2026-09-17",
    )
    .unwrap();

    mutate_workspace(
        &mut connection,
        Mutation::DeleteTasks {
            ids: vec!["occurrence:series:2026-09-17".into()],
        },
        "2026-09-17",
    )
    .unwrap();

    let task_id: Option<String> = connection
        .query_row(
            "SELECT task_id FROM recurrence_occurrences WHERE source_task_id='series' AND occurrence_date='2026-09-17'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(task_id, None);

    let loaded = load_workspace(&connection).unwrap();
    assert!(loaded
        .tasks
        .iter()
        .any(|t| t.id == "occurrence:series:2026-09-18"));
    assert!(!loaded
        .tasks
        .iter()
        .any(|t| t.id == "occurrence:series:2026-09-17"));

    // A later materialize does not bring the deleted instance back.
    let loaded = mutate_workspace(
        &mut connection,
        materialize_batch("series", Some("2026-09-18"), "2026-09-19", &["2026-09-19"]),
        "2026-09-17",
    )
    .unwrap();
    assert!(!loaded
        .tasks
        .iter()
        .any(|t| t.id == "occurrence:series:2026-09-17"));
    assert!(loaded
        .tasks
        .iter()
        .any(|t| t.id == "occurrence:series:2026-09-19"));
}

#[test]
fn deleting_a_source_task_deletes_its_instances() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    mutate_workspace(
        &mut connection,
        materialize_batch(
            "series",
            None,
            "2026-09-18",
            &["2026-09-17", "2026-09-18"],
        ),
        "2026-09-17",
    )
    .unwrap();

    let loaded = mutate_workspace(
        &mut connection,
        Mutation::DeleteTasks {
            ids: vec!["series".into()],
        },
        "2026-09-17",
    )
    .unwrap();
    assert!(loaded.tasks.is_empty());
    let occ_count: i64 = connection
        .query_row("SELECT count(*) FROM recurrence_occurrences", [], |r| r.get(0))
        .unwrap();
    assert_eq!(occ_count, 0);
}

#[test]
fn carryover_moves_open_tasks_forward_without_changing_created_on() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, None, true),
        "2026-09-15",
    )
    .unwrap();
    let loaded = mutate_workspace(&mut connection, Mutation::Carryover, "2026-09-17").unwrap();
    let task = loaded.tasks.iter().find(|t| t.id == "task").unwrap();
    assert_eq!(task.created_on, "2026-09-15");
    assert!(loaded
        .entries
        .iter()
        .any(|e| e.task_id == "task"
            && e.local_date == "2026-09-17"
            && e.carried_from_date.as_deref() == Some("2026-09-15")));
}

#[test]
fn carryover_skips_recurring_source_tasks() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task("series", "Series", None, None, Some(repeat("daily", 1)), false),
        "2026-09-17",
    )
    .unwrap();
    // A recurring source that still carries a past daily entry (legacy layout).
    connection
        .execute(
            "INSERT INTO daily_entries(id,task_id,local_date) VALUES ('entry:series:2026-09-15','series','2026-09-15')",
            [],
        )
        .unwrap();

    let loaded = mutate_workspace(&mut connection, Mutation::Carryover, "2026-09-17").unwrap();
    assert!(!loaded
        .entries
        .iter()
        .any(|e| e.task_id == "series" && e.local_date == "2026-09-17"));
    assert_eq!(
        loaded.entries.iter().filter(|e| e.task_id == "series").count(),
        1
    );
}

#[test]
fn repeat_from_rrule_maps_legacy_strings() {
    assert_eq!(
        super::repeat_from_rrule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR").unwrap(),
        RepeatRule {
            freq: "weekdays".into(),
            interval: 1
        }
    );
    assert_eq!(
        super::repeat_from_rrule("FREQ=DAILY;INTERVAL=3").unwrap(),
        RepeatRule {
            freq: "daily".into(),
            interval: 3
        }
    );
    assert_eq!(
        super::repeat_from_rrule("FREQ=DAILY").unwrap(),
        RepeatRule {
            freq: "daily".into(),
            interval: 1
        }
    );
    assert_eq!(
        super::repeat_from_rrule("FREQ=WEEKLY;INTERVAL=2").unwrap(),
        RepeatRule {
            freq: "weekly".into(),
            interval: 2
        }
    );
    assert_eq!(
        super::repeat_from_rrule("freq=monthly;interval=4").unwrap(),
        RepeatRule {
            freq: "monthly".into(),
            interval: 4
        }
    );
    assert!(super::repeat_from_rrule("FREQ=YEARLY").is_err());
}

#[test]
fn load_workspace_returns_source_tasks_after_migration() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.sqlite");
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../../migrations/001_initial.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../../migrations/002_recurrence_cursor.sql"))
            .unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
        conn.execute(
            "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone,generated_through) VALUES ('rule',?1,'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR','2026-09-01','UTC','2026-09-03')",
            [r#"{"projectId":null,"title":"Series","priority":"normal","dueDate":null}"#],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks(id,title,status,priority,scheduled_date,created_at,updated_at) VALUES ('occurrence:rule:2026-09-03','Series','open','normal','2026-09-03','2026-09-03T00:00:00Z','2026-09-03T00:00:00Z')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id) VALUES ('rule','2026-09-03','occurrence:rule:2026-09-03')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO daily_entries(id,task_id,local_date) VALUES ('entry:occurrence:rule:2026-09-03:2026-09-03','occurrence:rule:2026-09-03','2026-09-03')",
            [],
        )
        .unwrap();
    }

    let connection = storage::open_database(&path).unwrap();
    let loaded = load_workspace(&connection).unwrap();
    let source = loaded.tasks.iter().find(|t| t.id == "series:rule").unwrap();
    assert_eq!(source.repeat.as_ref().unwrap().freq, "weekdays");
    assert_eq!(source.repeat.as_ref().unwrap().interval, 1);
    assert_eq!(source.recurrence_source_id, None);
    assert_eq!(
        source.recurrence_generated_through.as_deref(),
        Some("2026-09-03")
    );
    let instance = loaded
        .tasks
        .iter()
        .find(|t| t.id == "occurrence:rule:2026-09-03")
        .unwrap();
    assert_eq!(instance.recurrence_source_id.as_deref(), Some("series:rule"));
    assert_eq!(loaded.entries.len(), 1);
}

#[test]
fn migration_disarms_finished_legacy_series_but_keeps_active_ones() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("legacy.sqlite");
    {
        let conn = Connection::open(&path).unwrap();
        conn.execute_batch(include_str!("../../migrations/001_initial.sql"))
            .unwrap();
        conn.execute_batch(include_str!("../../migrations/002_recurrence_cursor.sql"))
            .unwrap();
        conn.pragma_update(None, "user_version", 2).unwrap();
        // A finished series: end_date is already behind generated_through.
        conn.execute(
            "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,end_date,time_zone,generated_through) VALUES ('done',?1,'FREQ=DAILY','2026-09-01','2026-09-05','UTC','2026-09-10')",
            [r#"{"projectId":null,"title":"Finished","priority":"normal","dueDate":null}"#],
        )
        .unwrap();
        // An active series: no end_date.
        conn.execute(
            "INSERT INTO recurrence_rules(id,template_json,rrule,start_date,time_zone,generated_through) VALUES ('active',?1,'FREQ=DAILY','2026-09-01','UTC','2026-09-10')",
            [r#"{"projectId":null,"title":"Active","priority":"normal","dueDate":null}"#],
        )
        .unwrap();
    }

    let connection = storage::open_database(&path).unwrap();
    let loaded = load_workspace(&connection).unwrap();
    let finished = loaded.tasks.iter().find(|t| t.id == "series:done").unwrap();
    assert_eq!(finished.repeat, None);
    let active = loaded.tasks.iter().find(|t| t.id == "series:active").unwrap();
    assert_eq!(active.repeat.as_ref().unwrap().freq, "daily");
    assert_eq!(active.repeat.as_ref().unwrap().interval, 1);
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
            "repeat": null
        },
        "subtasks": [],
        "scheduleToday": true
    }))
    .unwrap();
    assert!(matches!(mutation, Mutation::SaveTask { .. }));

    let mut connection = memory_database();
    let workspace = mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, None, true),
        "2026-09-17",
    )
    .unwrap();
    let json = serde_json::to_value(workspace).unwrap();
    assert_eq!(json["tasks"][0]["createdOn"], "2026-09-17");
    assert_eq!(json["tasks"][0]["repeat"], serde_json::Value::Null);
    assert_eq!(
        json["tasks"][0]["recurrenceSourceId"],
        serde_json::Value::Null
    );
    assert_eq!(
        json["tasks"][0]["recurrenceGeneratedThrough"],
        serde_json::Value::Null
    );
    assert!(json["tasks"][0].get("scheduledDate").is_none());
    assert!(json.get("rules").is_none());
    assert_eq!(json["settings"]["schemaVersion"], 1);
}

#[test]
fn validation_and_failed_mutations_are_atomic() {
    let mut connection = memory_database();
    mutate_workspace(
        &mut connection,
        task_with_subtasks("parent", "Parent", &["child"], true),
        "2026-09-17",
    )
    .unwrap();

    // Deep nesting is rejected: child already has a parent.
    assert!(mutate_workspace(
        &mut connection,
        task("deep", "Deep", None, Some("child"), None, true),
        "2026-09-17"
    )
    .is_err());
    // A task cannot be its own parent.
    assert!(mutate_workspace(
        &mut connection,
        task("parent", "Parent", None, Some("parent"), None, true),
        "2026-09-17"
    )
    .is_err());
    // A subtask cannot carry subtasks of its own.
    assert!(mutate_workspace(
        &mut connection,
        Mutation::SaveTask {
            task: TaskDraft {
                id: "child".into(),
                title: "Child".into(),
                project_id: None,
                parent_id: Some("parent".into()),
                priority: Priority::Normal,
                due_date: None,
                repeat: None,
            },
            subtasks: vec![SubtaskDraft {
                id: "grand".into(),
                title: "Grand".into(),
            }],
            schedule_today: true,
        },
        "2026-09-17"
    )
    .is_err());
    // Bad date and bad project are rejected.
    assert!(mutate_workspace(
        &mut connection,
        Mutation::SaveTask {
            task: TaskDraft {
                id: "bad-date".into(),
                title: "Date".into(),
                project_id: None,
                parent_id: None,
                priority: Priority::Normal,
                due_date: Some("2026-02-30".into()),
                repeat: None,
            },
            subtasks: vec![],
            schedule_today: true,
        },
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(&mut connection, Mutation::Carryover, "0000-01-01").is_err());
    assert!(mutate_workspace(&mut connection, project("blank", "   "), "2026-09-17").is_err());
    // Bad repeat interval is rejected.
    assert!(mutate_workspace(
        &mut connection,
        task("bad-repeat", "Repeat", None, None, Some(repeat("daily", 0)), false),
        "2026-09-17"
    )
    .is_err());
    assert!(mutate_workspace(
        &mut connection,
        task("bad-freq", "Repeat", None, None, Some(repeat("yearly", 1)), false),
        "2026-09-17"
    )
    .is_err());

    assert_eq!(load_workspace(&connection).unwrap().tasks.len(), 2);
}

#[test]
fn sql_failure_does_not_commit_a_partial_save() {
    let mut connection = memory_database();
    connection
        .execute_batch(
            "CREATE TRIGGER reject_entry BEFORE INSERT ON daily_entries BEGIN SELECT RAISE(ABORT, 'forced failure'); END;",
        )
        .unwrap();
    let error = mutate_workspace(
        &mut connection,
        task("task", "Task", None, None, None, true),
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
fn recurrence_occurrence_rows_remain_unique_per_source_and_date() {
    let connection = memory_database();
    connection
        .execute(
            "INSERT INTO tasks(id,title,status,priority,created_on,created_at,updated_at) VALUES ('series','Task','open','normal','2026-09-17','2026-09-17T00:00:00Z','2026-09-17T00:00:00Z')",
            [],
        )
        .unwrap();
    for id in ["one", "two"] {
        connection
            .execute(
                "INSERT INTO tasks(id,title,status,priority,created_on,created_at,updated_at) VALUES (?1,'Task','open','normal','2026-09-17','2026-09-17T00:00:00Z','2026-09-17T00:00:00Z')",
                [id],
            )
            .unwrap();
    }
    connection
        .execute(
            "INSERT INTO recurrence_occurrences(source_task_id,occurrence_date,task_id) VALUES ('series','2026-09-17','one')",
            [],
        )
        .unwrap();
    assert!(connection
        .execute(
            "INSERT INTO recurrence_occurrences(source_task_id,occurrence_date,task_id) VALUES ('series','2026-09-17','two')",
            [],
        )
        .is_err());
}

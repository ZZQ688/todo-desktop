use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("输入无效: {0}")]
    InvalidInput(String),
    #[error("项目不存在: {0}")]
    MissingProject(String),
    #[error("任务不存在: {0}")]
    MissingTask(String),
    #[error("重复的生成游标批次")]
    StaleBatch,
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepeatRule {
    pub freq: String,
    pub interval: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub status: TaskStatus,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub repeat: Option<RepeatRule>,
    pub created_on: String,
    pub recurrence_source_id: Option<String>,
    pub recurrence_generated_through: Option<String>,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Open,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Normal,
    High,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DailyEntry {
    pub id: String,
    pub task_id: String,
    pub local_date: String,
    pub carried_from_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskTemplate {
    pub project_id: Option<String>,
    pub title: String,
    pub priority: Priority,
    pub due_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub schema_version: i64,
    pub locale: String,
    pub density: Density,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Density {
    Comfortable,
    Compact,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub tasks: Vec<Task>,
    pub projects: Vec<Project>,
    pub entries: Vec<DailyEntry>,
    pub settings: Settings,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TaskDraft {
    pub id: String,
    pub title: String,
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub repeat: Option<RepeatRule>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubtaskDraft {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceBatch {
    pub source_task_id: String,
    pub expected_through: Option<String>,
    pub through: String,
    pub dates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Mutation {
    SaveTask {
        task: TaskDraft,
        subtasks: Vec<SubtaskDraft>,
        schedule_today: bool,
    },
    SetCompletion {
        ids: Vec<String>,
        completed: bool,
    },
    DeleteTasks {
        ids: Vec<String>,
    },
    AddToToday {
        ids: Vec<String>,
    },
    MoveToGroup {
        ids: Vec<String>,
        project_id: Option<String>,
    },
    SaveProject {
        id: String,
        name: String,
    },
    DeleteProject {
        id: String,
    },
    SaveSettings {
        density: Density,
    },
    Materialize {
        batches: Vec<OccurrenceBatch>,
    },
    Carryover,
}

pub fn load_workspace(connection: &Connection) -> Result<Workspace, WorkspaceError> {
    let mut projects = Vec::new();
    let mut stmt = connection
        .prepare("SELECT id,name,created_at,updated_at FROM projects ORDER BY created_at,id")?;
    for row in stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })? {
        projects.push(row?);
    }

    let mut tasks = Vec::new();
    let mut stmt = connection.prepare(
        "SELECT id,project_id,parent_id,title,status,priority,due_date,repeat,created_on,recurrence_source_id,recurrence_generated_through,completed_at,created_at,updated_at FROM tasks ORDER BY created_at,id",
    )?;
    for row in stmt.query_map([], |row| {
        let repeat: Option<RepeatRule> = match row.get::<_, Option<String>>(7)? {
            Some(json) => Some(serde_json::from_str(&json).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    7,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?),
            None => None,
        };
        Ok(Task {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_id: row.get(2)?,
            title: row.get(3)?,
            status: parse_status(&row.get::<_, String>(4)?),
            priority: parse_priority(&row.get::<_, String>(5)?),
            due_date: row.get(6)?,
            repeat,
            created_on: row.get(8)?,
            recurrence_source_id: row.get(9)?,
            recurrence_generated_through: row.get(10)?,
            completed_at: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    })? {
        tasks.push(row?);
    }

    let mut entries = Vec::new();
    let mut stmt = connection.prepare(
        "SELECT id,task_id,local_date,carried_from_date FROM daily_entries ORDER BY local_date,id",
    )?;
    for row in stmt.query_map([], |row| {
        Ok(DailyEntry {
            id: row.get(0)?,
            task_id: row.get(1)?,
            local_date: row.get(2)?,
            carried_from_date: row.get(3)?,
        })
    })? {
        entries.push(row?);
    }

    let settings = connection.query_row(
        "SELECT schema_version,locale,density FROM settings WHERE id=1",
        [],
        |row| {
            Ok(Settings {
                schema_version: row.get(0)?,
                locale: row.get(1)?,
                density: parse_density(&row.get::<_, String>(2)?),
            })
        },
    )?;
    Ok(Workspace {
        tasks,
        projects,
        entries,
        settings,
    })
}

pub fn mutate_workspace(
    connection: &mut Connection,
    mutation: Mutation,
    today: &str,
) -> Result<Workspace, WorkspaceError> {
    validate_date(connection, today)?;
    let transaction = connection.transaction()?;
    apply_mutation(&transaction, mutation, today)?;
    let workspace = load_workspace(&transaction)?;
    transaction.commit()?;
    Ok(workspace)
}

fn apply_mutation(
    tx: &Transaction<'_>,
    mutation: Mutation,
    today: &str,
) -> Result<(), WorkspaceError> {
    match mutation {
        Mutation::SaveTask {
            task,
            subtasks,
            schedule_today,
        } => save_task(tx, task, subtasks, schedule_today, today),
        Mutation::SetCompletion { ids, completed } => set_completion(tx, ids, completed),
        Mutation::DeleteTasks { ids } => delete_tasks(tx, ids),
        Mutation::AddToToday { ids } => add_to_today(tx, ids, today),
        Mutation::MoveToGroup { ids, project_id } => move_to_group(tx, ids, project_id),
        Mutation::SaveProject { id, name } => save_project(tx, &id, &name),
        Mutation::DeleteProject { id } => {
            if tx.execute("DELETE FROM projects WHERE id=?1", [&id])? == 0 {
                return Err(WorkspaceError::MissingProject(id));
            }
            Ok(())
        }
        Mutation::SaveSettings { density } => {
            tx.execute(
                "UPDATE settings SET density=?1 WHERE id=1",
                [density_string(&density)],
            )?;
            Ok(())
        }
        Mutation::Materialize { batches } => materialize(tx, batches),
        Mutation::Carryover => carryover(tx, today),
    }
}

fn save_task(
    tx: &Transaction<'_>,
    draft: TaskDraft,
    subtasks: Vec<SubtaskDraft>,
    schedule_today: bool,
    today: &str,
) -> Result<(), WorkspaceError> {
    validate_id(&draft.id, "任务 ID")?;
    validate_title(&draft.title)?;
    validate_date_opt(tx, draft.due_date.as_deref())?;
    let repeat = match &draft.repeat {
        Some(rule) => {
            validate_repeat(rule)?;
            Some(normalize_repeat(rule))
        }
        None => None,
    };

    let parent_project = if let Some(parent_id) = &draft.parent_id {
        if parent_id == &draft.id {
            return Err(WorkspaceError::InvalidInput(
                "任务不能成为自己的父任务".into(),
            ));
        }
        if !subtasks.is_empty() {
            return Err(WorkspaceError::InvalidInput(
                "子任务不能再有子任务".into(),
            ));
        }
        let parent: Option<(Option<String>, Option<String>)> = tx
            .query_row(
                "SELECT parent_id,project_id FROM tasks WHERE id=?1",
                [parent_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        let Some((parent_parent, parent_project)) = parent else {
            return Err(WorkspaceError::MissingTask(parent_id.clone()));
        };
        if parent_parent.is_some() {
            return Err(WorkspaceError::InvalidInput("只支持一层子任务".into()));
        }
        Some(parent_project)
    } else {
        None
    };

    let effective_project = if let Some(parent_project) = parent_project {
        parent_project
    } else if let Some(project) = &draft.project_id {
        if tx
            .query_row("SELECT 1 FROM projects WHERE id=?1", [project], |_| Ok(()))
            .optional()?
            .is_none()
        {
            return Err(WorkspaceError::MissingProject(project.clone()));
        }
        Some(project.clone())
    } else {
        None
    };

    // `created_on`, `recurrence_source_id` and `recurrence_generated_through` are
    // intentionally absent from the DO UPDATE set, so editing an existing task
    // preserves its original created_on and its recurrence identity/ cursor.
    let repeat_json = repeat.as_ref().map(serde_json::to_string).transpose()?;
    let timestamp = now(tx)?;
    tx.execute(
        "INSERT INTO tasks(id,project_id,parent_id,title,status,priority,due_date,repeat,created_on,recurrence_source_id,recurrence_generated_through,created_at,updated_at) VALUES (?1,?2,?3,?4,'open',?5,?6,?7,?8,NULL,NULL,?9,?9) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,parent_id=excluded.parent_id,title=excluded.title,priority=excluded.priority,due_date=excluded.due_date,repeat=excluded.repeat,updated_at=excluded.updated_at",
        params![
            draft.id,
            effective_project,
            draft.parent_id,
            draft.title.trim(),
            priority_string(&draft.priority),
            draft.due_date,
            repeat_json,
            today,
            timestamp
        ],
    )?;

    if draft.parent_id.is_none() {
        let parent_priority = priority_string(&draft.priority);
        let mut keep: Vec<String> = Vec::new();
        for sub in &subtasks {
            validate_id(&sub.id, "子任务 ID")?;
            validate_title(&sub.title)?;
            if sub.id == draft.id {
                return Err(WorkspaceError::InvalidInput(
                    "子任务不能与父任务相同".into(),
                ));
            }
            let sub_timestamp = now(tx)?;
            tx.execute(
                "INSERT INTO tasks(id,project_id,parent_id,title,status,priority,due_date,repeat,created_on,recurrence_source_id,recurrence_generated_through,created_at,updated_at) VALUES (?1,?2,?3,?4,'open',?5,NULL,NULL,?6,NULL,NULL,?7,?7) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,parent_id=excluded.parent_id,title=excluded.title,priority=excluded.priority,updated_at=excluded.updated_at",
                params![sub.id, effective_project, draft.id, sub.title.trim(), parent_priority, today, sub_timestamp],
            )?;
            keep.push(sub.id.clone());
        }
        delete_children_except(tx, &draft.id, &keep)?;
    }

    if schedule_today && repeat.is_none() {
        insert_entry(tx, &draft.id, today, None)?;
        for sub in &subtasks {
            insert_entry(tx, &sub.id, today, None)?;
        }
    }
    Ok(())
}

fn delete_children_except(
    tx: &Transaction<'_>,
    parent_id: &str,
    keep: &[String],
) -> Result<(), WorkspaceError> {
    if keep.is_empty() {
        tx.execute("DELETE FROM tasks WHERE parent_id=?1", [parent_id])?;
    } else {
        let placeholders = vec!["?"; keep.len()].join(",");
        let sql = format!("DELETE FROM tasks WHERE parent_id=?1 AND id NOT IN ({placeholders})");
        let mut args: Vec<String> = vec![parent_id.to_string()];
        args.extend(keep.iter().cloned());
        tx.execute(&sql, rusqlite::params_from_iter(args.iter().map(|s| s.as_str())))?;
    }
    Ok(())
}

fn set_completion(
    tx: &Transaction<'_>,
    ids: Vec<String>,
    completed: bool,
) -> Result<(), WorkspaceError> {
    if ids.is_empty() {
        return Ok(());
    }
    let status = if completed { "completed" } else { "open" };
    let timestamp = now(tx)?;
    for id in &ids {
        if tx
            .query_row("SELECT 1 FROM tasks WHERE id=?1", [id], |_| Ok(()))
            .optional()?
            .is_none()
        {
            return Err(WorkspaceError::MissingTask(id.clone()));
        }
        tx.execute(
            "UPDATE tasks SET status=?2,completed_at=?3,updated_at=?4 WHERE id=?1",
            params![
                id,
                status,
                if completed {
                    Some(timestamp.clone())
                } else {
                    None::<String>
                },
                timestamp
            ],
        )?;
        tx.execute(
            "UPDATE tasks SET status=?2,completed_at=?3,updated_at=?4 WHERE parent_id=?1",
            params![
                id,
                status,
                if completed {
                    Some(timestamp.clone())
                } else {
                    None::<String>
                },
                timestamp
            ],
        )?;
    }

    if completed {
        tx.execute(
            "UPDATE tasks SET status='completed',completed_at=?1,updated_at=?1 WHERE recurrence_source_id IS NULL AND id IN (SELECT parent_id FROM tasks WHERE parent_id IS NOT NULL AND recurrence_source_id IS NULL) AND NOT EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id=tasks.id AND c.status<>'completed')",
            [&timestamp],
        )?;
    } else {
        tx.execute(
            "UPDATE tasks SET status='open',completed_at=NULL,updated_at=?1 WHERE recurrence_source_id IS NULL AND id IN (SELECT parent_id FROM tasks WHERE parent_id IS NOT NULL AND recurrence_source_id IS NULL) AND EXISTS (SELECT 1 FROM tasks c WHERE c.parent_id=tasks.id AND c.status<>'completed')",
            [&timestamp],
        )?;
    }
    Ok(())
}

fn delete_tasks(tx: &Transaction<'_>, ids: Vec<String>) -> Result<(), WorkspaceError> {
    for id in &ids {
        let repeat: Option<Option<String>> = tx
            .query_row("SELECT repeat FROM tasks WHERE id=?1", [id], |row| row.get(0))
            .optional()?;
        let Some(repeat) = repeat else {
            return Err(WorkspaceError::MissingTask(id.clone()));
        };
        if repeat.is_some() {
            // Recurring source task: remove generated instances, then the series
            // occurrences, then the source itself.
            tx.execute("DELETE FROM tasks WHERE recurrence_source_id=?1", [id])?;
            tx.execute("DELETE FROM recurrence_occurrences WHERE source_task_id=?1", [id])?;
            tx.execute("DELETE FROM tasks WHERE id=?1", [id])?;
        } else {
            // Plain task or a generated instance. Children cascade via
            // parent_id ON DELETE CASCADE; a deleted instance leaves its
            // occurrence row behind as a tombstone via task_id ON DELETE SET NULL.
            tx.execute("DELETE FROM tasks WHERE id=?1", [id])?;
        }
    }
    Ok(())
}

fn add_to_today(tx: &Transaction<'_>, ids: Vec<String>, today: &str) -> Result<(), WorkspaceError> {
    for id in &ids {
        if tx
            .query_row("SELECT 1 FROM tasks WHERE id=?1", [id], |_| Ok(()))
            .optional()?
            .is_none()
        {
            return Err(WorkspaceError::MissingTask(id.clone()));
        }
        insert_entry(tx, id, today, None)?;
    }
    Ok(())
}

fn move_to_group(
    tx: &Transaction<'_>,
    ids: Vec<String>,
    project_id: Option<String>,
) -> Result<(), WorkspaceError> {
    if let Some(project) = &project_id {
        if tx
            .query_row("SELECT 1 FROM projects WHERE id=?1", [project], |_| Ok(()))
            .optional()?
            .is_none()
        {
            return Err(WorkspaceError::MissingProject(project.clone()));
        }
    }
    let timestamp = now(tx)?;
    for id in &ids {
        let parent_id: Option<String> = tx
            .query_row("SELECT parent_id FROM tasks WHERE id=?1", [id], |row| row.get(0))
            .optional()?
            .ok_or_else(|| WorkspaceError::MissingTask(id.clone()))?;
        if parent_id.is_none() {
            tx.execute(
                "UPDATE tasks SET project_id=?2,updated_at=?3 WHERE id=?1",
                params![id, project_id, timestamp],
            )?;
            tx.execute(
                "UPDATE tasks SET project_id=?2,updated_at=?3 WHERE parent_id=?1",
                params![id, project_id, timestamp],
            )?;
        }
    }
    Ok(())
}

fn save_project(tx: &Transaction<'_>, id: &str, name: &str) -> Result<(), WorkspaceError> {
    validate_id(id, "项目 ID")?;
    validate_title(name)?;
    let timestamp = now(tx)?;
    tx.execute(
        "INSERT INTO projects(id,name,created_at,updated_at) VALUES (?1,?2,?3,?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at",
        params![id, name.trim(), timestamp],
    )?;
    Ok(())
}

fn materialize(
    tx: &Transaction<'_>,
    batches: Vec<OccurrenceBatch>,
) -> Result<(), WorkspaceError> {
    let mut sources = HashSet::new();
    for batch in batches {
        if !sources.insert(batch.source_task_id.clone()) {
            return Err(WorkspaceError::InvalidInput(
                "同一源任务不能出现在多个生成批次中".into(),
            ));
        }
        let row: Option<(Option<String>, String, Option<String>, String, Option<String>, Option<String>)> = tx
            .query_row(
                "SELECT repeat,title,project_id,priority,due_date,recurrence_generated_through FROM tasks WHERE id=?1",
                [&batch.source_task_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
            )
            .optional()?;
        let Some((repeat_json, title, project_id, priority, due_date, cursor)) = row else {
            return Err(WorkspaceError::InvalidInput(format!(
                "源任务不存在: {}",
                batch.source_task_id
            )));
        };
        if repeat_json.is_none() {
            return Err(WorkspaceError::InvalidInput(format!(
                "任务不是重复源: {}",
                batch.source_task_id
            )));
        }
        if cursor != batch.expected_through {
            return Err(WorkspaceError::StaleBatch);
        }
        validate_date(tx, &batch.through)?;
        if let Some(cursor) = &cursor {
            if batch.through <= *cursor {
                return Err(WorkspaceError::StaleBatch);
            }
        }
        let mut seen = HashSet::new();
        for date in &batch.dates {
            validate_date(tx, date)?;
            if date > &batch.through
                || cursor.as_ref().map(|value| date <= value).unwrap_or(false)
                || !seen.insert(date.clone())
            {
                return Err(WorkspaceError::InvalidInput(
                    "生成日期不在有效范围或重复".into(),
                ));
            }
            let already_exists = tx
                .query_row(
                    "SELECT 1 FROM recurrence_occurrences WHERE source_task_id=?1 AND occurrence_date=?2",
                    params![batch.source_task_id, date],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if already_exists {
                continue;
            }
            let task_id = format!("occurrence:{}:{}", batch.source_task_id, date);
            let timestamp = now(tx)?;
            tx.execute(
                "INSERT INTO tasks(id,project_id,title,status,priority,due_date,repeat,created_on,recurrence_source_id,recurrence_generated_through,created_at,updated_at) VALUES (?1,?2,?3,'open',?4,?5,NULL,?6,?7,NULL,?8,?8)",
                params![task_id, project_id, title, priority, due_date, date, batch.source_task_id, timestamp],
            )?;
            tx.execute(
                "INSERT INTO recurrence_occurrences(source_task_id,occurrence_date,task_id) VALUES (?1,?2,?3)",
                params![batch.source_task_id, date, task_id],
            )?;
            insert_entry(tx, &task_id, date, None)?;
        }
        tx.execute(
            "UPDATE tasks SET recurrence_generated_through=?2,updated_at=?3 WHERE id=?1",
            params![batch.source_task_id, batch.through, now(tx)?],
        )?;
    }
    Ok(())
}

fn carryover(tx: &Transaction<'_>, today: &str) -> Result<(), WorkspaceError> {
    let mut stmt = tx.prepare(
        "SELECT t.id, MAX(e.local_date) FROM tasks t JOIN daily_entries e ON e.task_id=t.id WHERE t.status='open' AND t.recurrence_source_id IS NULL AND t.repeat IS NULL AND e.local_date<?1 GROUP BY t.id",
    )?;
    let candidates: Vec<(String, String)> = stmt
        .query_map([today], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (task_id, from_date) in candidates {
        insert_entry(tx, &task_id, today, Some(&from_date))?;
    }
    Ok(())
}

fn insert_entry(
    tx: &Transaction<'_>,
    task_id: &str,
    date: &str,
    carried_from: Option<&str>,
) -> Result<(), WorkspaceError> {
    let id = format!("entry:{}:{}", task_id, date);
    tx.execute(
        "INSERT OR IGNORE INTO daily_entries(id,task_id,local_date,carried_from_date) VALUES (?1,?2,?3,?4)",
        params![id, task_id, date, carried_from],
    )?;
    Ok(())
}

fn validate_repeat(repeat: &RepeatRule) -> Result<(), WorkspaceError> {
    match repeat.freq.as_str() {
        "daily" | "weekdays" | "weekly" | "monthly" => {}
        other => {
            return Err(WorkspaceError::InvalidInput(format!(
                "重复频率无效: {other}"
            )))
        }
    }
    if repeat.freq != "weekdays" && !(1..=365).contains(&repeat.interval) {
        return Err(WorkspaceError::InvalidInput(
            "重复间隔必须在 1 到 365 之间".into(),
        ));
    }
    Ok(())
}

fn normalize_repeat(repeat: &RepeatRule) -> RepeatRule {
    if repeat.freq == "weekdays" {
        RepeatRule {
            freq: repeat.freq.clone(),
            interval: 1,
        }
    } else {
        repeat.clone()
    }
}

fn validate_id(id: &str, label: &str) -> Result<(), WorkspaceError> {
    if id.trim().is_empty() || id.len() > 200 {
        Err(WorkspaceError::InvalidInput(format!("{label}不能为空")))
    } else {
        Ok(())
    }
}
fn validate_title(title: &str) -> Result<(), WorkspaceError> {
    if title.trim().is_empty() {
        Err(WorkspaceError::InvalidInput("标题不能为空".into()))
    } else if title.chars().count() > 200 {
        Err(WorkspaceError::InvalidInput(
            "标题不能超过 200 个字符".into(),
        ))
    } else {
        Ok(())
    }
}
fn validate_date(connection: &Connection, date: &str) -> Result<(), WorkspaceError> {
    validate_date_sql(connection, date)
}
fn validate_date_opt(connection: &Connection, date: Option<&str>) -> Result<(), WorkspaceError> {
    if let Some(date) = date {
        validate_date(connection, date)?;
    }
    Ok(())
}
fn validate_date_sql(connection: &Connection, date: &str) -> Result<(), WorkspaceError> {
    let bytes = date.as_bytes();
    let shape = bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
        && &date[0..4] != "0000";
    if !shape
        || !connection.query_row("SELECT date(?1,'+0 days') IS ?1", [date], |row| {
            row.get::<_, bool>(0)
        })?
    {
        return Err(WorkspaceError::InvalidInput(format!("日期无效: {date}")));
    }
    Ok(())
}
fn now(connection: &Connection) -> Result<String, WorkspaceError> {
    Ok(
        connection.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |row| {
            row.get(0)
        })?,
    )
}
fn priority_string(value: &Priority) -> &'static str {
    match value {
        Priority::Low => "low",
        Priority::Normal => "normal",
        Priority::High => "high",
    }
}
fn parse_priority(value: &str) -> Priority {
    match value {
        "low" => Priority::Low,
        "high" => Priority::High,
        _ => Priority::Normal,
    }
}
fn parse_status(value: &str) -> TaskStatus {
    if value == "completed" {
        TaskStatus::Completed
    } else {
        TaskStatus::Open
    }
}
fn density_string(value: &Density) -> &'static str {
    match value {
        Density::Comfortable => "comfortable",
        Density::Compact => "compact",
    }
}
fn parse_density(value: &str) -> Density {
    if value == "compact" {
        Density::Compact
    } else {
        Density::Comfortable
    }
}

/// Parses a legacy rrule string into a `RepeatRule`. Handles the exact strings
/// the old frontend `toRrule` emitted:
///   - `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR` → weekdays (interval 1)
///   - `FREQ=DAILY;INTERVAL=n`            → daily, interval n
///   - `FREQ=WEEKLY;INTERVAL=n`           → weekly, interval n
///   - `FREQ=MONTHLY;INTERVAL=n`          → monthly, interval n
/// Interval defaults to 1 when `INTERVAL=` is absent; parsing is
/// case-insensitive; unknown frequencies are an `InvalidInput` error.
fn repeat_from_rrule(rrule: &str) -> Result<RepeatRule, WorkspaceError> {
    let upper = rrule.to_ascii_uppercase();
    if upper.contains("BYDAY=MO,TU,WE,TH,FR") {
        return Ok(RepeatRule {
            freq: "weekdays".into(),
            interval: 1,
        });
    }
    let freq = if upper.contains("FREQ=DAILY") {
        "daily"
    } else if upper.contains("FREQ=WEEKLY") {
        "weekly"
    } else if upper.contains("FREQ=MONTHLY") {
        "monthly"
    } else {
        return Err(WorkspaceError::InvalidInput(format!(
            "无法解析重复频率: {rrule}"
        )));
    };
    let interval = parse_interval(&upper).unwrap_or(1);
    Ok(RepeatRule {
        freq: freq.into(),
        interval,
    })
}

fn parse_interval(upper: &str) -> Option<i64> {
    let marker = "INTERVAL=";
    let idx = upper.find(marker)?;
    let rest = &upper[idx + marker.len()..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        digits.parse().ok()
    }
}

/// Migrates the legacy `recurrence_rules` model into recurring source tasks and
/// remaps `recurrence_occurrences` to the v2 shape. Runs inside the schema
/// migration transaction, after `003_redesign.sql` has added the new columns
/// and created `recurrence_occurrences_v2`.
pub fn migrate_recurrence_rules(tx: &Transaction<'_>) -> Result<(), WorkspaceError> {
    let rows: Vec<(String, String, String, String, Option<String>, Option<String>)> = {
        let mut stmt = tx.prepare(
            "SELECT id,template_json,rrule,start_date,end_date,generated_through FROM recurrence_rules",
        )?;
        let mapped = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;
        mapped.collect::<Result<Vec<_>, _>>()?
    };
    for (id, template_json, rrule, start_date, end_date, generated_through) in rows {
        let template: TaskTemplate = serde_json::from_str(&template_json)?;
        let repeat = repeat_from_rrule(&rrule)?;
        // A future `end_date` cannot be represented in the new unbounded model, so it
        // becomes recurring-until-stopped. A series whose end_date has already passed,
        // however, must not be re-armed.
        let repeat_value: Option<String> = match (&end_date, &generated_through) {
            (Some(e), Some(g)) if g >= e => None, // series already finished: do not re-arm recurrence
            _ => Some(serde_json::to_string(&repeat)?),
        };
        let source_id = format!("series:{id}");
        let ts = format!("{start_date}T00:00:00Z");
        tx.execute(
            "INSERT OR IGNORE INTO tasks(id,project_id,parent_id,title,status,priority,due_date,repeat,created_on,recurrence_source_id,recurrence_generated_through,completed_at,created_at,updated_at) VALUES (?1,?2,NULL,?3,'open',?4,?5,?6,?7,NULL,?8,NULL,?9,?9)",
            params![
                source_id,
                template.project_id,
                template.title,
                priority_string(&template.priority),
                template.due_date,
                repeat_value,
                start_date,
                generated_through,
                ts
            ],
        )?;
        tx.execute(
            "UPDATE tasks SET recurrence_source_id=?1 WHERE id IN (SELECT task_id FROM recurrence_occurrences WHERE rule_id=?2)",
            params![source_id, id],
        )?;
        tx.execute(
            "UPDATE tasks SET created_on=(SELECT occurrence_date FROM recurrence_occurrences WHERE rule_id=?2 AND task_id=tasks.id) WHERE recurrence_source_id=?1",
            params![source_id, id],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO recurrence_occurrences_v2(source_task_id,occurrence_date,task_id) SELECT ?1, occurrence_date, task_id FROM recurrence_occurrences WHERE rule_id=?2",
            params![source_id, id],
        )?;
    }
    tx.execute_batch(
        "DROP TABLE recurrence_occurrences; DROP TABLE recurrence_rules; ALTER TABLE recurrence_occurrences_v2 RENAME TO recurrence_occurrences;",
    )?;
    Ok(())
}

#[cfg(test)]
#[path = "workspace/tests.rs"]
mod tests;

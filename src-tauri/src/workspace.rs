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
    #[error("重复规则不存在: {0}")]
    MissingRule(String),
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
pub struct Task {
    pub id: String,
    pub project_id: Option<String>,
    pub parent_id: Option<String>,
    pub title: String,
    pub status: TaskStatus,
    pub priority: Priority,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
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
pub struct RecurrenceRule {
    pub id: String,
    pub template: TaskTemplate,
    pub rrule: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub time_zone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StoredRule {
    pub id: String,
    pub template: TaskTemplate,
    pub rrule: String,
    pub start_date: String,
    pub end_date: Option<String>,
    pub time_zone: String,
    pub generated_through: Option<String>,
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
    pub rules: Vec<StoredRule>,
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
    pub scheduled_date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceBatch {
    pub rule_id: String,
    pub expected_through: Option<String>,
    pub through: String,
    pub dates: Vec<String>,
}

type RuleStorageRow = (String, String, String, Option<String>, Option<String>);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Mutation {
    SaveTask { task: TaskDraft },
    SetCompletion { id: String, completed: bool },
    DeleteTask { id: String },
    SaveProject { id: String, name: String },
    DeleteProject { id: String },
    SaveSettings { density: Density },
    SaveRule { rule: RecurrenceRule },
    DeleteRule { id: String },
    Materialize { batches: Vec<OccurrenceBatch> },
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
    let mut stmt = connection.prepare("SELECT id,project_id,parent_id,title,status,priority,due_date,scheduled_date,completed_at,created_at,updated_at FROM tasks ORDER BY created_at,id")?;
    for row in stmt.query_map([], |row| {
        Ok(Task {
            id: row.get(0)?,
            project_id: row.get(1)?,
            parent_id: row.get(2)?,
            title: row.get(3)?,
            status: parse_status(&row.get::<_, String>(4)?),
            priority: parse_priority(&row.get::<_, String>(5)?),
            due_date: row.get(6)?,
            scheduled_date: row.get(7)?,
            completed_at: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
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

    let mut rules = Vec::new();
    let mut stmt = connection.prepare("SELECT id,template_json,rrule,start_date,end_date,time_zone,generated_through FROM recurrence_rules ORDER BY id")?;
    for row in stmt.query_map([], |row| {
        let id: String = row.get(0)?;
        let template: TaskTemplate =
            serde_json::from_str(&row.get::<_, String>(1)?).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    1,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })?;
        Ok(StoredRule {
            id,
            template,
            rrule: row.get(2)?,
            start_date: row.get(3)?,
            end_date: row.get(4)?,
            time_zone: row.get(5)?,
            generated_through: row.get(6)?,
        })
    })? {
        rules.push(row?);
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
        rules,
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
        Mutation::SaveTask { task } => save_task(tx, task, today),
        Mutation::SetCompletion { id, completed } => {
            let timestamp = now(tx)?;
            let changed = tx.execute(
                "UPDATE tasks SET status=?2,completed_at=?3,updated_at=?4 WHERE id=?1",
                params![
                    id,
                    if completed { "completed" } else { "open" },
                    if completed {
                        Some(timestamp.clone())
                    } else {
                        None::<String>
                    },
                    timestamp
                ],
            )?;
            if changed == 0 {
                return Err(WorkspaceError::MissingTask(id));
            }
            Ok(())
        }
        Mutation::DeleteTask { id } => {
            if tx.execute("DELETE FROM tasks WHERE id=?1", [&id])? == 0 {
                return Err(WorkspaceError::MissingTask(id));
            }
            Ok(())
        }
        Mutation::SaveProject { id, name } => save_project(tx, &id, &name),
        Mutation::DeleteProject { id } => {
            if tx.execute("DELETE FROM projects WHERE id=?1", [&id])? == 0 {
                return Err(WorkspaceError::MissingProject(id));
            }
            tx.execute("UPDATE recurrence_rules SET template_json=json_set(template_json,'$.projectId',NULL) WHERE json_extract(template_json,'$.projectId')=?1", [&id])?;
            Ok(())
        }
        Mutation::SaveSettings { density } => {
            tx.execute(
                "UPDATE settings SET density=?1 WHERE id=1",
                [density_string(&density)],
            )?;
            Ok(())
        }
        Mutation::SaveRule { rule } => save_rule(tx, rule),
        Mutation::DeleteRule { id } => {
            if tx.execute("DELETE FROM recurrence_rules WHERE id=?1", [&id])? == 0 {
                return Err(WorkspaceError::MissingRule(id));
            }
            Ok(())
        }
        Mutation::Materialize { batches } => materialize(tx, batches),
        Mutation::Carryover => carryover(tx, today),
    }
}

fn save_task(tx: &Transaction<'_>, draft: TaskDraft, today: &str) -> Result<(), WorkspaceError> {
    validate_id(&draft.id, "任务 ID")?;
    validate_title(&draft.title)?;
    validate_date_opt(tx, draft.due_date.as_deref())?;
    validate_date_opt(tx, draft.scheduled_date.as_deref())?;
    let parent_project = if let Some(parent_id) = &draft.parent_id {
        if parent_id == &draft.id {
            return Err(WorkspaceError::InvalidInput(
                "任务不能成为自己的父任务".into(),
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
    let existed = tx
        .query_row("SELECT 1 FROM tasks WHERE id=?1", [&draft.id], |_| Ok(()))
        .optional()?
        .is_some();
    let inherited_date = if !existed && draft.scheduled_date.is_none() {
        if let Some(parent_id) = &draft.parent_id {
            tx.query_row(
                "SELECT scheduled_date FROM tasks WHERE id=?1",
                [parent_id],
                |row| row.get::<_, Option<String>>(0),
            )?
        } else {
            None
        }
    } else {
        None
    };
    let scheduled_date = draft.scheduled_date.clone().or(inherited_date);
    let timestamp = now(tx)?;
    tx.execute("INSERT INTO tasks(id,project_id,parent_id,title,status,priority,due_date,scheduled_date,created_at,updated_at) VALUES (?1,?2,?3,?4,'open',?5,?6,?7,?8,?8) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,parent_id=excluded.parent_id,title=excluded.title,priority=excluded.priority,due_date=excluded.due_date,scheduled_date=excluded.scheduled_date,updated_at=excluded.updated_at", params![draft.id, effective_project, draft.parent_id, draft.title.trim(), priority_string(&draft.priority), draft.due_date, scheduled_date, timestamp])?;
    if draft.parent_id.is_none() {
        tx.execute(
            "UPDATE tasks SET project_id=?2,updated_at=?3 WHERE parent_id=?1",
            params![draft.id, effective_project, now(tx)?],
        )?;
    }

    // Only future scheduling rows are mutable. Historical rows remain immutable.
    tx.execute(
        "DELETE FROM daily_entries WHERE task_id=?1 AND local_date>=?2",
        params![draft.id, today],
    )?;
    if let Some(date) = scheduled_date {
        insert_entry(tx, &draft.id, &date, None)?;
    }
    Ok(())
}

fn save_project(tx: &Transaction<'_>, id: &str, name: &str) -> Result<(), WorkspaceError> {
    validate_id(id, "项目 ID")?;
    validate_title(name)?;
    let timestamp = now(tx)?;
    tx.execute("INSERT INTO projects(id,name,created_at,updated_at) VALUES (?1,?2,?3,?3) ON CONFLICT(id) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at", params![id, name.trim(), timestamp])?;
    Ok(())
}

fn save_rule(tx: &Transaction<'_>, rule: RecurrenceRule) -> Result<(), WorkspaceError> {
    validate_id(&rule.id, "规则 ID")?;
    validate_title(&rule.template.title)?;
    validate_date(tx, &rule.start_date)?;
    validate_date_opt(tx, rule.end_date.as_deref())?;
    if let Some(end) = &rule.end_date {
        if end < &rule.start_date {
            return Err(WorkspaceError::InvalidInput(
                "规则结束日期不能早于开始日期".into(),
            ));
        }
    }
    validate_date_opt(tx, rule.template.due_date.as_deref())?;
    if rule.rrule.trim().is_empty() {
        return Err(WorkspaceError::InvalidInput("重复规则不能为空".into()));
    }
    if rule.time_zone.trim().is_empty() {
        return Err(WorkspaceError::InvalidInput("时区不能为空".into()));
    }
    if let Some(project) = &rule.template.project_id {
        if tx
            .query_row("SELECT 1 FROM projects WHERE id=?1", [project], |_| Ok(()))
            .optional()?
            .is_none()
        {
            return Err(WorkspaceError::MissingProject(project.clone()));
        }
    }
    let mut template = rule.template;
    template.title = template.title.trim().into();
    let json = serde_json::to_string(&template)?;
    tx.execute("INSERT INTO recurrence_rules(id,template_json,rrule,start_date,end_date,time_zone,generated_through) VALUES (?1,?2,?3,?4,?5,?6,NULL) ON CONFLICT(id) DO UPDATE SET template_json=excluded.template_json,rrule=excluded.rrule,start_date=excluded.start_date,end_date=excluded.end_date,time_zone=excluded.time_zone", params![rule.id, json, rule.rrule, rule.start_date, rule.end_date, rule.time_zone])?;
    Ok(())
}

fn materialize(tx: &Transaction<'_>, batches: Vec<OccurrenceBatch>) -> Result<(), WorkspaceError> {
    let mut rules = HashSet::new();
    for batch in batches {
        if !rules.insert(batch.rule_id.clone()) {
            return Err(WorkspaceError::InvalidInput(
                "同一规则不能出现在多个生成批次中".into(),
            ));
        }
        let row: Option<RuleStorageRow> = tx.query_row("SELECT template_json,start_date,rrule,end_date,generated_through FROM recurrence_rules WHERE id=?1", [&batch.rule_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))).optional()?;
        let Some((template_json, start_date, _rrule, end_date, cursor)) = row else {
            return Err(WorkspaceError::InvalidInput(format!(
                "规则不存在: {}",
                batch.rule_id
            )));
        };
        if cursor != batch.expected_through {
            return Err(WorkspaceError::StaleBatch);
        }
        validate_date(tx, &batch.through)?;
        if let Some(cursor) = &cursor {
            if batch.through <= *cursor {
                return Err(WorkspaceError::StaleBatch);
            }
        }
        if batch.through < start_date {
            return Err(WorkspaceError::InvalidInput(
                "生成范围早于规则开始日期".into(),
            ));
        }
        if end_date
            .as_ref()
            .map(|end| batch.through > *end)
            .unwrap_or(false)
        {
            return Err(WorkspaceError::InvalidInput(
                "生成范围晚于规则结束日期".into(),
            ));
        }
        let template: TaskTemplate = serde_json::from_str(&template_json)?;
        let mut seen = HashSet::new();
        for date in &batch.dates {
            validate_date(tx, date)?;
            if date < &start_date
                || end_date.as_ref().map(|end| date > end).unwrap_or(false)
                || date > &batch.through
                || cursor.as_ref().map(|value| date <= value).unwrap_or(false)
                || !seen.insert(date)
            {
                return Err(WorkspaceError::InvalidInput(
                    "生成日期不在有效范围或重复".into(),
                ));
            }
            let already_exists = tx
                .query_row(
                    "SELECT 1 FROM recurrence_occurrences WHERE rule_id=?1 AND occurrence_date=?2",
                    params![batch.rule_id, date],
                    |_| Ok(()),
                )
                .optional()?
                .is_some();
            if already_exists {
                continue;
            }
            let task_id = format!("occurrence:{}:{}", batch.rule_id, date);
            let timestamp = now(tx)?;
            tx.execute("INSERT INTO tasks(id,project_id,title,status,priority,due_date,scheduled_date,created_at,updated_at) VALUES (?1,?2,?3,'open',?4,?5,?6,?7,?7)", params![task_id, template.project_id, template.title, priority_string(&template.priority), template.due_date, date, timestamp])?;
            tx.execute("INSERT INTO recurrence_occurrences(rule_id,occurrence_date,task_id) VALUES (?1,?2,?3)", params![batch.rule_id, date, task_id])?;
            insert_entry(tx, &task_id, date, None)?;
        }
        tx.execute(
            "UPDATE recurrence_rules SET generated_through=?2 WHERE id=?1",
            params![batch.rule_id, batch.through],
        )?;
    }
    Ok(())
}

fn carryover(tx: &Transaction<'_>, today: &str) -> Result<(), WorkspaceError> {
    let mut stmt = tx.prepare("SELECT t.id, MAX(e.local_date) FROM tasks t JOIN daily_entries e ON e.task_id=t.id WHERE t.status='open' AND t.scheduled_date<?1 AND e.local_date<?1 GROUP BY t.id")?;
    let candidates: Vec<(String, String)> = stmt
        .query_map([today], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (task_id, from_date) in candidates {
        insert_entry(tx, &task_id, today, Some(&from_date))?;
        tx.execute(
            "UPDATE tasks SET scheduled_date=?2,updated_at=?3 WHERE id=?1",
            params![task_id, today, now(tx)?],
        )?;
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
    tx.execute("INSERT OR IGNORE INTO daily_entries(id,task_id,local_date,carried_from_date) VALUES (?1,?2,?3,?4)", params![id, task_id, date, carried_from])?;
    Ok(())
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

#[cfg(test)]
#[path = "workspace/tests.rs"]
mod tests;

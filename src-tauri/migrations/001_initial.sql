CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  status TEXT NOT NULL CHECK(status IN ('open','completed')),
  priority TEXT NOT NULL CHECK(priority IN ('low','normal','high')),
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(parent_id IS NULL OR parent_id <> id),
  CHECK((status='open' AND completed_at IS NULL) OR (status='completed' AND completed_at IS NOT NULL)),
  CHECK(due_date IS NULL OR (length(due_date)=10 AND date(due_date,'+0 days') IS due_date AND substr(due_date,1,4) BETWEEN '0001' AND '9999'))
);
CREATE INDEX tasks_project_id ON tasks(project_id);
CREATE INDEX tasks_parent_id ON tasks(parent_id);
CREATE TRIGGER tasks_parent_insert BEFORE INSERT ON tasks
WHEN NEW.parent_id IS NOT NULL AND (
  EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_id AND parent_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM tasks WHERE parent_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'Only one subtask level is supported'); END;
CREATE TRIGGER tasks_parent_update BEFORE UPDATE OF parent_id ON tasks
WHEN NEW.parent_id IS NOT NULL AND (
  EXISTS(SELECT 1 FROM tasks WHERE id=NEW.parent_id AND parent_id IS NOT NULL)
  OR EXISTS(SELECT 1 FROM tasks WHERE parent_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT, 'Only one subtask level is supported'); END;
CREATE TABLE daily_entries (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL CHECK(length(local_date)=10 AND date(local_date,'+0 days') IS local_date AND substr(local_date,1,4) BETWEEN '0001' AND '9999'),
  carried_from_date TEXT CHECK(carried_from_date IS NULL OR (length(carried_from_date)=10 AND date(carried_from_date,'+0 days') IS carried_from_date AND carried_from_date < local_date)),
  UNIQUE(task_id, local_date)
);
CREATE INDEX daily_entries_date ON daily_entries(local_date);
CREATE TABLE recurrence_rules (
  id TEXT PRIMARY KEY NOT NULL,
  template_json TEXT NOT NULL CHECK(json_valid(template_json)),
  rrule TEXT NOT NULL,
  start_date TEXT NOT NULL CHECK(length(start_date)=10 AND date(start_date,'+0 days') IS start_date AND substr(start_date,1,4) BETWEEN '0001' AND '9999'),
  end_date TEXT CHECK(end_date IS NULL OR (length(end_date)=10 AND date(end_date,'+0 days') IS end_date AND end_date >= start_date)),
  time_zone TEXT NOT NULL
);
CREATE TABLE recurrence_occurrences (
  rule_id TEXT NOT NULL REFERENCES recurrence_rules(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL CHECK(length(occurrence_date)=10 AND date(occurrence_date,'+0 days') IS occurrence_date AND substr(occurrence_date,1,4) BETWEEN '0001' AND '9999'),
  task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY(rule_id, occurrence_date)
);
CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  schema_version INTEGER NOT NULL CHECK(schema_version=1),
  locale TEXT NOT NULL CHECK(locale='zh-CN'),
  density TEXT NOT NULL CHECK(density IN ('comfortable','compact'))
);
INSERT INTO settings(id,schema_version,locale,density) VALUES (1,1,'zh-CN','comfortable');

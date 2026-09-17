DROP INDEX IF EXISTS tasks_scheduled_date;
ALTER TABLE tasks DROP COLUMN scheduled_date;

ALTER TABLE tasks ADD COLUMN repeat TEXT CHECK(repeat IS NULL OR json_valid(repeat));
ALTER TABLE tasks ADD COLUMN created_on TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_source_id TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_generated_through TEXT;

UPDATE tasks SET created_on = substr(created_at, 1, 10);

CREATE TABLE recurrence_occurrences_v2 (
  source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL CHECK(length(occurrence_date)=10 AND date(occurrence_date,'+0 days') IS occurrence_date AND substr(occurrence_date,1,4) BETWEEN '0001' AND '9999'),
  task_id TEXT UNIQUE REFERENCES tasks(id) ON DELETE SET NULL,
  PRIMARY KEY(source_task_id, occurrence_date)
);

ALTER TABLE recurrence_rules
ADD COLUMN generated_through TEXT
CHECK(
  generated_through IS NULL OR (
    length(generated_through)=10
    AND date(generated_through,'+0 days') IS generated_through
    AND substr(generated_through,1,4) BETWEEN '0001' AND '9999'
  )
);

ALTER TABLE tasks
ADD COLUMN scheduled_date TEXT
CHECK(
  scheduled_date IS NULL OR (
    length(scheduled_date)=10
    AND date(scheduled_date,'+0 days') IS scheduled_date
    AND substr(scheduled_date,1,4) BETWEEN '0001' AND '9999'
  )
);

UPDATE tasks
SET scheduled_date=(
  SELECT MAX(local_date)
  FROM daily_entries
  WHERE daily_entries.task_id=tasks.id
);

CREATE INDEX tasks_scheduled_date ON tasks(scheduled_date);

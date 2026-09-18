-- Allow arbitrary-depth subtasks. The one-level constraint was enforced by
-- two triggers (INSERT + UPDATE); drop them so a task may be the child of a
-- task that is itself a child, and may keep children while gaining a parent.
DROP TRIGGER tasks_parent_insert;
DROP TRIGGER tasks_parent_update;

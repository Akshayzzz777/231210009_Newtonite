CREATE OR REPLACE FUNCTION "prevent_activity_log_mutation"()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ActivityLog is append-only and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ActivityLog_prevent_update"
BEFORE UPDATE ON "ActivityLog"
FOR EACH ROW
EXECUTE FUNCTION "prevent_activity_log_mutation"();

CREATE TRIGGER "ActivityLog_prevent_delete"
BEFORE DELETE ON "ActivityLog"
FOR EACH ROW
EXECUTE FUNCTION "prevent_activity_log_mutation"();

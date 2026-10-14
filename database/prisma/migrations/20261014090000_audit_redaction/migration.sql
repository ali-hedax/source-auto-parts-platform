-- Erasing a staff member or invitation (owner request) replaces their name and e-mail in the
-- audit trail. The audit log stays append-only: rows can never be deleted, and an update is
-- allowed only inside a transaction that set "hedax.audit_redaction" (the erasure service), and
-- only to the before/after payloads — who, what, when and the request stay unchanged.
CREATE OR REPLACE FUNCTION hedax_audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('hedax.audit_redaction', true) = 'on'
     AND NEW.id = OLD.id
     AND NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
     AND NEW.actor_kind = OLD.actor_kind
     AND NEW.action = OLD.action
     AND NEW.entity_type = OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id
     AND NEW.ip_hash IS NOT DISTINCT FROM OLD.ip_hash
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'table % is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "audit_log_append_only" ON "audit_log";
CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION hedax_audit_log_guard();

-- Source-only. Execute only after independently approved operator maintenance.
-- Durable default HOLD survives web/service restarts. Not a solvency certificate.
CREATE TABLE public.hd_financial_maintenance_policy (
 scope text PRIMARY KEY CHECK(scope IN ('hd-legacy','hd-satchel')),
 generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 999999999999999999),
 closed boolean NOT NULL DEFAULT true,
 permit jsonb,
 signature text,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(closed OR (permit IS NOT NULL AND signature IS NOT NULL))
);
REVOKE ALL ON public.hd_financial_maintenance_policy FROM PUBLIC;
INSERT INTO public.hd_financial_maintenance_policy(scope,generation)
 VALUES('hd-legacy',1),('hd-satchel',1);
CREATE FUNCTION public.hd_financial_maintenance_monotonic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN
  RAISE EXCEPTION 'financial policy tombstones cannot be deleted';
 END IF;
 IF NEW.scope<>OLD.scope OR NEW.generation<=OLD.generation THEN
  RAISE EXCEPTION 'financial policy generation must advance';
 END IF;
 NEW.updated_at:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER hd_financial_maintenance_monotonic BEFORE UPDATE OR DELETE
 ON public.hd_financial_maintenance_policy FOR EACH ROW
 EXECUTE FUNCTION public.hd_financial_maintenance_monotonic();
CREATE TRIGGER hd_financial_maintenance_no_truncate BEFORE TRUNCATE
 ON public.hd_financial_maintenance_policy FOR EACH STATEMENT
 EXECUTE FUNCTION public.hd_financial_maintenance_monotonic();
-- Never provision an OPEN permit or a writer from this migration.
-- Grant SELECT exclusively to an independently provisioned,
-- non-inheriting PostgreSQL role after reviewed role/RLS checks.

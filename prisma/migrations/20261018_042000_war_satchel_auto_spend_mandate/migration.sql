-- Additive original-signature evidence. No historical consent is upgraded.
CREATE TABLE "war_satchel_auto_spend_mandates" (
  "consent_id" UUID PRIMARY KEY REFERENCES "war_satchel_auto_spend_consents"("id") ON DELETE RESTRICT,
  "until_out" BOOLEAN NOT NULL,
  "games_remaining" INTEGER,
  "challenge_text" TEXT NOT NULL,
  "owner_signature_json" JSONB,
  "signed_at" TIMESTAMP(6),
  CONSTRAINT "ck_satchel_mandate_game_limit" CHECK (
    (until_out AND games_remaining IS NULL) OR
    (NOT until_out AND games_remaining BETWEEN 1 AND 10000)),
  CONSTRAINT "ck_satchel_mandate_signature_pair" CHECK (
    (signed_at IS NULL AND owner_signature_json IS NULL) OR
    (signed_at IS NOT NULL AND jsonb_typeof(owner_signature_json)='object')),
  CONSTRAINT "ck_satchel_mandate_bounded_text" CHECK (octet_length(challenge_text) BETWEEN 100 AND 4096)
);
CREATE FUNCTION war_satchel_original_mandate_lock() RETURNS trigger LANGUAGE plpgsql AS $mandate$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'original Satchel mandate immutable'; END IF;
  IF (NEW.consent_id,NEW.until_out,NEW.games_remaining,NEW.challenge_text) IS DISTINCT FROM
      (OLD.consent_id,OLD.until_out,OLD.games_remaining,OLD.challenge_text) OR
      OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'original Satchel mandate immutable'; END IF;
  IF NEW.signed_at IS NULL OR NEW.owner_signature_json IS NULL THEN
    RAISE EXCEPTION 'original Satchel mandate requires signature';
  END IF;
  RETURN NEW;
END;
$mandate$;
CREATE TRIGGER satchel_original_mandate_lock BEFORE UPDATE OR DELETE ON "war_satchel_auto_spend_mandates"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_original_mandate_lock();
CREATE TRIGGER satchel_original_mandate_no_truncate BEFORE TRUNCATE ON "war_satchel_auto_spend_mandates"
  FOR EACH STATEMENT EXECUTE FUNCTION war_satchel_original_mandate_lock();

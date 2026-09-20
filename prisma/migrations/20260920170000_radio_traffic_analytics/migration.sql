BEGIN;

ALTER TABLE "radio_listener_states"
  ADD COLUMN "traffic_visitor_id" VARCHAR(100),
  ADD COLUMN "traffic_session_id" VARCHAR(100),
  ADD COLUMN "interacted_at" TIMESTAMP(6),
  ADD COLUMN "last_interaction" VARCHAR(32),
  ADD COLUMN "sound_ever_on_at" TIMESTAMP(6);

CREATE INDEX "ix_radio_listener_states_traffic_visitor_seen"
  ON "radio_listener_states"("traffic_visitor_id", "last_seen_at");

COMMIT;

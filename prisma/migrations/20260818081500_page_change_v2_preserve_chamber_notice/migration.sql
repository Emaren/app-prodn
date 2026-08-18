-- Preserve the pre-V2 Chamber notice for existing users.
-- Page Change V2 accidentally baselined /round-chamber as seen when it moved
-- from localStorage to durable server authority. The table itself is new in
-- this release, so removing only this route's launch receipts restores the
-- intended two-dot launch state without touching any pre-existing domain data.
DELETE FROM "user_page_change_seen"
WHERE "href" = '/round-chamber';

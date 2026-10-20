-- Allow 15 players in group_size constraint and seat_quotas
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_room_group_size;
ALTER TABLE rooms ADD CONSTRAINT chk_room_group_size CHECK (group_size IN (5,10,15,20,30,40,50,60,70,80));

ALTER TABLE seat_quotas DROP CONSTRAINT IF EXISTS chk_quota_group_size;
ALTER TABLE seat_quotas ADD CONSTRAINT chk_quota_group_size CHECK (group_size IN (5,10,15,20,30,40,50,60,70,80));

INSERT INTO seat_quotas (group_size, max_seats_per_user, tier_index)
VALUES (15, 2, 10)
ON CONFLICT (group_size) DO NOTHING;

-- Set default round duration to 60 seconds
ALTER TABLE rooms ALTER COLUMN round_duration_seconds SET DEFAULT 60;

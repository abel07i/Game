-- ══════════════════════════════════════════════════════════════════════════════
--  FAST DERASH — Seed Data: Sample Rooms, Bots, and Demo Users
--  Run AFTER schema.sql
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── Bot Users ──────────────────────────────────────────────────────────────

INSERT INTO users (id, display_name, role) VALUES
    ('b0000001-0000-0000-0000-000000000001', 'Dawit',       'bot'),
    ('b0000001-0000-0000-0000-000000000002', 'Chala',       'bot'),
    ('b0000001-0000-0000-0000-000000000003', 'Almaz',       'bot'),
    ('b0000001-0000-0000-0000-000000000004', 'Meron',       'bot'),
    ('b0000001-0000-0000-0000-000000000005', 'Yohannes',    'bot'),
    ('b0000001-0000-0000-0000-000000000006', 'Tigist',      'bot'),
    ('b0000001-0000-0000-0000-000000000007', 'Abebe',       'bot'),
    ('b0000001-0000-0000-0000-000000000008', 'Hiwot',       'bot'),
    ('b0000001-0000-0000-0000-000000000009', 'Biruk',       'bot'),
    ('b0000001-0000-0000-0000-000000000010', 'Selam',       'bot'),
    ('b0000001-0000-0000-0000-000000000011', 'Kidist',      'bot'),
    ('b0000001-0000-0000-0000-000000000012', 'Nahom',       'bot'),
    ('b0000001-0000-0000-0000-000000000013', 'Rahel',       'bot'),
    ('b0000001-0000-0000-0000-000000000014', 'Tewodros',    'bot'),
    ('b0000001-0000-0000-0000-000000000015', 'Bethlehem',   'bot'),
    ('b0000001-0000-0000-0000-000000000016', 'Henok',       'bot'),
    ('b0000001-0000-0000-0000-000000000017', 'Sara',        'bot'),
    ('b0000001-0000-0000-0000-000000000018', 'Yared',       'bot'),
    ('b0000001-0000-0000-0000-000000000019', 'Mahlet',      'bot'),
    ('b0000001-0000-0000-0000-000000000020', 'Ermias',      'bot'),
    ('b0000001-0000-0000-0000-000000000021', 'Seble',       'bot'),
    ('b0000001-0000-0000-0000-000000000022', 'Daniel',      'bot'),
    ('b0000001-0000-0000-0000-000000000023', 'Hanna',       'bot'),
    ('b0000001-0000-0000-0000-000000000024', 'Getachew',    'bot'),
    ('b0000001-0000-0000-0000-000000000025', 'Meseret',     'bot'),
    ('b0000001-0000-0000-0000-000000000026', 'Tadesse',     'bot'),
    ('b0000001-0000-0000-0000-000000000027', 'Aster',       'bot'),
    ('b0000001-0000-0000-0000-000000000028', 'Solomon',     'bot'),
    ('b0000001-0000-0000-0000-000000000029', 'Eyerusalem',  'bot'),
    ('b0000001-0000-0000-0000-000000000030', 'Kebede',      'bot');

-- Create demo wallets for bots (unlimited funds)
INSERT INTO wallets (user_id, mode, balance)
SELECT id, 'demo', 999999999.00 FROM users WHERE role = 'bot';

-- ─── Sample Demo User ──────────────────────────────────────────────────────

INSERT INTO users (id, display_name, phone_number, role)
VALUES ('d0000001-0000-0000-0000-000000000001', 'Demo Player', '+251900000001', 'player');

INSERT INTO wallets (user_id, mode, balance)
VALUES ('d0000001-0000-0000-0000-000000000001', 'demo', 50000.00);

INSERT INTO wallets (user_id, mode, balance)
VALUES ('d0000001-0000-0000-0000-000000000001', 'real', 0.00);


-- ─── Verification Queries ───────────────────────────────────────────────────

-- Verify tier configurations loaded correctly
-- SELECT tier, COUNT(*), MIN(jackpot_amount), MAX(jackpot_amount) FROM tier_config GROUP BY tier ORDER BY tier;

-- Verify seat quotas
-- SELECT * FROM seat_quotas ORDER BY group_size;

-- Verify bot count
-- SELECT COUNT(*) AS bot_count FROM users WHERE role = 'bot';

-- Test provably fair function
-- SELECT fn_provably_fair_draw('server_secret_seed_abc123', 'client_seed_xyz', 1, 10) AS winning_seat;

-- Runs once, on first start of an empty data volume.
-- A separate database for automated tests, so they never touch development data.
CREATE DATABASE atolye_test OWNER atolye;

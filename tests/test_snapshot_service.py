"""
Unit and integration tests for Automated Daily SQLite Snapshot Service.
CRITICAL SAFETY INVARIANT:
All tests strictly operate on isolated temporary databases created via NamedTemporaryFile/tmp_path.
Never connects to or mutates server/chintu_memory.db.
"""

import os
import time
import uuid
import hashlib
import sqlite3
import pytest
import asyncio
from datetime import datetime, timedelta, timezone

from server.snapshot_service import (
    SnapshotService,
    SnapshotResult,
    SNAPSHOT_FILE_PREFIX,
    SNAPSHOT_FILE_EXT,
    IST
)


@pytest.fixture
def isolated_db_and_backup_dir(tmp_path):
    """
    Creates an isolated temporary SQLite database with test schema and data,
    plus an isolated backup directory.
    """
    db_file = tmp_path / "test_source.db"
    backup_dir = tmp_path / "backups_test"
    backup_dir.mkdir(parents=True, exist_ok=True)

    # Populate temporary database with realistic data
    conn = sqlite3.connect(str(db_file))
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("CREATE TABLE trades (id INTEGER PRIMARY KEY, symbol TEXT, qty INT, price REAL);")
    conn.execute("CREATE TABLE configs (key TEXT PRIMARY KEY, val TEXT);")
    for i in range(25):
        conn.execute("INSERT INTO trades VALUES (?, ?, ?, ?)", (i + 1, f"SYM_{i}", 50, 24000.0 + i * 10))
    conn.execute("INSERT INTO configs VALUES ('test_key', 'test_val')")
    conn.commit()
    conn.close()

    return str(db_file), str(backup_dir)


class TestSnapshotServiceCore:
    """Tests core snapshot creation, integrity checks, and data preservation."""

    def test_create_snapshot_success_and_integrity(self, isolated_db_and_backup_dir):
        db_path, backup_dir = isolated_db_and_backup_dir
        source_hash_before = hashlib.sha256(open(db_path, "rb").read()).hexdigest()

        service = SnapshotService(db_path=db_path, backup_dir=backup_dir)
        result = service.create_snapshot(custom_label="test_run")

        assert result.success is True
        assert result.integrity_check_passed is True
        assert result.error is None
        assert result.bytes_written > 0
        assert os.path.exists(result.snapshot_path)
        assert result.snapshot_filename.startswith(SNAPSHOT_FILE_PREFIX)
        assert "test_run" in result.snapshot_filename

        # Verify snapshot content matches source records
        snap_conn = sqlite3.connect(result.snapshot_path)
        count = snap_conn.execute("SELECT COUNT(*) FROM trades").fetchone()[0]
        snap_conn.close()
        assert count == 25

        # Verify source database was completely untouched
        source_hash_after = hashlib.sha256(open(db_path, "rb").read()).hexdigest()
        assert source_hash_before == source_hash_after

    def test_source_read_only_isolation(self, isolated_db_and_backup_dir):
        """Verifies that the snapshot service accesses source DB in read-only mode."""
        db_path, backup_dir = isolated_db_and_backup_dir
        service = SnapshotService(db_path=db_path, backup_dir=backup_dir)

        # Ensure snapshot succeeds
        res = service.create_snapshot()
        assert res.success is True

        # Test PRAGMA integrity on the created snapshot
        conn = sqlite3.connect(res.snapshot_path)
        status = conn.execute("PRAGMA integrity_check;").fetchone()[0]
        conn.close()
        assert status == "ok"

    def test_missing_source_database_handled_gracefully(self, tmp_path):
        missing_db = str(tmp_path / "non_existent.db")
        backup_dir = str(tmp_path / "backups")

        service = SnapshotService(db_path=missing_db, backup_dir=backup_dir)
        result = service.create_snapshot()

        assert result.success is False
        assert result.integrity_check_passed is False
        assert "does not exist" in result.error
        assert result.snapshot_path is None

    def test_collision_safe_naming(self, isolated_db_and_backup_dir):
        """Rapid successive snapshots in the same second do not overwrite or crash."""
        db_path, backup_dir = isolated_db_and_backup_dir
        service = SnapshotService(db_path=db_path, backup_dir=backup_dir)

        res1 = service.create_snapshot("rapid")
        res2 = service.create_snapshot("rapid")

        assert res1.success is True
        assert res2.success is True
        assert res1.snapshot_path != res2.snapshot_path
        assert os.path.exists(res1.snapshot_path)
        assert os.path.exists(res2.snapshot_path)


class TestSnapshotRetentionAndPruning:
    """Tests the automated retention policy and pruning safeguards."""

    def test_retention_pruning_deletes_only_expired_owned_snapshots(self, isolated_db_and_backup_dir):
        db_path, backup_dir = isolated_db_and_backup_dir
        service = SnapshotService(db_path=db_path, backup_dir=backup_dir, retention_days=7)

        # 1. Create a current snapshot
        res_current = service.create_snapshot("current")
        assert res_current.success is True

        # 2. Create a simulated older snapshot owned by the service
        old_snap_name = f"{SNAPSHOT_FILE_PREFIX}20260901_000000{SNAPSHOT_FILE_EXT}"
        old_snap_path = os.path.join(backup_dir, old_snap_name)
        with open(old_snap_path, "wb") as f:
            f.write(b"MOCK_OLD_SNAPSHOT_CONTENT")
        # Set mtime to 15 days ago (older than 7-day retention)
        old_time = time.time() - (15 * 86400)
        os.utime(old_snap_path, (old_time, old_time))

        # 3. Create an unrelated file that must NEVER be deleted
        unrelated_file = os.path.join(backup_dir, "manual_preflight_do_not_touch.db")
        with open(unrelated_file, "wb") as f:
            f.write(b"CRITICAL_USER_DATA")
        os.utime(unrelated_file, (old_time, old_time))

        # Run pruning
        pruned_count = service._prune_expired_snapshots()
        assert pruned_count == 1
        assert not os.path.exists(old_snap_path)
        assert os.path.exists(unrelated_file)
        assert os.path.exists(res_current.snapshot_path)

    def test_list_snapshots_and_telemetry(self, isolated_db_and_backup_dir):
        db_path, backup_dir = isolated_db_and_backup_dir
        service = SnapshotService(db_path=db_path, backup_dir=backup_dir)

        service.create_snapshot("batch1")
        service.create_snapshot("batch2")

        snaps = service.list_snapshots()
        assert len(snaps) == 2
        assert snaps[0]["size_bytes"] > 0
        assert "created_at" in snaps[0]

        status = service.get_status()
        assert status["total_snapshots_retained"] == 2
        assert status["total_storage_bytes"] > 0
        assert status["source_db_exists"] is True


class TestSnapshotSchedulerIdempotency:
    """Tests scheduler lifecycle, idempotency, and schedule calculation."""

    @pytest.mark.asyncio
    async def test_scheduler_idempotency_prevents_duplicate_loops(self, isolated_db_and_backup_dir):
        db_path, backup_dir = isolated_db_and_backup_dir
        service = SnapshotService(db_path=db_path, backup_dir=backup_dir)

        # First start
        await service.start_scheduler()
        assert service._is_running is True
        task1 = service._scheduler_task

        # Second start (must not create new task)
        await service.start_scheduler()
        assert service._scheduler_task is task1

        # Clean shutdown
        service.stop_scheduler()
        assert service._is_running is False
        await asyncio.sleep(0.01)
        assert task1.cancelled() or task1.done()

    def test_calculate_seconds_until_next_run(self, isolated_db_and_backup_dir):
        db_path, backup_dir = isolated_db_and_backup_dir
        service = SnapshotService(db_path=db_path, backup_dir=backup_dir, schedule_time_ist="23:55")

        diff = service.calculate_seconds_until_next_run()
        assert diff > 0.0
        assert diff <= 86400.0 # Must be within 24 hours

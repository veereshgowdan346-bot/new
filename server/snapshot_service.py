"""
CHINTU AI QUANT WORKSPACE — Automated SQLite Daily Snapshot Service (Prompt 3)
Provides enterprise-grade, non-blocking daily backups using SQLite's online Backup API
(Connection.backup()).

Key Principles:
1. Source Database Immutability: Opens source database strictly in read-only URI mode
   (file:... ?mode=ro). Source cannot be modified or locked by the backup process.
2. Online Backup API: Executes Connection.backup() to cleanly capture WAL pages and state
   without file-locking conflicts or corrupting live transactions.
3. Atomic Finalization: Backs up to a temporary file (.tmp_{pid}_{uuid}) first, validates
   with read-only PRAGMA integrity_check, and atomically renames (os.replace).
4. Configurable Schedule & Retention: Default 23:55 Asia/Kolkata (IST), 30-day retention
   cleaning only service-owned snapshots (chintu_memory_snapshot_*.db).
5. Non-blocking & Idempotent: Runs in ThreadPoolExecutor/to_thread, guards against duplicate
   scheduler instances on reload, and shuts down gracefully with FastAPI lifespan.
"""

import os
import re
import time
import uuid
import sqlite3
import asyncio
import logging
from dataclasses import dataclass, asdict
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

logger = logging.getLogger("CHINTU_SNAPSHOT_SERVICE")
IST = timezone(timedelta(hours=5, minutes=30))

DEFAULT_SCHEDULE_IST = "23:55"
DEFAULT_RETENTION_DAYS = 30
SNAPSHOT_FILE_PREFIX = "chintu_memory_snapshot_"
SNAPSHOT_FILE_EXT = ".db"
SNAPSHOT_FILENAME_REGEX = re.compile(r"^chintu_memory_snapshot_(\d{8}_\d{6})(?:_.*)?\.db$")


@dataclass
class SnapshotResult:
    """Represents the outcome of a snapshot creation operation."""
    success: bool
    snapshot_path: Optional[str]
    snapshot_filename: Optional[str]
    bytes_written: int
    integrity_check_passed: bool
    duration_seconds: float
    timestamp_iso: str
    error: Optional[str]
    source_db_path: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class SnapshotService:
    """
    Automated Daily Snapshot & Recovery Service for Chintu AI SQLite Database.
    Designed for zero-downtime, non-blocking online backups with strict source read-only isolation.
    """

    _instance: Optional["SnapshotService"] = None

    def __init__(
        self,
        db_path: Optional[str] = None,
        backup_dir: Optional[str] = None,
        schedule_time_ist: str = DEFAULT_SCHEDULE_IST,
        retention_days: int = DEFAULT_RETENTION_DAYS
    ):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.db_path = os.path.abspath(db_path or os.path.join(base_dir, "server", "chintu_memory.db"))
        self.backup_dir = os.path.abspath(backup_dir or os.path.join(base_dir, "backups", "automated_daily"))
        self.schedule_time_ist = schedule_time_ist
        self.retention_days = max(1, int(retention_days))

        self._is_running = False
        self._scheduler_task: Optional[asyncio.Task] = None
        self._last_snapshot_result: Optional[SnapshotResult] = None
        try:
            asyncio.get_running_loop()
            self._lock = asyncio.Lock()
        except RuntimeError:
            self._lock = None

    @classmethod
    def get_instance(cls, **kwargs) -> "SnapshotService":
        """Singleton accessor for server lifespan integration."""
        if cls._instance is None:
            cls._instance = cls(**kwargs)
        return cls._instance

    def create_snapshot(self, custom_label: Optional[str] = None) -> SnapshotResult:
        """
        Executes an atomic online SQLite snapshot using Connection.backup().
        Guaranteed to connect to the source in read-only mode (?mode=ro).
        Validates snapshot with PRAGMA integrity_check before final atomic rename.
        """
        start_time = time.perf_counter()
        now_ist = datetime.now(IST)
        now_iso = now_ist.isoformat()

        if not os.path.exists(self.db_path):
            err = f"Source database file does not exist: {self.db_path}"
            logger.error(f"[Snapshot Error]: {err}")
            return SnapshotResult(
                success=False,
                snapshot_path=None,
                snapshot_filename=None,
                bytes_written=0,
                integrity_check_passed=False,
                duration_seconds=round(time.perf_counter() - start_time, 4),
                timestamp_iso=now_iso,
                error=err,
                source_db_path=self.db_path
            )

        os.makedirs(self.backup_dir, exist_ok=True)

        # Generate collision-safe filename
        ts_str = now_ist.strftime("%Y%m%d_%H%M%S")
        label_part = f"_{custom_label}" if custom_label else ""
        final_filename = f"{SNAPSHOT_FILE_PREFIX}{ts_str}{label_part}{SNAPSHOT_FILE_EXT}"
        final_path = os.path.join(self.backup_dir, final_filename)

        # Handle existing collision by appending unique hash
        if os.path.exists(final_path):
            collision_token = uuid.uuid4().hex[:6]
            final_filename = f"{SNAPSHOT_FILE_PREFIX}{ts_str}{label_part}_{collision_token}{SNAPSHOT_FILE_EXT}"
            final_path = os.path.join(self.backup_dir, final_filename)

        # Atomic temp file pattern
        temp_filename = f"{final_filename}.tmp_{os.getpid()}_{uuid.uuid4().hex[:8]}"
        temp_path = os.path.join(self.backup_dir, temp_filename)

        source_conn = None
        target_conn = None
        bytes_written = 0
        integrity_ok = False

        try:
            # 1. Open source database strictly in read-only URI mode
            # Windows paths must be normalized for SQLite URI syntax
            norm_source = os.path.abspath(self.db_path).replace("\\", "/")
            if not norm_source.startswith("/"):
                norm_source = f"/{norm_source}"
            source_uri = f"file:{norm_source}?mode=ro"

            source_conn = sqlite3.connect(source_uri, uri=True, timeout=30.0)

            # 2. Open destination database connection
            target_conn = sqlite3.connect(temp_path, timeout=30.0)

            # 3. Stream online backup pages
            # pages=100 allows incremental yielding without holding exclusive locks
            source_conn.backup(target_conn, pages=100)

            # 4. Flush and close connections before validation
            target_conn.commit()
            target_conn.close()
            target_conn = None
            source_conn.close()
            source_conn = None

            # 5. Read-only integrity check on completed temporary snapshot
            norm_temp = os.path.abspath(temp_path).replace("\\", "/")
            if not norm_temp.startswith("/"):
                norm_temp = f"/{norm_temp}"
            verify_uri = f"file:{norm_temp}?mode=ro"

            verify_conn = sqlite3.connect(verify_uri, uri=True, timeout=15.0)
            try:
                cursor = verify_conn.cursor()
                res = cursor.execute("PRAGMA integrity_check;").fetchone()
                if res and res[0] == "ok":
                    integrity_ok = True
                else:
                    raise RuntimeError(f"Snapshot integrity check failed: {res}")
            finally:
                verify_conn.close()

            # 6. Atomic finalization: rename temp file to final destination
            os.replace(temp_path, final_path)
            bytes_written = os.path.getsize(final_path)

            # 7. Prune expired snapshots in background
            pruned_count = self._prune_expired_snapshots()
            if pruned_count > 0:
                logger.info(f"[Snapshot Retention]: Pruned {pruned_count} expired snapshots.")

            duration = round(time.perf_counter() - start_time, 4)
            logger.info(
                f"[Snapshot Success]: Created {final_filename} ({bytes_written:,} bytes) "
                f"in {duration}s. Integrity: OK."
            )

            result = SnapshotResult(
                success=True,
                snapshot_path=final_path,
                snapshot_filename=final_filename,
                bytes_written=bytes_written,
                integrity_check_passed=True,
                duration_seconds=duration,
                timestamp_iso=now_iso,
                error=None,
                source_db_path=self.db_path
            )
            self._last_snapshot_result = result
            return result

        except Exception as e:
            logger.error(f"[Snapshot Failed]: {e}", exc_info=True)
            # Clean up temporary file if present
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception:
                    pass

            duration = round(time.perf_counter() - start_time, 4)
            result = SnapshotResult(
                success=False,
                snapshot_path=None,
                snapshot_filename=None,
                bytes_written=0,
                integrity_check_passed=False,
                duration_seconds=duration,
                timestamp_iso=now_iso,
                error=str(e),
                source_db_path=self.db_path
            )
            self._last_snapshot_result = result
            return result

        finally:
            if target_conn:
                try:
                    target_conn.close()
                except Exception:
                    pass
            if source_conn:
                try:
                    source_conn.close()
                except Exception:
                    pass

    def _prune_expired_snapshots(self) -> int:
        """
        Deletes snapshots older than retention_days.
        SAFETY RULE: ONLY deletes files matching SNAPSHOT_FILENAME_REGEX in self.backup_dir.
        Never deletes unrelated files or directories.
        """
        if not os.path.exists(self.backup_dir):
            return 0

        cutoff_epoch = time.time() - (self.retention_days * 86400)
        pruned = 0

        for fname in os.listdir(self.backup_dir):
            full_path = os.path.join(self.backup_dir, fname)
            if not os.path.isfile(full_path):
                continue

            # Clean abandoned temporary files older than 2 hours
            if ".tmp_" in fname:
                try:
                    if os.path.getmtime(full_path) < (time.time() - 7200):
                        os.remove(full_path)
                except Exception:
                    pass
                continue

            # Strict filename matching for service-owned snapshots
            match = SNAPSHOT_FILENAME_REGEX.match(fname)
            if not match:
                continue

            try:
                # Check modification time against retention cutoff
                mtime = os.path.getmtime(full_path)
                if mtime < cutoff_epoch:
                    os.remove(full_path)
                    pruned += 1
            except Exception as e:
                logger.warning(f"[Snapshot Retention]: Failed to delete expired snapshot {fname}: {e}")

        return pruned

    def list_snapshots(self) -> List[Dict[str, Any]]:
        """Returns metadata for all available automated daily snapshots."""
        if not os.path.exists(self.backup_dir):
            return []

        snapshots = []
        for fname in sorted(os.listdir(self.backup_dir), reverse=True):
            full_path = os.path.join(self.backup_dir, fname)
            if not os.path.isfile(full_path) or not SNAPSHOT_FILENAME_REGEX.match(fname):
                continue

            try:
                stat = os.stat(full_path)
                snapshots.append({
                    "filename": fname,
                    "path": full_path,
                    "size_bytes": stat.st_size,
                    "created_at": datetime.fromtimestamp(stat.st_mtime, tz=IST).isoformat(),
                    "mtime_epoch": stat.st_mtime
                })
            except Exception:
                pass

        return snapshots

    def calculate_seconds_until_next_run(self) -> float:
        """Calculates seconds until the next 23:55 IST scheduled execution."""
        try:
            target_hour, target_minute = map(int, self.schedule_time_ist.split(":"))
        except Exception:
            target_hour, target_minute = 23, 55

        now_ist = datetime.now(IST)
        next_run = now_ist.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if next_run <= now_ist:
            next_run += timedelta(days=1)

        diff = (next_run - now_ist).total_seconds()
        return max(1.0, diff)

    async def start_scheduler(self):
        """
        Starts the non-blocking background scheduler.
        Idempotent: prevents duplicate loops if called multiple times.
        """
        if self._is_running:
            logger.info("[Snapshot Scheduler]: Already running. Duplicate start ignored.")
            return

        self._is_running = True
        self._scheduler_task = asyncio.create_task(self._scheduler_loop())
        logger.info(
            f"[Snapshot Scheduler]: Started for {self.schedule_time_ist} IST daily. "
            f"Retention: {self.retention_days} days. Next run in {self.calculate_seconds_until_next_run()/60:.1f} mins."
        )

    async def _scheduler_loop(self):
        """Infinite loop waiting for scheduled trigger."""
        while self._is_running:
            try:
                wait_seconds = self.calculate_seconds_until_next_run()
                logger.debug(f"[Snapshot Scheduler]: Sleeping for {wait_seconds:.1f}s until next scheduled snapshot.")
                await asyncio.sleep(wait_seconds)

                if not self._is_running:
                    break

                # Execute backup in thread pool to prevent blocking the event loop
                logger.info("[Snapshot Scheduler]: Triggering scheduled daily snapshot...")
                res = await asyncio.to_thread(self.create_snapshot, "daily")
                if res.success:
                    logger.info(f"[Snapshot Scheduler]: Daily snapshot succeeded: {res.snapshot_filename}")
                else:
                    logger.error(f"[Snapshot Scheduler]: Daily snapshot failed: {res.error}")

                # Sleep brief interval to prevent double-firing in the same minute
                await asyncio.sleep(65)

            except asyncio.CancelledError:
                logger.info("[Snapshot Scheduler]: Task cancelled cleanly.")
                break
            except Exception as e:
                logger.error(f"[Snapshot Scheduler Loop Error]: {e}", exc_info=True)
                await asyncio.sleep(60)

    def stop_scheduler(self):
        """Stops the scheduler cleanly on server shutdown."""
        self._is_running = False
        if self._scheduler_task and not self._scheduler_task.done():
            self._scheduler_task.cancel()
        logger.info("[Snapshot Scheduler]: Stopped cleanly.")

    def get_status(self) -> Dict[str, Any]:
        """Returns consolidated health and configuration telemetry."""
        snapshots = self.list_snapshots()
        total_size = sum(s["size_bytes"] for s in snapshots)
        return {
            "scheduler_running": self._is_running,
            "schedule_time_ist": self.schedule_time_ist,
            "retention_days": self.retention_days,
            "backup_directory": self.backup_dir,
            "source_db_path": self.db_path,
            "source_db_exists": os.path.exists(self.db_path),
            "source_db_size_bytes": os.path.getsize(self.db_path) if os.path.exists(self.db_path) else 0,
            "total_snapshots_retained": len(snapshots),
            "total_storage_bytes": total_size,
            "next_run_seconds": self.calculate_seconds_until_next_run() if self._is_running else None,
            "last_snapshot": self._last_snapshot_result.to_dict() if self._last_snapshot_result else None
        }


# Global singleton instance
snapshot_service = SnapshotService()

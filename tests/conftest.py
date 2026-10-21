import os
import shutil
import sys
import tempfile
import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(PROJECT_ROOT, "server")
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

PROD_DB = os.path.join(PROJECT_ROOT, "server", "chintu_memory.db")

SESSION_TEMP_DB = None
ORIGINAL_PROD_DB = None


def patch_all_loaded_db_paths(target_path):
    """Dynamically patches DB_PATH across all modules loaded in sys.modules."""
    for mod in list(sys.modules.values()):
        if mod is None:
            continue
        try:
            if hasattr(mod, "DB_PATH"):
                mod.DB_PATH = target_path
            if hasattr(mod, "memory_db") and hasattr(mod.memory_db, "DB_PATH"):
                mod.memory_db.DB_PATH = target_path
            if hasattr(mod, "server_memory_db") and hasattr(mod.server_memory_db, "DB_PATH"):
                mod.server_memory_db.DB_PATH = target_path
        except Exception:
            pass


def pytest_configure(config):
    """
    Runs before any test module is imported or collected.
    Immediately isolates server/chintu_memory.db into a session-wide temp database
    so that module-level imports, fixtures, and setUpClass never touch production storage.
    """
    global SESSION_TEMP_DB, ORIGINAL_PROD_DB
    temp_fd, temp_path = tempfile.mkstemp(suffix="_pytest_session.db")
    os.close(temp_fd)

    if os.path.exists(PROD_DB):
        shutil.copyfile(PROD_DB, temp_path)
    SESSION_TEMP_DB = temp_path

    # Early import and patch
    try:
        import memory_db
        ORIGINAL_PROD_DB = memory_db.DB_PATH
        memory_db.DB_PATH = temp_path
    except Exception:
        pass

    try:
        from server import memory_db as server_memory_db
        if not ORIGINAL_PROD_DB:
            ORIGINAL_PROD_DB = server_memory_db.DB_PATH
        server_memory_db.DB_PATH = temp_path
    except Exception:
        pass

    patch_all_loaded_db_paths(temp_path)


def pytest_unconfigure(config):
    """
    Runs when pytest session finishes.
    Restores original DB_PATH and cleans up session temp file.
    """
    global SESSION_TEMP_DB, ORIGINAL_PROD_DB
    if ORIGINAL_PROD_DB:
        patch_all_loaded_db_paths(ORIGINAL_PROD_DB)

    if SESSION_TEMP_DB and os.path.exists(SESSION_TEMP_DB):
        try:
            os.unlink(SESSION_TEMP_DB)
        except Exception:
            pass


@pytest.fixture(autouse=True, scope="function")
def isolate_production_database():
    """
    Guarantees function-level isolation.
    Clones the session temp database into an isolated per-test SQLite database,
    redirecting all DB_PATH pointers across memory_db and server.memory_db.
    """
    temp_fd, temp_path = tempfile.mkstemp(suffix="_test_func.db")
    os.close(temp_fd)

    source_db = SESSION_TEMP_DB if (SESSION_TEMP_DB and os.path.exists(SESSION_TEMP_DB)) else PROD_DB
    if os.path.exists(source_db):
        shutil.copyfile(source_db, temp_path)

    patch_all_loaded_db_paths(temp_path)

    try:
        from server.centralized_risk_manager import centralized_risk_manager
        centralized_risk_manager.last_order_time = 0.0
        centralized_risk_manager.order_timestamps.clear()
        centralized_risk_manager.quarantined_bots.clear()
        centralized_risk_manager.config["circuit_breaker_active"] = False
        centralized_risk_manager.config["emergency_stop_active"] = False
    except Exception:
        pass

    try:
        yield temp_path
    finally:
        restore_path = SESSION_TEMP_DB if (SESSION_TEMP_DB and os.path.exists(SESSION_TEMP_DB)) else PROD_DB
        patch_all_loaded_db_paths(restore_path)
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass

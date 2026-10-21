# CHINTU AI — TEST AND BUILD EMPIRICAL EVIDENCE

**Date:** 2026-10-18  
**Verification Scope:** Python Regression Test Suite & Production Frontend Build  
**Execution Environment:** Windows (PowerShell), Python 3.14.7, pytest 9.1.1, Node.js / Vite 8.3.4  
**Audit Standard:** Zero fabricated test passes; actual shell outputs, exit codes, and timestamps captured.

---

## 1. Targeted Provenance & Gate Regression Tests

**Command:**
```powershell
pytest tests/test_provenance_and_synthetic_isolation.py tests/test_phase3_verification_and_gate.py -v
```

**Exit Code:** `0`  
**Duration:** `1.41s`  
**Summary:** `12 passed, 4 warnings in 1.41s`

```text
tests/test_provenance_and_synthetic_isolation.py::test_provenance_classification_all_categories PASSED [  8%]
tests/test_provenance_and_synthetic_isolation.py::test_option_contract_integrity_validation PASSED [ 16%]
tests/test_provenance_and_synthetic_isolation.py::test_compute_instrument_regulatory_charges_fail_closed_on_unresolved PASSED [ 25%]
tests/test_provenance_and_synthetic_isolation.py::test_highest_profit_bot_synthetic_isolation PASSED [ 33%]
tests/test_provenance_and_synthetic_isolation.py::test_highest_profit_bot_authentic_eligibility PASSED [ 41%]
tests/test_provenance_and_synthetic_isolation.py::test_recalculate_bot_performance_excludes_rms_and_entries PASSED [ 50%]
tests/test_phase3_verification_and_gate.py::test_unconfirmed_real_broker_fails_closed PASSED [ 58%]
tests/test_phase3_verification_and_gate.py::test_script_simulation_classified_as_synthetic_simulation PASSED [ 66%]
tests/test_phase3_verification_and_gate.py::test_production_database_returns_no_qualified_bot PASSED [ 75%]
tests/test_phase3_verification_and_gate.py::test_exploratory_database_returns_no_qualified_bot PASSED [ 83%]
tests/test_phase3_verification_and_gate.py::test_bot_qualifies_only_with_authentic_trades PASSED [ 91%]
tests/test_phase3_verification_and_gate.py::test_angel_one_feed_credentials_and_market_state PASSED [100%]
```

---

## 2. Complete Python Test Suite Execution

**Command:**
```powershell
pytest tests/ -q
```

**Exit Code:** `0`  
**Duration:** `18.90s`  
**Summary:** `335 passed, 10 warnings in 18.90s`

```text
........................................................................ [ 21%]
........................................................................ [ 42%]
........................................................................ [ 64%]
........................................................................ [ 85%]
...............................................                          [100%]
335 passed, 10 warnings in 18.90s
```

---

## 3. Frontend Production Build

**Command:**
```powershell
npm run build
```

**Exit Code:** `0`  
**Duration:** `1.72s`

```text
> new@0.0.0 build
> vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 1952 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   2.30 kB │ gzip:   1.10 kB
dist/assets/index-BM4l1--q.css   82.98 kB │ gzip:  11.88 kB
dist/assets/index-usPrJAz4.js   898.46 kB │ gzip: 222.20 kB

✓ built in 1.72s
```

---

## 4. Production Database Hash Consistency Evidence

**Command:**
```powershell
Get-FileHash server/chintu_memory.db -Algorithm SHA256
```

**Result:**
```text
Algorithm       Hash                                                               Path
---------       ----                                                               ----
SHA256          262F1C0F78ABE0E00555B97FC5F7F27DFA57C345D5F22FA084C4E504AE95FE33   server/chintu_memory.db
```

**Status:** Intact and verified byte-for-byte across all testing phases.


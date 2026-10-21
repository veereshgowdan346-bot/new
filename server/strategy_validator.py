"""
CHINTU AI TRADING SYSTEM - AST-Safe Strategy Parser & Validator (Phase Master Upgrade)
Validates, sandboxes, and parses copy-pasted trading strategies across Python, JSON, and Structured formats.
Enforces strict AST security: zero eval/exec on untrusted code, zero filesystem/network access,
detects look-ahead leakage, and generates structured validation reports.
"""

import ast
import json
import re
import math
import hashlib
import time
from typing import Dict, Any, List, Optional, Tuple, Set


# ============================================================================
# SECURITY POLICY: DISALLOWED NODES & BUILTINS
# ============================================================================

DISALLOWED_IMPORTS = {
    "os", "sys", "subprocess", "socket", "urllib", "requests", "http",
    "ftplib", "smtplib", "telnetlib", "posix", "nt", "importlib", "ctypes",
    "pickle", "shelve", "marshal", "shutil", "tempfile", "glob", "fnmatch",
    "pathlib", "io", "builtins", "__builtin__", "code", "codeop", "inspect",
    "pty", "tty", "termios", "asyncio", "multiprocessing", "threading"
}

ALLOWED_MODULES = {
    "math", "typing"
}

DISALLOWED_CALL_NAMES = {
    "open", "eval", "exec", "compile", "__import__", "globals", "locals",
    "getattr", "setattr", "delattr", "vars", "breakpoint", "exit", "quit",
    "input", "print", "memoryview", "classmethod", "staticmethod"
}

SAFE_BUILTINS = {
    "abs": abs,
    "min": min,
    "max": max,
    "sum": sum,
    "round": round,
    "len": len,
    "range": range,
    "float": float,
    "int": int,
    "str": str,
    "bool": bool,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "set": set,
    "isinstance": isinstance,
    "enumerate": enumerate,
    "zip": zip,
    "math": math
}


class ASTSecurityVisitor(ast.NodeVisitor):
    """
    Statically analyzes Python AST for security violations, disallowed built-ins,
    dangerous imports, private dunder attribute access, and look-ahead patterns.
    """

    def __init__(self):
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.detected_calls: Set[str] = set()
        self.has_evaluate_func = False
        self.has_strategy_class = False
        self.lookahead_detected = False

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            mod_name = alias.name.split(".")[0]
            if mod_name in DISALLOWED_IMPORTS or mod_name not in ALLOWED_MODULES:
                self.errors.append(
                    f"Line {node.lineno}: Disallowed import '{alias.name}'. Untrusted system/network modules are strictly blocked."
                )
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        mod = (node.module or "").split(".")[0]
        if mod in DISALLOWED_IMPORTS or (mod and mod not in ALLOWED_MODULES):
            self.errors.append(
                f"Line {node.lineno}: Disallowed import-from '{node.module}'. Untrusted system/network modules are strictly blocked."
            )
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call):
        func_name = None
        if isinstance(node.func, ast.Name):
            func_name = node.func.id
        elif isinstance(node.func, ast.Attribute):
            func_name = node.func.attr

        if func_name:
            self.detected_calls.add(func_name)
            if func_name in DISALLOWED_CALL_NAMES:
                self.errors.append(
                    f"Line {node.lineno}: Disallowed dangerous builtin call '{func_name}()' is strictly prohibited."
                )

        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        if node.attr.startswith("__") and node.attr.endswith("__"):
            self.errors.append(
                f"Line {node.lineno}: Access to private dunder attribute '{node.attr}' is prohibited (sandbox escape prevention)."
            )
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef):
        if node.name == "evaluate":
            self.has_evaluate_func = True
        self.generic_visit(node)

    def visit_ClassDef(self, node: ast.ClassDef):
        if "Strategy" in node.name or node.name.endswith("Bot"):
            self.has_strategy_class = True
        self.generic_visit(node)

    def visit_Subscript(self, node: ast.Subscript):
        # Look-ahead check: look for index expressions with addition like candles[i + 1] or positive lookforward
        if isinstance(node.slice, ast.BinOp) and isinstance(node.slice.op, ast.Add):
            if isinstance(node.slice.right, ast.Constant) and isinstance(node.slice.right.value, int) and node.slice.right.value > 0:
                self.warnings.append(
                    f"Line {node.lineno}: Possible look-ahead data leakage detected in subscript index (index + {node.slice.right.value}). Strategy must only access current (0) or historical (-n) bars."
                )
                self.lookahead_detected = True
        self.generic_visit(node)


# ============================================================================
# STRATEGY VALIDATOR CLASS
# ============================================================================

class StrategyValidator:
    """
    Authoritative validator for all imported trading strategies.
    Supports Python scripts, JSON definitions, and Structured schema text.
    """

    @staticmethod
    def detect_format(raw_content: str) -> str:
        """Determines if the raw content is JSON, Python code, or Structured text."""
        content = raw_content.strip()
        if not content:
            return "STRUCTURED"

        # Check for JSON
        if (content.startswith("{") and content.endswith("}")) or (content.startswith("[") and content.endswith("]")):
            try:
                json.loads(content)
                return "JSON"
            except Exception:
                pass

        # Check for Python keywords / structures
        py_indicators = [
            "def evaluate", "class ", "import ", "return {", "return \"BUY\"",
            "return 'BUY'", "elif ", "for candle in", "candles[-1]"
        ]
        if any(ind in content for ind in py_indicators):
            return "PYTHON"

        return "STRUCTURED"

    @classmethod
    def validate(cls, raw_content: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Validates the raw strategy content.
        Returns a rich validation report with AST security verification,
        rule parsing, indicator detection, and compatibility ratings.
        """
        metadata = metadata or {}
        fmt = metadata.get("source_format") or cls.detect_format(raw_content)
        fmt = fmt.upper()

        if fmt == "PYTHON":
            return cls._validate_python_strategy(raw_content, metadata)
        elif fmt == "JSON":
            return cls._validate_json_strategy(raw_content, metadata)
        else:
            return cls._validate_structured_strategy(raw_content, metadata)

    @classmethod
    def _validate_python_strategy(cls, code: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Validates Python code with AST static analysis and restricted execution test."""
        errors: List[str] = []
        warnings: List[str] = []
        parsed_preview: Dict[str, Any] = {}
        dry_run_result: Optional[Dict[str, Any]] = None

        if not code.strip():
            return {
                "is_valid": False,
                "format": "PYTHON",
                "score": 0.0,
                "errors": ["Strategy Python code is empty."],
                "warnings": [],
                "content_hash": "",
                "normalized_strategy": {},
                "parsed_rules_preview": {},
                "compatible_instruments": [],
                "compatible_timeframes": []
            }

        # 1. Parse AST
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return {
                "is_valid": False,
                "format": "PYTHON",
                "score": 10.0,
                "errors": [f"Python SyntaxError at line {e.lineno}, col {e.offset}: {e.msg}"],
                "warnings": [],
                "content_hash": hashlib.sha256(code.encode()).hexdigest()[:16],
                "normalized_strategy": {},
                "parsed_rules_preview": {},
                "compatible_instruments": [],
                "compatible_timeframes": []
            }

        # 2. Run AST Security Visitor
        visitor = ASTSecurityVisitor()
        visitor.visit(tree)
        errors.extend(visitor.errors)
        warnings.extend(visitor.warnings)

        if not visitor.has_evaluate_func and not visitor.has_strategy_class:
            errors.append(
                "Interface Error: Strategy must define an 'evaluate(market_data)' function or a Strategy class with an 'evaluate' method."
            )

        # 3. Detect Technical Indicators from calls and identifiers
        detected_indicators = []
        known_ind_patterns = {
            "calculate_ema": "Exponential Moving Average (EMA)",
            "calculate_sma": "Simple Moving Average (SMA)",
            "calculate_rsi": "Relative Strength Index (RSI)",
            "calculate_supertrend": "SuperTrend",
            "calculate_macd": "MACD",
            "calculate_bollinger_bands": "Bollinger Bands",
            "calculate_atr": "Average True Range (ATR)",
            "calculate_vwap": "Volume Weighted Average Price (VWAP)",
            "calculate_donchian_channels": "Donchian Channels",
            "calculate_adx": "Average Directional Index (ADX)",
            "calculate_stochastic": "Stochastic Oscillator",
            "calculate_keltner_channels": "Keltner Channels"
        }
        for call_name in visitor.detected_calls:
            if call_name in known_ind_patterns:
                detected_indicators.append(known_ind_patterns[call_name])
            elif "ema" in call_name.lower():
                detected_indicators.append("EMA")
            elif "rsi" in call_name.lower():
                detected_indicators.append("RSI")
            elif "vwap" in call_name.lower():
                detected_indicators.append("VWAP")

        if not detected_indicators:
            warnings.append("No standard technical indicator calculation calls detected in strategy logic.")

        # 4. Perform Sandboxed Dry-Run if security checks passed
        if not errors:
            dry_run_success, dry_run_msg, dry_run_result = cls._dry_run_python_strategy(code)
            if not dry_run_success:
                if "timed out" in dry_run_msg.lower() or "resource limit" in dry_run_msg.lower():
                    errors.append(f"Security/Resource Error: {dry_run_msg}")
                else:
                    warnings.append(f"Dry-run simulation notice: {dry_run_msg}")

        # Compute Quality Score
        score = 100.0
        score -= len(errors) * 35.0
        score -= len(warnings) * 10.0
        score = max(0.0, min(100.0, score))

        content_hash = hashlib.sha256(code.encode()).hexdigest()[:16]

        # Extract entry/exit text summaries from docstrings or code comments
        entry_match = re.search(r"entry[_\s]*rules?[:\s=]+([^\n]+)", code, re.IGNORECASE)
        exit_match = re.search(r"exit[_\s]*rules?[:\s=]+([^\n]+)", code, re.IGNORECASE)

        entry_preview = entry_match.group(1).strip(" '\"") if entry_match else "Extracted from Python evaluate() signal logic"
        exit_preview = exit_match.group(1).strip(" '\"") if exit_match else "Extracted from stop_loss and target parameters"

        stop_loss_pct = float(metadata.get("stop_loss_pct", 0.5))
        target_pct = float(metadata.get("target_pct", 1.2))

        parsed_preview = {
            "entry_rules": entry_preview,
            "exit_rules": exit_preview,
            "detected_indicators": detected_indicators,
            "detected_parameters": {
                "has_evaluate_func": visitor.has_evaluate_func,
                "has_strategy_class": visitor.has_strategy_class,
                "calls_count": len(visitor.detected_calls)
            },
            "risk_limits": {
                "stop_loss_pct": stop_loss_pct,
                "target_pct": target_pct,
                "max_capital": float(metadata.get("max_capital", 35000.0)),
                "max_drawdown_pct": float(metadata.get("max_drawdown_pct", 2.0))
            },
            "entry_conditions_count": max(1, len(detected_indicators)),
            "exit_conditions_count": 2
        }

        name = metadata.get("name") or "Imported Python Strategy"
        category = metadata.get("category") or "Quantitative Python Alpha"
        timeframe = metadata.get("timeframe") or "5m"
        instruments = metadata.get("supported_instruments") or ["NIFTY 50", "BANKNIFTY"]

        normalized = {
            "name": name,
            "category": category,
            "timeframe": timeframe,
            "supported_instruments": instruments,
            "entry_rules": entry_preview,
            "exit_rules": exit_preview,
            "indicators": detected_indicators,
            "stop_loss_pct": stop_loss_pct,
            "target_pct": target_pct,
            "source_format": "PYTHON",
            "raw_source": code
        }

        return {
            "is_valid": len(errors) == 0,
            "format": "PYTHON",
            "score": round(score, 1),
            "errors": errors,
            "warnings": warnings,
            "content_hash": content_hash,
            "normalized_strategy": normalized,
            "parsed_rules_preview": parsed_preview,
            "compatible_instruments": instruments,
            "compatible_timeframes": [timeframe] if timeframe else ["1m", "5m", "15m"],
            "dry_run_output": dry_run_result
        }

    @classmethod
    def _dry_run_python_strategy(cls, code: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Executes Python code in an isolated subprocess environment with stripped credentials
        and strict timeout enforcement to prevent resource exhaustion or arbitrary host execution.
        """
        from server.strategy_sandbox import execute_isolated_strategy

        # Synthesize a safe 50-candle mock dataset
        sample_candles = []
        base_p = 24500.0
        now_ts = int(time.time())
        for i in range(50):
            p = base_p + (math.sin(i / 5.0) * 80.0)
            sample_candles.append({
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now_ts - (50 - i) * 60)),
                "open": round(p - 5.0, 2),
                "high": round(p + 15.0, 2),
                "low": round(p - 15.0, 2),
                "close": round(p + 5.0, 2),
                "volume": 25000 + (i * 200)
            })

        sample_market_data = {
            "symbol": "NIFTY 50",
            "candles": sample_candles,
            "current_price": sample_candles[-1]["close"],
            "position_side": None
        }

        # Execute in isolated subprocess with 2.0s resource limit
        return execute_isolated_strategy(code, sample_market_data, timeout_seconds=2.0)

    @classmethod
    def _validate_json_strategy(cls, raw_json: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Validates a strategy defined as structured JSON."""
        errors: List[str] = []
        warnings: List[str] = []

        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            return {
                "is_valid": False,
                "format": "JSON",
                "score": 0.0,
                "errors": [f"JSON format error: {str(e)}"],
                "warnings": [],
                "content_hash": hashlib.sha256(raw_json.encode()).hexdigest()[:16],
                "normalized_strategy": {},
                "parsed_rules_preview": {},
                "compatible_instruments": [],
                "compatible_timeframes": []
            }

        if not isinstance(data, dict):
            return {
                "is_valid": False,
                "format": "JSON",
                "score": 0.0,
                "errors": ["JSON root must be an object/dict."],
                "warnings": [],
                "content_hash": hashlib.sha256(raw_json.encode()).hexdigest()[:16],
                "normalized_strategy": {},
                "parsed_rules_preview": {},
                "compatible_instruments": [],
                "compatible_timeframes": []
            }

        # Validate required fields
        name = str(data.get("name") or metadata.get("name") or "").strip()
        if not name:
            errors.append("Strategy 'name' is required.")

        category = str(data.get("category") or metadata.get("category") or "Custom Alpha").strip()
        entry_rules = data.get("entry_rules") or data.get("rules", {}).get("entry", "")
        exit_rules = data.get("exit_rules") or data.get("rules", {}).get("exit", "")

        if not entry_rules:
            errors.append("Entry rules ('entry_rules') are required.")
        if not exit_rules:
            warnings.append("Exit rules not explicitly provided. System will default to dynamic trailing ATR stop.")

        indicators = data.get("indicators") or []
        if isinstance(indicators, str):
            indicators = [indicators]

        timeframe = data.get("timeframe") or metadata.get("timeframe") or "5m"
        instruments = data.get("supported_instruments") or data.get("instruments") or metadata.get("supported_instruments") or ["NIFTY 50"]
        if isinstance(instruments, str):
            instruments = [instruments]

        sl = float(data.get("sl_ratio") or data.get("stop_loss_pct") or metadata.get("stop_loss_pct", 0.5))
        tgt = float(data.get("target_multiple") or data.get("target_pct") or metadata.get("target_pct", 1.5))

        if sl <= 0 or sl > 10.0:
            warnings.append(f"Unusual stop-loss percentage: {sl}%. Standard ranges are 0.1% to 3.0%.")
        if tgt <= 0:
            errors.append("Target profit / R:R multiple must be greater than zero.")

        content_hash = hashlib.sha256(raw_json.encode()).hexdigest()[:16]

        score = 100.0 - (len(errors) * 35.0) - (len(warnings) * 10.0)
        score = max(0.0, min(100.0, score))

        parsed_preview = {
            "entry_rules": str(entry_rules),
            "exit_rules": str(exit_rules),
            "detected_indicators": indicators,
            "detected_parameters": data.get("parameters") or {},
            "risk_limits": {
                "stop_loss_pct": sl,
                "target_pct": tgt,
                "max_capital": float(data.get("max_capital", 35000.0)),
                "max_drawdown_pct": float(data.get("max_drawdown_pct", 2.0))
            },
            "entry_conditions_count": len(indicators) if indicators else 1,
            "exit_conditions_count": 2
        }

        normalized = {
            "name": name or "Unnamed JSON Strategy",
            "category": category,
            "timeframe": timeframe,
            "supported_instruments": instruments,
            "entry_rules": str(entry_rules),
            "exit_rules": str(exit_rules),
            "indicators": indicators,
            "stop_loss_pct": sl,
            "target_pct": tgt,
            "source_format": "JSON",
            "raw_source": raw_json
        }

        return {
            "is_valid": len(errors) == 0,
            "format": "JSON",
            "score": round(score, 1),
            "errors": errors,
            "warnings": warnings,
            "content_hash": content_hash,
            "normalized_strategy": normalized,
            "parsed_rules_preview": parsed_preview,
            "compatible_instruments": instruments,
            "compatible_timeframes": [timeframe] if timeframe else ["1m", "5m", "15m"],
            "dry_run_output": None
        }

    @classmethod
    def _validate_structured_strategy(cls, text: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Validates plain structured text or natural-language rules."""
        from server.memory_db import parse_strategy_from_text

        parsed = parse_strategy_from_text(text)
        errors: List[str] = []
        warnings: List[str] = []

        name = metadata.get("name") or parsed.get("name") or "Imported Structured Strategy"
        category = metadata.get("category") or parsed.get("category") or "Custom Alpha"
        timeframe = metadata.get("timeframe") or "5m"
        instruments = metadata.get("supported_instruments") or [parsed.get("asset", "NIFTY 50")]

        entry_rules = metadata.get("entry_rules") or parsed.get("entry_rules", "")
        exit_rules = metadata.get("exit_rules") or parsed.get("exit_rules", "")
        indicators = metadata.get("indicators") or parsed.get("indicators", [])

        if not text.strip() and not entry_rules:
            errors.append("Strategy definition text cannot be empty.")

        sl = float(metadata.get("stop_loss_pct") or parsed.get("stop_loss_pct", 0.5))
        tgt = float(metadata.get("target_pct") or parsed.get("target_risk_reward", 2.0))

        content_hash = hashlib.sha256(text.encode()).hexdigest()[:16]

        score = 90.0 if len(indicators) > 0 else 75.0

        parsed_preview = {
            "entry_rules": entry_rules,
            "exit_rules": exit_rules,
            "detected_indicators": indicators,
            "detected_parameters": {"inferred_asset": parsed.get("asset")},
            "risk_limits": {
                "stop_loss_pct": sl,
                "target_pct": tgt,
                "max_capital": float(metadata.get("max_capital", 35000.0)),
                "max_drawdown_pct": float(metadata.get("max_drawdown_pct", 2.0))
            },
            "entry_conditions_count": max(1, len(indicators)),
            "exit_conditions_count": 2
        }

        normalized = {
            "name": name,
            "category": category,
            "timeframe": timeframe,
            "supported_instruments": instruments,
            "entry_rules": entry_rules,
            "exit_rules": exit_rules,
            "indicators": indicators,
            "stop_loss_pct": sl,
            "target_pct": tgt,
            "source_format": "STRUCTURED",
            "raw_source": text
        }

        return {
            "is_valid": len(errors) == 0,
            "format": "STRUCTURED",
            "score": score,
            "errors": errors,
            "warnings": warnings,
            "content_hash": content_hash,
            "normalized_strategy": normalized,
            "parsed_rules_preview": parsed_preview,
            "compatible_instruments": instruments,
            "compatible_timeframes": [timeframe],
            "dry_run_output": None
        }


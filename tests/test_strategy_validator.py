"""
CHINTU AI TRADING SYSTEM - Strategy Validator & AST Security Test Suite
Tests AST security policies, rejection of dangerous imports/builtins/dunders,
look-ahead leakage detection, and JSON/Structured schema parsing.
"""

import pytest
from server.strategy_validator import StrategyValidator


class TestASTSecurityAndSandboxing:
    """Tests static AST analysis for malicious code and sandbox escaping."""

    def test_reject_dangerous_os_import(self):
        bad_code = """
import os
def evaluate(m):
    os.system('rm -rf /')
    return {'decision': 'BUY'}
"""
        res = StrategyValidator.validate(bad_code)
        assert res["is_valid"] is False
        assert any("Disallowed import 'os'" in err for err in res["errors"])

    def test_reject_dangerous_subprocess_import(self):
        bad_code = """
from subprocess import Popen
def evaluate(m):
    Popen(['calc.exe'])
    return {'decision': 'BUY'}
"""
        res = StrategyValidator.validate(bad_code)
        assert res["is_valid"] is False
        assert any("Disallowed import-from 'subprocess'" in err for err in res["errors"])

    def test_reject_socket_network_access(self):
        bad_code = """
import socket
def evaluate(m):
    s = socket.socket()
    return {'decision': 'BUY'}
"""
        res = StrategyValidator.validate(bad_code)
        assert res["is_valid"] is False
        assert any("Disallowed import 'socket'" in err for err in res["errors"])

    def test_reject_dangerous_eval_builtin(self):
        bad_code = """
def evaluate(m):
    cmd = "__import__('os').system('dir')"
    eval(cmd)
    return {'decision': 'BUY'}
"""
        res = StrategyValidator.validate(bad_code)
        assert res["is_valid"] is False
        assert any("Disallowed dangerous builtin call 'eval()'" in err for err in res["errors"])

    def test_reject_open_file_access(self):
        bad_code = """
def evaluate(m):
    with open('/etc/passwd', 'r') as f:
        pass
    return {'decision': 'BUY'}
"""
        res = StrategyValidator.validate(bad_code)
        assert res["is_valid"] is False
        assert any("Disallowed dangerous builtin call 'open()'" in err for err in res["errors"])

    def test_reject_dunder_sandbox_escape(self):
        bad_code = """
def evaluate(m):
    classes = ().__class__.__bases__[0].__subclasses__()
    return {'decision': 'BUY'}
"""
        res = StrategyValidator.validate(bad_code)
        assert res["is_valid"] is False
        assert any("Access to private dunder attribute" in err for err in res["errors"])

    def test_detect_temporal_lookahead_leakage(self):
        lookahead_code = """
def evaluate(m):
    candles = m.get('candles', [])
    for i in range(len(candles) - 1):
        future_candle = candles[i + 1]
    return {'decision': 'HOLD', 'reason': 'Testing lookahead', 'indicators': {}, 'confidence': 0.5}
"""
        res = StrategyValidator.validate(lookahead_code)
        # Should flag a warning for look-ahead
        assert any("look-ahead data leakage" in w for w in res["warnings"])

    def test_accept_valid_python_quantitative_strategy(self):
        good_code = """
def evaluate(market_data):
    candles = market_data.get('candles', [])
    if len(candles) < 30:
        return {'decision': 'HOLD', 'reason': 'Warming up', 'indicators': {}, 'confidence': 0.0}

    closes = [c['close'] for c in candles]
    rsi = calculate_rsi(closes, 14)
    curr_close = closes[-1]

    if rsi < 30.0:
        return {
            'decision': 'BUY',
            'reason': f'Oversold rebound (RSI {rsi})',
            'indicators': {'rsi': rsi, 'close': curr_close},
            'confidence': 0.85
        }
    elif rsi > 70.0:
        return {
            'decision': 'SELL',
            'reason': f'Overbought pullback (RSI {rsi})',
            'indicators': {'rsi': rsi, 'close': curr_close},
            'confidence': 0.85
        }
    return {
        'decision': 'HOLD',
        'reason': f'RSI in neutral band ({rsi})',
        'indicators': {'rsi': rsi},
        'confidence': 0.50
    }
"""
        res = StrategyValidator.validate(good_code, metadata={"name": "Safe Quantitative RSI"})
        assert res["is_valid"] is True
        assert res["score"] >= 90.0
        assert len(res["errors"]) == 0
        assert res["dry_run_output"] is not None
        assert res["dry_run_output"]["decision"] in ["BUY", "SELL", "HOLD"]


class TestJSONAndStructuredValidation:
    """Tests JSON and structured text parsing and validation."""

    def test_valid_json_strategy(self):
        json_data = """
{
    "name": "ORB Breakout",
    "category": "Momentum Breakout",
    "timeframe": "15m",
    "supported_instruments": ["NIFTY 50", "BANKNIFTY"],
    "entry_rules": "Breakout above 15m high with volume expansion.",
    "exit_rules": "Trail stop behind 9 EMA.",
    "indicators": ["15m High", "Volume SMA", "9 EMA"],
    "stop_loss_pct": 0.35,
    "target_pct": 1.5
}
"""
        res = StrategyValidator.validate(json_data, metadata={"source_format": "JSON"})
        assert res["is_valid"] is True
        assert res["format"] == "JSON"
        assert res["score"] >= 90.0
        assert res["normalized_strategy"]["name"] == "ORB Breakout"

    def test_invalid_json_strategy(self):
        bad_json = "{ invalid_json: true, }"
        res = StrategyValidator.validate(bad_json, metadata={"source_format": "JSON"})
        assert res["is_valid"] is False
        assert any("JSON format error" in err for err in res["errors"])

    def test_structured_text_strategy(self):
        text = "Strategy for NIFTY 50 based on 9 EMA and 21 EMA crossover on 5m candles. Stop loss 0.40% and target 1:2 R:R."
        res = StrategyValidator.validate(text, metadata={"source_format": "STRUCTURED"})
        assert res["is_valid"] is True
        assert res["format"] == "STRUCTURED"
        assert res["normalized_strategy"]["stop_loss_pct"] == 0.40


class TestSubprocessSandboxIsolation:
    """Tests out-of-process subprocess isolation, timeout enforcement, and credential shielding."""

    def test_infinite_loop_timeout_protection(self):
        """Verifies that an infinite loop strategy is terminated by timeout and rejected."""
        infinite_loop_code = """
def evaluate(market_data):
    count = 0
    while True:
        count += 1
    return {'decision': 'BUY'}
"""
        from server.strategy_sandbox import execute_isolated_strategy
        ok, msg, res = execute_isolated_strategy(infinite_loop_code, {"candles": []}, timeout_seconds=1.0)
        assert ok is False
        assert "timed out" in msg.lower() or "resource limit" in msg.lower()

        # Test through StrategyValidator
        val_res = StrategyValidator.validate(infinite_loop_code)
        assert val_res["is_valid"] is False
        assert any("timed out" in err.lower() or "resource error" in err.lower() for err in val_res["errors"])

    def test_sandbox_credential_isolation(self):
        """Verifies that host secrets and broker credentials are completely stripped from sandbox worker."""
        import os
        from server.strategy_sandbox import execute_isolated_strategy

        # Inject mock secrets into host process env
        os.environ["SMARTAPI_API_KEY"] = "SECRET_API_KEY_NEVER_LEAK"
        os.environ["TOTP_SECRET"] = "SECRET_TOTP_KEY_NEVER_LEAK"
        os.environ["JWT_TOKEN"] = "SECRET_JWT_KEY_NEVER_LEAK"

        try:
            # Code that evaluates cleanly
            clean_code = """
def evaluate(market_data):
    return {'decision': 'HOLD', 'reason': 'Sandbox safe'}
"""
            ok, msg, res = execute_isolated_strategy(clean_code, {"candles": []}, timeout_seconds=2.0)
            assert ok is True
            assert res["decision"] == "HOLD"
        finally:
            os.environ.pop("SMARTAPI_API_KEY", None)
            os.environ.pop("TOTP_SECRET", None)
            os.environ.pop("JWT_TOKEN", None)



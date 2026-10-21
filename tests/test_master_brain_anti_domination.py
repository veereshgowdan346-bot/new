"""
Unit tests for Master Brain Consensus Anti-Domination Capping & Redistribution.
Verifies:
1. Configurable max contribution cap (default 25%, max_single_bot_weight_pct = 0.25).
2. Deterministic policy for N < 4 bots: effective_bot_cap = max(max_cap_pct, 1.0 / N).
3. Water-filling redistribution mathematical correctness and sum invariant (= 1.0).
4. Edge cases: N = 1, 2, 3, 4, 5, 14 bots.
5. Exact boundary conditions: bot at exactly 25.0% does not trigger redistribution.
6. Zero, negative, and NaN/Inf weight handling.
7. Decision metadata and individual bot field presence.
8. Quorum protection: preventing a single high-weight bot from vetoing or forcing consensus against the fleet.
"""

import math
import pytest
from server.master_brain import MasterBrain, DEFAULT_MASTER_BRAIN_CONFIG, ACTION_BUY, ACTION_SELL, ACTION_NO_TRADE


class TestMasterBrainAntiDominationHelper:
    """Tests the static helper method apply_anti_domination_cap directly."""

    def test_single_bot_effective_cap(self):
        """1 bot: effective cap = 1.0, not capped."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([1.5], max_cap_pct=0.25)
        assert len(shares) == 1
        assert shares[0] == pytest.approx(1.0, abs=1e-4)
        assert cap == 1.0
        assert any_capped is False
        assert caps == [False]
        assert "effective_bot_cap=100.00%" in policy

    def test_two_bots_effective_cap_equal(self):
        """2 bots: equal weights -> 50% each, effective cap = 0.50, not capped."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([1.0, 1.0], max_cap_pct=0.25)
        assert len(shares) == 2
        assert shares == [0.5, 0.5]
        assert cap == 0.50
        assert any_capped is False
        assert caps == [False, False]

    def test_two_bots_unequal_capped(self):
        """2 bots: raw [80, 20] -> Bot 0 capped at 50%, remaining 50% to Bot 1."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([80.0, 20.0], max_cap_pct=0.25)
        assert len(shares) == 2
        assert cap == 0.50
        assert any_capped is True
        assert caps[0] is True
        assert caps[1] is False
        assert shares[0] <= 0.50 + 1e-4
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0
        assert shares == [0.5, 0.5]

    def test_three_bots_effective_cap_capped(self):
        """3 bots: effective cap = 0.3333. Dominant bot capped at 33.33%."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([80.0, 10.0, 10.0], max_cap_pct=0.25)
        assert len(shares) == 3
        assert cap == pytest.approx(0.3333, abs=1e-4)
        assert any_capped is True
        assert caps[0] is True
        assert shares[0] <= cap + 1e-4
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0

    def test_four_bots_exact_boundary(self):
        """4 bots with equal weights (25% each): exact boundary does NOT trigger capping."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([1.0, 1.0, 1.0, 1.0], max_cap_pct=0.25)
        assert len(shares) == 4
        assert cap == 0.25
        assert any_capped is False
        assert all(c is False for c in caps)
        assert shares == [0.25, 0.25, 0.25, 0.25]
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0

    def test_four_bots_one_dominant_capped(self):
        """4 bots with raw [70, 10, 10, 10]: Bot 0 capped at 25%, others share remaining 75% (25% each)."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([70.0, 10.0, 10.0, 10.0], max_cap_pct=0.25)
        assert cap == 0.25
        assert any_capped is True
        assert caps[0] is True
        assert shares[0] == 0.25
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0
        assert shares == [0.25, 0.25, 0.25, 0.25]

    def test_five_bots_water_filling_redistribution(self):
        """5 bots: raw [60, 10, 10, 10, 10]. Bot 0 capped at 25%, remaining 75% split equally (18.75% each)."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([60.0, 10.0, 10.0, 10.0, 10.0], max_cap_pct=0.25)
        assert cap == 0.25
        assert any_capped is True
        assert caps[0] is True
        assert all(c is False for c in caps[1:])
        assert shares[0] == 0.25
        assert shares[1] == 0.1875
        assert shares[2] == 0.1875
        assert shares[3] == 0.1875
        assert shares[4] == 0.1875
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0

    def test_five_bots_multi_stage_water_filling(self):
        """5 bots: raw [50, 40, 5, 3, 2]. Bots 0 and 1 capped at 25% each; remaining 50% split proportionally."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([50.0, 40.0, 5.0, 3.0, 2.0], max_cap_pct=0.25)
        assert cap == 0.25
        assert any_capped is True
        assert caps[0] is True
        assert caps[1] is True
        assert shares[0] == 0.25
        assert shares[1] == 0.25
        # Remaining 50% distributed among [5, 3, 2] (total 10):
        # Bot 2 gets 50% * 5/10 = 25% (at boundary)
        # Bot 3 gets 50% * 3/10 = 15%
        # Bot 4 gets 50% * 2/10 = 10%
        assert shares[2] <= 0.25 + 1e-4
        assert shares[3] == pytest.approx(0.15, abs=1e-4)
        assert shares[4] == pytest.approx(0.10, abs=1e-4)
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0

    def test_fourteen_bots_all_contributing(self):
        """14 canonical bots: verify no bot exceeds 25% even if one bot has massive weight."""
        weights = [100.0] + [5.0] * 13
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap(weights, max_cap_pct=0.25)
        assert cap == 0.25
        assert any_capped is True
        assert caps[0] is True
        assert shares[0] == 0.25
        for s in shares:
            assert s <= 0.25 + 1e-4
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0

    def test_zero_negative_and_nan_weights(self):
        """Gracefully sanitizes non-finite, zero, and negative weights."""
        weights = [float('nan'), -5.0, 0.0, 10.0, 10.0]
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap(weights, max_cap_pct=0.25)
        assert cap == 0.25
        # The two positive bots each get 50% raw share, which exceeds 25% cap, so both get capped at 25%
        # Remaining 50% is divided equally among remaining bots
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0
        for s in shares:
            assert s <= 0.25 + 1e-4

    def test_all_zero_weights(self):
        """If all weights are zero, equal distribution is returned without errors."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([0.0, 0.0, 0.0], max_cap_pct=0.25)
        assert len(shares) == 3
        assert any_capped is False
        assert pytest.approx(sum(shares), abs=1e-4) == 1.0

    def test_empty_weights(self):
        """Empty input returns empty lists without error."""
        shares, caps, cap, any_capped, policy = MasterBrain.apply_anti_domination_cap([], max_cap_pct=0.25)
        assert shares == []
        assert caps == []
        assert any_capped is False


class TestMasterBrainFleetConsensusAntiDomination:
    """Tests fleet consensus evaluation with anti-domination end-to-end."""

    def test_consensus_metadata_and_bot_fields_present(self):
        """Verifies all required metadata and individual bot fields are present in decision."""
        mb = MasterBrain({"min_quorum_score": 0.60, "max_single_bot_weight_pct": 0.25})

        signals = [
            mb.normalize_signal(1, "NIFTY 50", "BUY", confidence=0.85, entry=24500, stop_loss=24350, target=24900),
            mb.normalize_signal(2, "NIFTY 50", "BUY", confidence=0.80, entry=24500, stop_loss=24350, target=24900),
            mb.normalize_signal(3, "NIFTY 50", "BUY", confidence=0.75, entry=24500, stop_loss=24350, target=24900),
            mb.normalize_signal(4, "NIFTY 50", "BUY", confidence=0.70, entry=24500, stop_loss=24350, target=24900),
            mb.normalize_signal(5, "NIFTY 50", "SELL", confidence=0.60, entry=24500, stop_loss=24650, target=24300),
        ]

        decision = mb.evaluate_fleet_consensus("NIFTY 50", signals, market_regime="NEUTRAL")

        # Decision metadata
        assert "anti_domination_applied" in decision
        assert "max_single_bot_weight_pct" in decision
        assert decision["max_single_bot_weight_pct"] == 0.25
        assert "effective_bot_cap" in decision
        assert decision["effective_bot_cap"] == 0.25
        assert "anti_domination_policy" in decision
        assert isinstance(decision["anti_domination_policy"], str)

        # Individual bot fields
        for bot in decision["contributing_bots"]:
            assert "raw_weight" in bot
            assert "effective_weight" in bot
            assert "normalized_weight" in bot
            assert "capped_weight" in bot
            assert "cap_applied" in bot
            assert isinstance(bot["cap_applied"], bool)
            assert bot["capped_weight"] <= decision["effective_bot_cap"] + 1e-4

        # Sum invariant: sum of capped_weight across all contributing bots == 1.0
        total_capped = sum(b["capped_weight"] for b in decision["contributing_bots"])
        assert pytest.approx(total_capped, abs=1e-3) == 1.0

    def test_anti_domination_prevents_single_bot_hijacking(self):
        """
        Anti-domination prevents a single rogue/super-high weight bot from hijacking consensus.
        Setup: 1 dominant BUY bot (base weight / confidence artificially high) vs 4 SELL bots.
        Without cap: BUY bot could have 70% share and force BUY.
        With cap (25%): BUY bot is capped at 25%, SELL bots retain 75% -> Quorum is SELL!
        """
        mb = MasterBrain({"min_quorum_score": 0.60, "max_single_bot_weight_pct": 0.25})

        # Artificially create 5 signals:
        # Bot 1 has BUY with huge confidence
        # Bots 2, 3, 4, 5 have SELL
        sig1 = mb.normalize_signal(1, "NIFTY 50", "BUY", confidence=0.95, entry=24500, stop_loss=24350, target=24900)
        sig2 = mb.normalize_signal(2, "NIFTY 50", "SELL", confidence=0.65, entry=24500, stop_loss=24650, target=24300)
        sig3 = mb.normalize_signal(3, "NIFTY 50", "SELL", confidence=0.65, entry=24500, stop_loss=24650, target=24300)
        sig4 = mb.normalize_signal(4, "NIFTY 50", "SELL", confidence=0.65, entry=24500, stop_loss=24650, target=24300)
        sig5 = mb.normalize_signal(5, "NIFTY 50", "SELL", confidence=0.65, entry=24500, stop_loss=24650, target=24300)

        # Emulate high performance multiplier on Bot 1 to give it disproportionate raw weight
        def mock_rolling(bot_id, **kwargs):
            if bot_id == 1:
                return {"perf_multiplier": 2.5, "win_rate_pct": 80.0, "total_trades": 20, "sample_size_sufficient": True}
            return {"perf_multiplier": 0.5, "win_rate_pct": 30.0, "total_trades": 20, "sample_size_sufficient": True}

        mb.get_rolling_bot_performance = mock_rolling

        decision = mb.evaluate_fleet_consensus("NIFTY 50", [sig1, sig2, sig3, sig4, sig5], market_regime="TRENDING_BULL")

        # Bot 1 was capped!
        bot1 = next(b for b in decision["contributing_bots"] if b["bot_id"] == 1)
        assert bot1["cap_applied"] is True
        assert bot1["capped_weight"] <= 0.25 + 1e-4
        assert decision["anti_domination_applied"] is True

        # Total SELL share = sum of bots 2, 3, 4, 5 = 75%
        sell_share = sum(b["capped_weight"] for b in decision["contributing_bots"] if b["action"] == ACTION_SELL)
        assert sell_share >= 0.60
        # The fleet achieves SELL consensus despite Bot 1's massive individual weight!
        assert decision["decision"] in (ACTION_SELL, ACTION_NO_TRADE) # May be NO_TRADE if friction gate rejects, but NOT BUY!
        assert decision["decision"] != ACTION_BUY

    def test_anti_domination_configurable_cap(self):
        """Verifies configurable cap parameter (e.g. 15% instead of 25%)."""
        mb = MasterBrain({"min_quorum_score": 0.60, "max_single_bot_weight_pct": 0.15})
        assert mb.config["max_single_bot_weight_pct"] == 0.15

        signals = [
            mb.normalize_signal(i, "NIFTY 50", "BUY", confidence=0.80, entry=24500, stop_loss=24350, target=24900)
            for i in range(1, 9) # 8 bots
        ]
        decision = mb.evaluate_fleet_consensus("NIFTY 50", signals, market_regime="NEUTRAL")
        assert decision["max_single_bot_weight_pct"] == 0.15
        assert decision["effective_bot_cap"] == 0.15
        for b in decision["contributing_bots"]:
            assert b["capped_weight"] <= 0.15 + 1e-4


"""Offline unit tests; no API keys, network calls or pandas mocks required."""
import tempfile
import unittest
from pathlib import Path
import sys
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import collector


class TestBreadth(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cache = Path(self.temp.name)
        dates = pd.bdate_range("2025-01-01", periods=220).strftime("%Y-%m-%d").tolist()
        self.dates = dates
        self.trade_date = dates[-1]
        self.create("2330", dates, 100.0)
        self.create("2317", dates, 120.0)

    def tearDown(self):
        self.temp.cleanup()

    def create(self, sid, dates, close):
        pd.DataFrame({"date": dates, "close": [close] * len(dates)}).to_csv(
            self.cache / (sid + ".csv"), index=False
        )

    def test_complete_reference_calendar(self):
        data = collector.summarize(self.cache, self.trade_date, 2)
        self.assertEqual(data["eligibleCount"], 2)
        self.assertAlmostEqual(data["coverage"], 1)

    def test_missing_middle_session_excluded_even_if_200_rows_remain(self):
        # 219 rows still >200, but one of the benchmark's most recent 200 sessions is gone.
        dates = [x for x in self.dates if x != self.dates[-30]]
        self.create("2317", dates, 120)
        data = collector.summarize(self.cache, self.trade_date, 2)
        self.assertEqual(data["eligibleCount"], 1)
        self.assertEqual(data["excludedCachedCount"], 1)

    def test_missing_reference_disables_ready_state(self):
        (self.cache / "2330.csv").unlink()
        data = collector.summarize(self.cache, self.trade_date, 2)
        self.assertEqual(data["status"], "partial")
        self.assertEqual(data["eligibleCount"], 0)

    def test_minimum_finmind_interval(self):
        self.assertGreaterEqual(collector.FINMIND_MIN_GAP, 7)


if __name__ == "__main__":
    unittest.main()

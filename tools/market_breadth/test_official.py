import sqlite3
import tempfile
import unittest
from pathlib import Path
import official


class OfficialTests(unittest.TestCase):
    def test_dates(self):
        for raw in ('1151116', '115/11/16', '20261116', '2026-11-16'):
            self.assertEqual(official.trade_date(raw), '2026-11-16')
        for raw in ('', '1151332', 'yesterday'):
            with self.assertRaises(ValueError):
                official.trade_date(raw)

    def test_codes_and_prices(self):
        rows = [{'id': sid, 'p': p} for sid, p in [('2330', '1,000'), ('0050', '100'), ('12345', '2'), ('2317', '--'), ('2345', 'NaN')]]
        self.assertEqual(official.prices(rows, 'id', 'p'), {'2330': 1000})

    def test_snapshot_mixed_dates_rejected(self):
        with self.assertRaises(ValueError):
            official.snapshot([{'Date': '1151116'}, {'Date': '1151117'}], 'twse')

    def test_history_strict_date_and_table_selection(self):
        obj = {'stat': 'OK', 'date': '20260930', 'tables': [{'fields': ['指數'], 'data': [['100']]}, {'fields': ['證券代號', '收盤價'], 'data': [['2330', '100']]}]}
        self.assertEqual(official.history(obj, 'twse', '2026-09-30')[1], {'2330': 100})
        for date in ('2026-10-01', ''):
            with self.assertRaises(ValueError):
                official.history(obj, 'twse', date)
        obj.pop('date')
        with self.assertRaises(ValueError):
            official.history(obj, 'twse', '2026-09-30')

    def test_tpex_schema(self):
        obj = {'stat': 'ok', 'date': '20260930', 'tables': [{'fields': ['代號', '收盤'], 'data': [['6488', '200']]}]}
        self.assertEqual(official.history(obj, 'tpex', '2026-09-30')[1], {'6488': 200})

    def test_snapshot_tpex_and_duplicate_codes(self):
        rows = [{'Date': '1151116', 'SecuritiesCompanyCode': '6488', 'Close': '200'}]
        self.assertEqual(official.snapshot(rows, 'tpex'), ('2026-11-16', {'6488': 200}))
        with self.assertRaises(ValueError):
            official.snapshot(rows + rows, 'tpex')

    def test_history_malformed_rows_rejected(self):
        obj = {'stat': 'OK', 'date': '20260930', 'tables': [{'fields': ['代號', '收盤'], 'data': [['6488']]}]}
        with self.assertRaises(ValueError):
            official.history(obj, 'tpex', '2026-09-30')

    def test_atomic_batch_replacement_and_market_isolation(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'p.db'
            official.save_batch(path, 'twse', '2026-09-30', {'2330': 100})
            official.save_batch(path, 'tpex', '2026-09-30', {'6488': 200})
            official.save_batch(path, 'twse', '2026-09-30', {'2317': 300})
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM prices').fetchone()[0], 2)
                self.assertEqual(db.execute("SELECT code FROM prices WHERE market='twse'").fetchone()[0], '2317')

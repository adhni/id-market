"""Validate source normalization before any bundled files are replaced."""
import copy
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("refresh_fundamentals", Path(__file__).resolve().parents[1] / "scripts/refresh_fundamentals.py")
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)


class FundamentalsTests(unittest.TestCase):
    def setUp(self):
        self.catalog = [{"id": "BBCA", "category": "stock", "country": "Indonesia"},
                        {"id": "AAPL", "category": "stock", "country": "United States"},
                        {"id": "IHSG", "category": "index", "country": "Indonesia"}]
        self.payload = {"results": [{"stockCode": "BBCA", "marketCapital": 741406969462500,
                                    "per": -2.5, "pbv": 2.77, "roe": 0, "roa": 3.5, "der": 5.1,
                                    "sector": "Financials", "industry": "Banks", "indexCode": "LQ45, IDX30, LQ45, MBX"}]}

    def normalize(self, payload):
        return refresh.normalize(payload, self.catalog, "2026-10-16T09:47:41+00:00")

    def test_preserves_units_losses_zero_and_missing(self):
        stock = self.normalize(self.payload)["stocks"][0]
        self.assertEqual(stock["market_cap_idr"], 741406969462500)
        self.assertEqual(stock["pe_ttm"], -2.5)
        self.assertEqual(stock["roe_pct"], 0)
        self.assertEqual(stock["roa_pct"], 3.5)
        self.assertEqual(stock["liabilities_equity"], 5.1)
        self.assertEqual(stock["industry"], "Banks")
        self.assertEqual(stock["index_memberships"], ["IDX30", "LQ45", "MBX"])
        self.payload["results"][0]["per"] = None
        self.assertIsNone(self.normalize(self.payload)["stocks"][0]["pe_ttm"])

    def test_unknown_membership_is_distinct_from_empty(self):
        self.payload["results"][0]["indexCode"] = None
        self.assertIsNone(self.normalize(self.payload)["stocks"][0]["index_memberships"])
        self.payload["results"][0]["indexCode"] = ""
        self.assertEqual(self.normalize(self.payload)["stocks"][0]["index_memberships"], [])

    def test_incomplete_changed_duplicate_and_invalid_responses_fail(self):
        for payload in [None, {}, {"results": []}, {"results": [None]}, {"results": [dict(self.payload["results"][0], stockCode="OTHER")]},
                        {"results": self.payload["results"] * 2}]:
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.normalize(payload)
        for field, value in [("marketCapital", 0), ("per", "12.9"), ("roe", True), ("pbv", float("nan")),
                             ("roa", "3.5%"), ("der", False), ("industry", []), ("sector", ""), ("indexCode", ["ISSI"])]:
            payload = copy.deepcopy(self.payload)
            payload["results"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.normalize(payload)
        del self.payload["results"][0]["per"]
        with self.assertRaises(ValueError):
            self.normalize(self.payload)

    def test_embed_requires_one_block_and_escapes_script_terminators(self):
        snapshot = self.normalize(self.payload)
        snapshot["source_name"] = "</script><script>bad</script>"
        html = '<script id="embedded-fundamentals-json" type="application/json">null</script>'
        _, embedded = refresh.embedded_html(html, snapshot)
        self.assertEqual(embedded.count("</script>"), 1)
        for invalid in ["no block", html + html]:
            with self.assertRaises(ValueError):
                refresh.embedded_html(invalid, snapshot)

    def test_bad_embed_keeps_both_existing_files(self):
        original_root = refresh.ROOT
        try:
            with tempfile.TemporaryDirectory() as directory:
                refresh.ROOT = Path(directory)
                (refresh.ROOT / "data").mkdir()
                html = refresh.ROOT / "index.html"
                data = refresh.ROOT / "data/fundamentals.json"
                html.write_text("missing snapshot block")
                data.write_text("previous snapshot")
                with self.assertRaises(ValueError):
                    refresh.save(self.normalize(self.payload))
                self.assertEqual(html.read_text(), "missing snapshot block")
                self.assertEqual(data.read_text(), "previous snapshot")
        finally:
            refresh.ROOT = original_root


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Refresh IDX fundamentals and classifications for the catalog's Indonesian stocks."""
import argparse
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = "https://www.idx.id/id/investhub/stock-screener"
DATA_URL = "https://www.idx.id/support/stock-screener/api/v1/stock-screener/get?lang=en"
DEFINITIONS_URL = "https://www.idx.id/id/investhub/stock-screener-column-explanation"
FIELDS = {"market_cap_idr": "marketCapital", "pe_ttm": "per", "pb": "pbv", "roe_pct": "roe",
          "roa_pct": "roa", "liabilities_equity": "der"}


def normalize(payload, catalog, retrieved_at):
    rows = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not rows:
        raise ValueError("IDX response has no stock results")
    wanted = {item["id"] for item in catalog
              if item["category"] == "stock" and item.get("country") == "Indonesia"}
    stocks = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Invalid IDX result row")
        ticker = row.get("stockCode")
        if ticker not in wanted:
            continue
        if ticker in stocks:
            raise ValueError(f"Duplicate IDX result: {ticker}")
        stock = {"series_id": ticker}
        for field, source_field in FIELDS.items():
            if source_field not in row:
                raise ValueError(f"Missing IDX field: {ticker}.{source_field}")
            value = row[source_field]
            if value is not None and (isinstance(value, bool)
                    or not isinstance(value, (int, float)) or not math.isfinite(value)):
                raise ValueError(f"Invalid IDX value: {ticker}.{source_field}")
            if field == "market_cap_idr" and value is not None and value <= 0:
                raise ValueError(f"Invalid market cap: {ticker}")
            stock[field] = value
        for field in ("sector", "industry"):
            if field not in row or (row[field] is not None and
                                     (not isinstance(row[field], str) or not row[field].strip())):
                raise ValueError(f"Invalid or missing IDX classification: {ticker}.{field}")
            stock[field] = row[field].strip() if row[field] is not None else None
        if "indexCode" not in row or (row["indexCode"] is not None and not isinstance(row["indexCode"], str)):
            raise ValueError(f"Invalid or missing IDX index memberships: {ticker}")
        # Preserve null (unknown) separately from an explicitly empty membership list.
        stock["index_memberships"] = sorted({code.strip() for code in row["indexCode"].split(",")
                                               if code.strip()}) if row["indexCode"] is not None else None
        stocks[ticker] = stock
    if wanted - stocks.keys():
        raise ValueError("Missing IDX stocks: " + ", ".join(sorted(wanted - stocks.keys())))
    if not wanted:
        raise ValueError("Catalog contains no Indonesian stocks")
    return {
        "schema_version": 2,
        "retrieved_at": retrieved_at,
        "source_name": "Indonesia Stock Exchange (IDX)",
        "source_url": SOURCE_URL,
        "data_url": DATA_URL,
        "definitions_url": DEFINITIONS_URL,
        # The endpoint does not supply these dates. Do not infer them from retrieval.
        "price_as_of": None,
        "financial_period_end": None,
        "stocks": [stocks[ticker] for ticker in sorted(stocks)],
    }


def embedded_html(html, snapshot):
    # Prevent embedded JSON from terminating its own script element.
    text = json.dumps(snapshot, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    safe = text.replace("<", "\\u003c")
    pattern = r'(<script id="embedded-fundamentals-json" type="application/json">).*?(</script>)'
    html, count = re.subn(pattern, lambda m: m[1] + safe + m[2], html, flags=re.S)
    if count != 1:
        raise ValueError("Missing or duplicate embedded fundamentals block")
    return text, html


def save(snapshot):
    html_path = ROOT / "index.html"
    text, html = embedded_html(html_path.read_text(), snapshot)
    staged = []
    try:
        for path, content in [(ROOT / "data/fundamentals.json", text), (html_path, html)]:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                             delete=False) as handle:
                staged.append((Path(handle.name), path))
                handle.write(content)
            os.chmod(handle.name, 0o644)
        for temporary, path in staged:
            os.replace(temporary, path)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Import a saved response from the IDX data URL instead of downloading.")
    parser.add_argument("--retrieved-at", help="Required with --input: the original collection timestamp, including timezone.")
    args = parser.parse_args()
    if args.input:
        if not args.retrieved_at:
            parser.error("--input requires --retrieved-at with the original collection timestamp")
        payload = json.loads(args.input.read_text())
        collected = dt.datetime.fromisoformat(args.retrieved_at.replace("Z", "+00:00"))
        if collected.tzinfo is None:
            parser.error("--retrieved-at must include a timezone")
    else:
        if args.retrieved_at:
            parser.error("--retrieved-at can only be used with --input")
        blob = subprocess.check_output([
            "curl", "--fail", "--location", "--silent", "--show-error", "--max-time", "60",
            "--retry", "2", "--user-agent", "Mozilla/5.0", DATA_URL,
        ])
        payload = json.loads(blob)
        collected = dt.datetime.now(dt.timezone.utc)
    snapshot = normalize(payload, json.loads((ROOT / "data/catalog.json").read_text()),
                         collected.isoformat(timespec="seconds"))
    save(snapshot)
    print(f"Saved IDX fundamentals, industry and index memberships for {len(snapshot['stocks'])} Indonesian stocks.")
    print("Exact price and financial reporting dates are not supplied by the source.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Refresh bundled monthly data using Python's standard library and curl."""
import argparse
import concurrent.futures
import csv
import datetime as dt
import io
import json
import math
from pathlib import Path
import re
import subprocess
import urllib.parse
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
START = "2010-01-01"
END = dt.date.today().replace(day=1).isoformat()
SERIES_FIELDS = "date series_id display_name category value unit frequency".split()
META_FIELDS = "series_id display_name short_name category sector currency_or_unit source coverage_start coverage_end notes currency country exchange".split()
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def download(url):
    return subprocess.check_output([
        "curl", "--fail", "--location", "--silent", "--show-error",
        "--max-time", "60", "--retry", "2", "--user-agent", "Mozilla/5.0", url,
    ])


def yahoo(item):
    symbol = urllib.parse.quote(item["symbol"], safe="")
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=20y&interval=1mo"
    data = json.loads(download(url))["chart"]["result"][0]
    offset = dt.timezone(dt.timedelta(seconds=data["meta"].get("gmtoffset", 0)))
    values = {}
    for timestamp, value in zip(data["timestamp"], data["indicators"]["quote"][0]["close"]):
        date = dt.datetime.fromtimestamp(timestamp, offset).strftime("%Y-%m-01")
        if START <= date < END and value is not None and math.isfinite(value) and value > 0:
            values[date] = value
    if not values:
        raise ValueError(f"No monthly data for {item['id']}")
    # Prefer the provider's current company name after renames/mergers.
    if item["category"] == "stock" and item.get("country") == "Indonesia":
        item = dict(item, name=data["meta"].get("longName") or item["name"])
    print(f"{item['id']}: {len(values)} months, through {max(values)}", flush=True)
    return item, values, url, "Monthly close from Yahoo Finance; provider split adjustments; excludes cash dividends."


def workbook_rows(blob, sheet_name):
    z = zipfile.ZipFile(io.BytesIO(blob))
    strings = ["".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))]
    workbook = ET.fromstring(z.read("xl/workbook.xml"))
    sheet = next(s for s in workbook.find("s:sheets", NS) if s.get("name") == sheet_name)
    rid = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
    rel = next(r for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels")) if r.get("Id") == rid)
    target = rel.get("Target")
    path = target.lstrip("/") if target.startswith("/") else "xl/" + target
    for row in ET.fromstring(z.read(path)).findall(".//s:row", NS):
        cells = {}
        for cell in row:
            value = cell.find("s:v", NS)
            if value is not None:
                cells[re.sub(r"\d", "", cell.get("r"))] = strings[int(value.text)] if cell.get("t") == "s" else value.text
        yield cells


def commodities(end=END):
    page = download("https://www.worldbank.org/en/research/commodity-markets").decode()
    url = re.search(r'https?[^"\s<>]+CMO-Historical-Data-Monthly\.xlsx', page).group()
    rows = list(workbook_rows(download(url), "Monthly Prices"))
    header = next(row for row in rows if any(str(v).strip() == "Gold" for v in row.values()))
    wanted = {
        "GOLD": ("Gold", "Gold", "USD per troy ounce"),
        "OIL_WTI": ("Crude oil, WTI", "WTI Oil", "USD per barrel"),
        "COAL": ("Coal, Australian", "Coal", "USD per metric ton"),
        "NICKEL": ("Nickel", "Nickel", "USD per metric ton"),
        "PALM_OIL": ("Palm oil", "Palm Oil", "USD per metric ton"),
        "RICE": ("Rice, Thai 5%", "Rice", "USD per metric ton"),
        "SILVER": ("Silver", "Silver", "USD per troy ounce"),
        "COPPER": ("Copper", "Copper", "USD per metric ton"),
        "TIN": ("Tin", "Tin", "USD per metric ton"),
        "COFFEE_ROBUSTA": ("Coffee, Robusta", "Robusta Coffee", "USD per kilogram"),
        "COCOA": ("Cocoa", "Cocoa", "USD per kilogram"),
        "RUBBER": ("Rubber, RSS3", "Rubber", "USD per kilogram"),
    }
    result = []
    for id, (heading, name, unit) in wanted.items():
        col = next(k for k, v in header.items() if v.strip() == heading)
        values = {}
        for row in rows:
            date = row.get("A", "")
            if not re.fullmatch(r"\d{4}M\d{2}", date):
                continue
            date = date.replace("M", "-") + "-01"
            try:
                value = float(row.get(col, ""))
            except ValueError:
                continue
            if START <= date < end and math.isfinite(value) and value > 0:
                values[date] = value
        if not values:
            raise ValueError(f"No commodity data for {id}")
        item = dict(id=id, name=name, category="commodity", sector="Commodity", unit=unit, currency="USD", country="Global", exchange="World Bank")
        notes = f"Global commodity reference price: {heading}. World Bank Pink Sheet monthly average; illustrative comparison with month-end financial prices."
        result.append((item, values, url, notes))
        print(f"{id}: {len(values)} months, through {max(values)}", flush=True)
    return result


def embed():
    path = ROOT / "index.html"
    html = path.read_text()
    for name in ("series", "metadata"):
        csv_text = (ROOT / "data" / f"{name}.csv").read_text()
        pattern = rf'(<script id="embedded-{name}-csv" type="text/plain">).*?(</script>)'
        html, count = re.subn(pattern, lambda m: m[1] + csv_text + m[2], html, flags=re.S)
        if count != 1:
            raise ValueError(f"Missing embedded {name} block")
    path.write_text(html)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--commodities-only", action="store_true", help="Refresh World Bank commodities using the bundled USD/IDR coverage; keep other series.")
    args = parser.parse_args()
    if args.commodities_only:
        with (ROOT / "data/series.csv").open(newline="") as f:
            series = [row for row in csv.DictReader(f) if row["category"] != "commodity"]
        with (ROOT / "data/metadata.csv").open(newline="") as f:
            metadata = [row for row in csv.DictReader(f) if row["category"] != "commodity"]
        # Keep commodity additions inside the exchange-rate history used by the app.
        latest_fx = max(row["date"] for row in series if row["series_id"] == "USDIDR")
        end = (dt.date.fromisoformat(latest_fx) + dt.timedelta(days=32)).replace(day=1).isoformat()
        results = commodities(end=min(end, END))
    else:
        catalog = json.loads((ROOT / "data/catalog.json").read_text())
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(yahoo, catalog))
        # Yahoo has USD/INR history; derive IDR/INR from the two USD pairs.
        usd_idr = next(values for item, values, _, _ in results if item["id"] == "USDIDR")
        for index, (item, values, source, notes) in enumerate(results):
            if item.get("cross_via_usd"):
                values = {date: usd_idr[date] / value for date, value in values.items() if date in usd_idr}
                results[index] = (item, values, source + " ; USDIDR (IDR=X)", "Monthly IDR cross-rate derived as USDIDR divided by the currency per USD.")
        results += commodities()
        series, metadata = [], []
    for item, values, source, notes in results:
        for date, value in sorted(values.items()):
            series.append(dict(zip(SERIES_FIELDS, [date, item["id"], item["name"], item["category"], round(value, 6), item["unit"], "monthly"])))
        metadata.append(dict(zip(META_FIELDS, [item["id"], item["name"], item.get("short_name", item["id"] if item["category"] in ("stock", "index") else item["name"]), item["category"], item["sector"], item["unit"], source, min(values), max(values), notes, item["currency"], item["country"], item["exchange"]])))
    # Write only after all sources have downloaded and parsed successfully.
    for name, fields, rows in [("series", SERIES_FIELDS, series), ("metadata", META_FIELDS, metadata)]:
        path = ROOT / "data" / f"{name}.csv"
        with path.open("w", newline="") as f:
            writer = csv.DictWriter(f, fields, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    embed()
    print(f"Saved {len(metadata)} series and {len(series)} monthly observations.")


if __name__ == "__main__":
    main()

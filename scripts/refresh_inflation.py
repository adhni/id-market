#!/usr/bin/env python3
"""Refresh monthly Indonesian CPI from BIS, including the offline copy."""
import csv
import io
import math
import re
from refresh_data import ROOT, START, END, download

URL = 'https://stats.bis.org/api/v1/data/WS_LONG_CPI/M.ID.628?startPeriod=2010-01&format=csv'


def main():
    rows = []
    for row in csv.DictReader(io.StringIO(download(URL).decode('utf-8-sig'))):
        date = row['TIME_PERIOD'] + '-01'
        if row['FREQ'] != 'M' or row['REF_AREA'] != 'ID' or row['UNIT_MEASURE'] != '628':
            raise ValueError('Unexpected CPI series')
        if START <= date < END and row['OBS_VALUE']:
            value = float(row['OBS_VALUE'])
            if not math.isfinite(value) or value <= 0:
                raise ValueError('Invalid CPI value')
            rows.append({'date': date, 'value': value})
    rows.sort(key=lambda row: row['date'])
    if not rows or len({row['date'] for row in rows}) != len(rows):
        raise ValueError('Missing or duplicate CPI data')
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=['date', 'value'], lineterminator='\n')
    writer.writeheader()
    writer.writerows(rows)
    html_path = ROOT / 'index.html'
    html, count = re.subn(r'(<script id="embedded-inflation-csv" type="text/plain">).*?(</script>)',
                          lambda m: m[1] + buffer.getvalue() + m[2], html_path.read_text(), flags=re.S)
    if count != 1:
        raise ValueError('Missing embedded inflation block')
    (ROOT / 'data/inflation.csv').write_text(buffer.getvalue())
    html_path.write_text(html)
    print(f"Indonesia CPI: {len(rows)} months through {rows[-1]['date']}")


if __name__ == '__main__':
    main()

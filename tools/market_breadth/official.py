"""Free official daily batches. Strict date/schema validation; no signal publishing.

Four-digit non-zero codes are candidates only, NOT a verified ordinary-share pool.
Historical endpoints remain experimental until the probe succeeds in Colab.
"""
import datetime as dt
import math
import re
import sqlite3
from urllib.parse import urlencode


def trade_date(value):
    text = str(value).strip()
    if re.fullmatch(r'\d{7}', text):
        return dt.date(int(text[:3]) + 1911, int(text[3:5]), int(text[5:])).isoformat()
    parts = re.split(r'[-/]', text)
    if len(parts) == 3 and all(p.isdigit() for p in parts):
        year, month, day = map(int, parts)
        return dt.date(year + 1911 if year < 1911 else year, month, day).isoformat()
    if re.fullmatch(r'\d{8}', text):
        return dt.datetime.strptime(text, '%Y%m%d').date().isoformat()
    raise ValueError('Missing or unsupported official trade date')


def prices(rows, code_key, close_key):
    result = {}
    for row in rows:
        sid = str(row.get(code_key, '')).strip()
        if not re.fullmatch(r'[1-9][0-9]{3}', sid):
            continue
        try:
            close = float(str(row[close_key]).replace(',', '').strip())
        except (KeyError, ValueError, TypeError):
            continue  # suspended/no-trade rows must never be zero-filled
        if not math.isfinite(close) or close <= 0:
            continue
        if sid in result:
            raise ValueError('Duplicate official security code')
        result[sid] = close
    if not result:
        raise ValueError('No valid candidate closing prices')
    return result


def snapshot(payload, market):
    if not isinstance(payload, list) or not payload:
        raise ValueError('Expected nonempty official snapshot list')
    key, code, close = ('Date', 'Code', 'ClosingPrice') if market == 'twse' else ('Date', 'SecuritiesCompanyCode', 'Close')
    dates = {trade_date(r.get(key, '')) for r in payload}
    if len(dates) != 1:
        raise ValueError('Mixed official snapshot dates')
    return dates.pop(), prices(payload, code, close)


def history_url(market, date):
    day = dt.date.fromisoformat(date)
    if market == 'twse':
        return 'https://www.twse.com.tw/exchangeReport/MI_INDEX?' + urlencode({'response': 'json', 'date': day.strftime('%Y%m%d'), 'type': 'ALLBUT0999'})
    if market == 'tpex':
        return 'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?' + urlencode({'date': day.strftime('%Y/%m/%d'), 'id': '', 'response': 'json'})
    raise ValueError('Unknown market')


def history(payload, market, requested):
    """Never infer returned date from request, table title, or matching prices."""
    if not isinstance(payload, dict) or str(payload.get('stat', '')).upper() != 'OK':
        raise ValueError('Official historical response not OK (holiday or error)')
    actual = trade_date(payload.get('date', ''))
    if actual != requested:
        raise ValueError('Official response date differs from requested date')
    for table in payload.get('tables', []):
        fields = table.get('fields', [])
        code = next((x for x in ('證券代號', '代號') if x in fields), None)
        close = next((x for x in ('收盤價', '收盤') if x in fields), None)
        if code and close:
            rows = table.get('data', [])
            if any(len(row) != len(fields) for row in rows):
                raise ValueError('Official row width mismatch')
            return actual, prices([dict(zip(fields, row)) for row in rows], code, close)
    raise ValueError('No supported official historical closing-price table')


def save_batch(path, market, date, values):
    """Atomic per-day replacement; retain each date's actual candidate membership."""
    with sqlite3.connect(path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS prices (market TEXT, date TEXT, code TEXT, close REAL, PRIMARY KEY(market,date,code))')
        db.execute('DELETE FROM prices WHERE market=? AND date=?', (market, date))
        db.executemany('INSERT INTO prices VALUES (?,?,?,?)', [(market, date, sid, close) for sid, close in values.items()])


def main():
    import argparse
    import json
    import time
    from probe_official import fetch
    parser = argparse.ArgumentParser(description='Experimental official-only date batch, never publishes market signals')
    parser.add_argument('--dates', nargs='+', required=True, help='Explicit ISO dates; max 10 per run')
    parser.add_argument('--db', default='official-prices.sqlite')
    args = parser.parse_args()
    if not 1 <= len(args.dates) <= 10:
        parser.error('Use 1..10 dates per checkpointed batch')
    for date in args.dates:
        dt.date.fromisoformat(date)
    for date in args.dates:
        for market in ('twse', 'tpex'):
            raw = fetch(history_url(market, date))
            try:
                if 'error' in raw:
                    raise ValueError(raw['error'])
                actual, values = history(raw['json'], market, date)
                save_batch(args.db, market, actual, values)
                report = {'market': market, 'requested': date, 'returned': actual, 'candidates': len(values), 'status': 'parsed_experimental'}
            except (ValueError, KeyError, TypeError) as exc:
                report = {'market': market, 'requested': date, 'status': 'unverified', 'reason': str(exc)[:180], 'http': raw.get('status'), 'bytes': raw.get('bytes')}
            print(json.dumps(report, ensure_ascii=False), flush=True)
            if raw.get('status') in (402, 429):
                return  # no retries or further requests after a quota denial
            time.sleep(7)


if __name__ == '__main__':
    main()

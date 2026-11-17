"""No-token diagnostics for official TWSE / TPEx market-data endpoints.

Run in Colab or your own computer:
    python tools/market_breadth/probe_official.py
Produces JSON only; makes at most five requests. NO FinMind token required.
Probe cannot establish bulk history fitness unless date-scoped results differ.
"""
from __future__ import annotations
import datetime as dt
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

def fetch(url):
    """Read complete response up to 16 MiB; report HTTP and non-JSON errors clearly."""
    try:
        with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 (TW stock breadth research)",
                                            "Accept": "application/json,text/plain,*/*"}), timeout=45) as res:
            content_type = res.headers.get("Content-Type", "")
            raw = res.read(16_000_001)
            if len(raw) > 16_000_000:
                return {"error": "Response exceeds 16MB safety cap", "status": res.status,
                        "bytes": len(raw), "contentType": content_type}
            try:
                value = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                return {"error": f"{type(exc).__name__}: {exc}",
                        "status": res.status, "bytes": len(raw),
                        "contentType": content_type,
                        "prefix": raw[:100].decode("utf-8", errors="replace")}
            return {"status": res.status, "json": value,
                    "bytes": len(raw), "contentType": content_type}
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {str(exc)[:120]}"}

def brief(obj):
    if "error" in obj:
        return {k: v for k, v in obj.items() if k != "json"}
    value = obj["json"]
    if isinstance(value, list):
        dates = sorted({str(row.get("Date", row.get("日期", ""))) for row in value if isinstance(row, dict)})
        return {"http": obj["status"], "bytes": obj.get("bytes"), "format": "list", "rows": len(value),
                "fields": list(value[0])[:12] if value and isinstance(value[0], dict) else [],
                "dates": dates[-3:]}
    if isinstance(value, dict):
        nested = value.get("data", value.get("tables", []))
        return {"http": obj["status"], "bytes": obj.get("bytes"), "format": "dict",
                "keys": list(value)[:15], "data_type": type(nested).__name__,
                "stat": value.get("stat"), "date": value.get("date")}
    return {"http": obj["status"], "format": type(value).__name__}

def main():
    # Compare two *past* monthly requests for per-stock TWSE history.
    dates = ["20260901", "20261001"]
    cases = {
        "twse_latest": "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
        "twse_stock_september": "https://www.twse.com.tw/exchangeReport/STOCK_DAY?" + urlencode({"response": "json", "date": dates[0], "stockNo": "2330"}),
        "twse_stock_october": "https://www.twse.com.tw/exchangeReport/STOCK_DAY?" + urlencode({"response": "json", "date": dates[1], "stockNo": "2330"}),
        "twse_index_september": "https://www.twse.com.tw/exchangeReport/MI_INDEX?" + urlencode({"response": "json", "date": "20260930", "type": "ALLBUT0999"}),
        "tpex_latest": "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
    }
    out = {key: brief(fetch(url)) for key, url in cases.items()}
    out["diagnostic"] = {
        "testedAtUtc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "notes": [
            "TWSE STOCK_DAY_ALL is a latest-snapshot API, not a date-scoped history API.",
            "TWSE STOCK_DAY is historical per stock per month, not all stocks per date.",
            "TPEx openapi tested here is latest snapshot; date-scoped archival endpoint remains to verify.",
            "A successful JSON response is not enough to establish bulk backfill speed or terms of use.",
        ],
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

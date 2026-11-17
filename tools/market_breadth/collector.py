"""Google Colab market breadth collector. Stores price CSVs privately in Drive.

This project adapts the above-200-day-average breadth idea described by
HoMuChen/tw-market-breadth-skill. It does NOT reproduce tradermonty's six-part
score; no unvalidated US equity-exposure threshold is used.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import json
import os
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd

FINMIND = "https://api.finmindtrade.com/api/v4/data"
TWSE = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
REPO = "minereric/twstock-for-CANSLIM-system"
PUBLIC_PATH = "public/market-breadth/latest.json"


def get_json(url, headers=None, retries=3):
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers={"User-Agent": "twstock-market-breadth/1.0", **(headers or {})}), timeout=60) as response:
                return json.load(response)
        except (OSError, ValueError, HTTPError):
            if attempt + 1 == retries:
                raise
            time.sleep(3 * (attempt + 1))


def stock_id(s):
    return bool(re.fullmatch(r"[1-9][0-9]{3}", str(s)))


def roc_date(s):
    s = str(s).strip()
    if not re.fullmatch(r"\d{7}", s):
        raise ValueError(f"TWSE date format changed: {s}")
    return f"{int(s[:3]) + 1911:04d}-{s[3:5]}-{s[5:]}"


def twse_snapshot():
    rows = get_json(TWSE)
    if not isinstance(rows, list) or not rows:
        raise RuntimeError("TWSE returned no daily stock rows")
    prices = {}
    dates = set()
    for row in rows:
        sid = str(row.get("Code", ""))
        if not stock_id(sid):
            continue
        try:
            date = roc_date(row["Date"])
            close = float(str(row["ClosingPrice"]).replace(",", ""))
            if close <= 0:
                continue
        except (KeyError, ValueError, TypeError):
            continue
        prices[sid] = close
        dates.add(date)
    if len(prices) < 500 or len(dates) != 1:
        raise RuntimeError("TWSE snapshot incomplete or dates differ")
    return dates.pop(), prices


def finmind_prices(sid, token, start_date):
    params = urlencode({"dataset": "TaiwanStockPrice", "data_id": sid, "start_date": start_date})
    payload = get_json(FINMIND + "?" + params, {"Authorization": "Bearer " + token})
    if payload.get("status") != 200:
        raise RuntimeError(f"FinMind error for {sid}: {payload.get('msg')}")
    rows = payload.get("data") or []
    if not rows:
        raise RuntimeError(f"FinMind returned no prices for {sid}")
    data = pd.DataFrame(rows)
    if "date" not in data or "close" not in data:
        raise RuntimeError(f"FinMind columns missing for {sid}")
    data = data[["date", "close"]].copy()
    data["close"] = pd.to_numeric(data["close"], errors="coerce")
    return data.dropna().loc[lambda d: d["close"] > 0]


def normalized(df):
    if df.empty:
        return df
    return df[["date", "close"]].dropna().drop_duplicates("date", keep="last").sort_values("date")


def update_cache(cache_dir, token, trade_date, snapshot, max_fetch, delay, start_date):
    cache_dir.mkdir(parents=True, exist_ok=True)
    symbols = sorted(snapshot)
    updated, errors = 0, []
    # Missing symbols first, then oldest fetched history; each run is capped.
    def freshness(s):
        path = cache_dir / f"{s}.csv"
        return (0 if not path.exists() else 1, path.stat().st_mtime if path.exists() else 0)
    for sid in sorted(symbols, key=freshness):
        path = cache_dir / f"{sid}.csv"
        meta = cache_dir / f"{sid}.fetched"
        historical_stale = not meta.exists() or (time.time() - meta.stat().st_mtime > 7 * 86400)
        if historical_stale and updated < max_fetch:
            try:
                new = finmind_prices(sid, token, start_date)
                merged = normalized(new)
                merged.to_csv(path, index=False)
                meta.touch()
                updated += 1
                time.sleep(delay)
            except Exception as exc:
                errors.append(f"{sid}: {type(exc).__name__}")
                # Rate-limit/permission errors should stop the batch rather than hammer the API.
                if "rate" in str(exc).lower() or "limit" in str(exc).lower() or "429" in str(exc):
                    break
        # The official snapshot only fills the latest close; it does not fill skipped days.
        if path.exists():
            old = pd.read_csv(path, dtype={"date": str})
            end = pd.DataFrame([{"date": trade_date, "close": snapshot[sid]}])
            normalized(pd.concat([old, end], ignore_index=True)).to_csv(path, index=False)
    return updated, errors


def summarize(cache_dir, trade_date, universe_count):
    closes = {}
    for path in cache_dir.glob("[0-9][0-9][0-9][0-9].csv"):
        try:
            df = normalized(pd.read_csv(path, dtype={"date": str}))
            if len(df) < 200 or df.iloc[-1]["date"] != trade_date:
                continue
            # Prevent missing trading days from silently counting as full 200-day history.
            s = df.set_index("date")["close"].astype(float)
            closes[path.stem] = s
        except (KeyError, ValueError, IndexError):
            continue
    eligible_count = len(closes)
    coverage = eligible_count / universe_count if universe_count else 0
    latest_above = sum(s.iloc[-1] > s.tail(200).mean() for s in closes.values())
    participation = latest_above / eligible_count if eligible_count else None
    status = "ready" if eligible_count >= 500 and coverage >= 0.9 else "partial"
    warnings = ["FinMind 免費方案未還原權息，除權息可能影響均線判定。", "目前股票池不含歷史下市股票，歷史分析有倖存者偏差。"]
    if status != "ready":
        warnings.insert(0, "股票樣本不足：這是建置進度，不能解讀為全市場寬度。")
    out = {
        "schemaVersion": 1, "status": status, "market": "TWSE",
        "tradeDate": trade_date, "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "universeCount": universe_count, "eligibleCount": eligible_count,
        "above200Count": int(latest_above), "coverage": round(coverage, 4),
        "breadthAbove200": round(participation, 6) if participation is not None else None,
        "source": "TWSE STOCK_DAY_ALL + FinMind TaiwanStockPrice (unadjusted)",
        "method": "Equal-weighted share of eligible TWSE common stocks above 200-observation SMA",
        "warnings": warnings,
    }
    return out


def publish(payload, token, branch):
    if payload["status"] != "ready":
        raise RuntimeError("Refusing to publish partial-universe breadth as a market signal")
    if not token:
        raise RuntimeError("GITHUB_TOKEN must be stored in Colab Secrets")
    if not re.fullmatch(r"[A-Za-z0-9._/-]+", branch):
        raise ValueError("Invalid branch name")
    api = f"https://api.github.com/repos/{REPO}/contents/{PUBLIC_PATH}"
    headers = {"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
               "X-GitHub-Api-Version": "2022-11-28"}
    try:
        existing = get_json(api + "?" + urlencode({"ref": branch}), headers)
        sha = existing.get("sha")
    except HTTPError as exc:
        if exc.code != 404:
            raise
        sha = None
    body = {
        "message": f"data: update TWSE market breadth {payload['tradeDate']}",
        "branch": branch,
        "content": base64.b64encode((json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode()).decode(),
    }
    if sha:
        body["sha"] = sha
    raw = json.dumps(body).encode()
    with urlopen(Request(api, data=raw, headers={**headers, "Content-Type": "application/json"}, method="PUT"), timeout=60) as response:
        result = json.load(response)
    return result["content"]["html_url"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", default="/content/drive/MyDrive/twstock-market-breadth-cache")
    parser.add_argument("--max-fetch", type=int, default=60)
    parser.add_argument("--delay", type=float, default=6.5)
    parser.add_argument("--start-date", default="2024-01-01")
    parser.add_argument("--output", default="/content/tw-market-breadth-result.json")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--branch", default="feat/colab-market-breadth")
    args = parser.parse_args()
    token = os.getenv("FINMIND_API_TOKEN", "")
    if not token:
        parser.error("Set FINMIND_API_TOKEN via Colab Secrets")
    if not 0 <= args.max_fetch <= 100 or args.delay < 6:
        parser.error("Safety limits: max-fetch must be 0..100, delay >=6 seconds")
    trade_date, snapshot = twse_snapshot()
    cache_dir = Path(args.cache_dir)
    count, errors = update_cache(cache_dir, token, trade_date, snapshot, args.max_fetch, args.delay, args.start_date)
    result = summarize(cache_dir, trade_date, len(snapshot))
    result["fetchedThisRun"] = count
    result["fetchErrors"] = errors[:20]
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if args.publish:
        url = publish(result, os.getenv("GITHUB_TOKEN", ""), args.branch)
        print("Published:", url)


if __name__ == "__main__":
    main()

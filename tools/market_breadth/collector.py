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
import threading
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import pandas as pd

FINMIND = "https://api.finmindtrade.com/api/v4/data"
TWSE = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
REPO = "minereric/twstock-for-CANSLIM-system"
PUBLIC_PATH = "public/market-breadth/latest.json"
FINMIND_MIN_GAP = 7.0  # free tier: 600/hour; maintain a margin
_finmind_lock = threading.Lock()
_last_finmind_call = 0.0

class FinMindQuotaError(RuntimeError):
    """Limit reached: stop the entire batch; do not retry."""



def get_json(url, headers=None, retries=3):
    for attempt in range(retries):
        try:
            with urlopen(Request(url, headers={"User-Agent": "twstock-market-breadth/1.0", **(headers or {})}), timeout=60) as response:
                return json.load(response)
        except HTTPError as exc:
            if exc.code in (402, 429):
                raise FinMindQuotaError(f"API quota error HTTP {exc.code}") from exc
            if attempt + 1 == retries:
                raise
        except (OSError, ValueError):
            if attempt + 1 == retries:
                raise
        time.sleep(3 * (attempt + 1))


def finmind_pace(delay=FINMIND_MIN_GAP):
    """Pace every FinMind request, including the snapshot cross-check."""
    global _last_finmind_call
    with _finmind_lock:
        elapsed = time.monotonic() - _last_finmind_call
        if _last_finmind_call and elapsed < delay:
            time.sleep(delay - elapsed)
        _last_finmind_call = time.monotonic()

def stock_id(s):
    return bool(re.fullmatch(r"[1-9][0-9]{3}", str(s)))


def twse_snapshot(token):
    """Use the official row date; never infer a date from matching prices."""
    from official import snapshot
    trade_day, values = snapshot(get_json(TWSE), "twse")
    age = (dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date() - dt.date.fromisoformat(trade_day)).days
    if not 0 <= age <= 7 or len(values) < 500 or "2330" not in values:
        raise RuntimeError("TWSE snapshot stale, future-dated or incomplete")
    return trade_day, values

def finmind_prices(sid, token, start_date):
    params = urlencode({"dataset": "TaiwanStockPrice", "data_id": sid, "start_date": start_date})
    finmind_pace()
    payload = get_json(FINMIND + "?" + params, {"Authorization": "Bearer " + token})
    if payload.get("status") != 200:
        msg = str(payload.get("msg", ""))
        if payload.get("status") in (402, 429) or "limit" in msg.lower() or "upper" in msg.lower():
            raise FinMindQuotaError(f"FinMind quota reached on {sid}")
        raise RuntimeError(f"FinMind error for {sid}: {msg}")
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
            except FinMindQuotaError as exc:
                errors.append(f"{sid}: {type(exc).__name__}")
                break  # Do not retry or continue fetching after a quota denial.
            except Exception as exc:
                errors.append(f"{sid}: {type(exc).__name__}")
        # The official snapshot only fills the latest close; it does not fill skipped days.
        if path.exists():
            old = pd.read_csv(path, dtype={"date": str})
            end = pd.DataFrame([{"date": trade_date, "close": snapshot[sid]}])
            normalized(pd.concat([old, end], ignore_index=True)).to_csv(path, index=False)
    return updated, errors


def summarize(cache_dir, trade_date, universe_count):
    """Require the same 200 trading sessions for every eligible stock.

    Benchmark 2330 is a temporary trading-calendar proxy. Once official
    by-date history has been verified, replace it with the TWSE calendar.
    """
    reference_path = cache_dir / "2330.csv"
    reference = pd.DataFrame(columns=["date", "close"])
    if reference_path.exists():
        try:
            reference = normalized(pd.read_csv(reference_path, dtype={"date": str}))
        except (KeyError, ValueError):
            pass
    calendar = (reference["date"].tail(200).tolist()
                if len(reference) >= 200 and reference.iloc[-1]["date"] == trade_date else [])
    closes = {}
    incomplete = 0
    for path in cache_dir.glob("[0-9][0-9][0-9][0-9].csv"):
        try:
            df = normalized(pd.read_csv(path, dtype={"date": str}))
            if len(calendar) != 200 or df.empty or df.iloc[-1]["date"] != trade_date:
                incomplete += 1
                continue
            indexed = df.set_index("date")["close"].astype(float)
            # Missing one of the reference trading days invalidates the 200-day SMA.
            if not set(calendar).issubset(indexed.index):
                incomplete += 1
                continue
            closes[path.stem] = indexed.loc[calendar]
        except (KeyError, ValueError, IndexError):
            incomplete += 1
            continue
    eligible_count = len(closes)
    coverage = eligible_count / universe_count if universe_count else 0
    latest_above = sum(s.iloc[-1] > s.mean() for s in closes.values())
    participation = latest_above / eligible_count if eligible_count else None
    status = "ready" if eligible_count >= 500 and coverage >= 0.9 else "partial"
    warnings = ["FinMind 免費方案未還原權息，除權息可能影響均線判定。",
                "目前股票池不含歷史下市股票，歷史分析有倖存者偏差。",
                "目前以台積電 2330 的有效交易日期作為上市市場交易日代理；正式版應使用交易所日曆。"]
    if not calendar:
        warnings.insert(0, "缺少 2330 連續 200 個基準交易日，無法確認其他股票日線連續性。")
    if status != "ready":
        warnings.insert(0, "股票樣本不足：這是建置進度，不能解讀為全市場寬度。")
    return {
        "schemaVersion": 1, "status": status, "market": "TWSE",
        "tradeDate": trade_date, "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "universeCount": universe_count, "eligibleCount": eligible_count,
        "excludedCachedCount": incomplete, "above200Count": int(latest_above),
        "coverage": round(coverage, 4),
        "breadthAbove200": round(participation, 6) if participation is not None else None,
        "source": "TWSE STOCK_DAY_ALL + FinMind TaiwanStockPrice (unadjusted)",
        "method": "Equal-weighted share above 200-day SMA on a common 200-session calendar",
        "warnings": warnings,
    }

def publish(payload, token, branch):
    if branch in ("main", "master"):
        raise RuntimeError("Publishing to the default branch is prohibited")
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
    parser.add_argument("--source", choices=("official", "finmind"), default="official")
    parser.add_argument("--max-fetch", type=int, default=60)
    parser.add_argument("--delay", type=float, default=7.0)
    parser.add_argument("--start-date", default="2024-01-01")
    parser.add_argument("--output", default="/content/tw-market-breadth-result.json")
    parser.add_argument("--publish", action="store_true")
    parser.add_argument("--branch", default="feat/colab-market-breadth")
    args = parser.parse_args()
    if args.source == "official":
        from official import snapshot, save_batch
        cache = Path(args.cache_dir)
        cache.mkdir(parents=True, exist_ok=True)
        result = {"schemaVersion": 1, "status": "partial", "source": "TWSE/TPEx official unadjusted", "breadthAbove200": None,
                  "warnings": ["官方行情候選代號尚未完成普通股分類及200交易日覆蓋驗證，不是正式市場寬度。"]}
        for market, url in (("twse", TWSE), ("tpex", "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes")):
            try:
                day, values = snapshot(get_json(url, retries=1), market)
                age = (dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date() - dt.date.fromisoformat(day)).days
                if not 0 <= age <= 7:
                    raise ValueError("Stale or future official date")
                save_batch(cache / "official.sqlite", market, day, values)
                result[market] = {"tradeDate": day, "candidateCount": len(values), "status": "partial"}
            except Exception as exc:
                result[market] = {"status": "unverified", "error": type(exc).__name__}
        Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        if args.publish:
            raise RuntimeError("Official candidate data is not approved for signal publishing")
        return
    token = os.getenv("FINMIND_API_TOKEN", "")
    if args.max_fetch and not token:
        parser.error("FinMind backfill requires FINMIND_API_TOKEN; use --max-fetch 0 for official-only latest update")
    if not 0 <= args.max_fetch <= 100 or args.delay < 7:
        parser.error("Safety limits: max-fetch must be 0..100, delay >=7 seconds")
    global FINMIND_MIN_GAP
    FINMIND_MIN_GAP = args.delay
    trade_date, snapshot = twse_snapshot(token)
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

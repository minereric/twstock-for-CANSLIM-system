# Colab + GitHub 台股市場寬度整合（第一階段）

此功能為 **加裝模組**，不修改 CAN SLIM 舊有選股規則、庫存及晨午收盤報內容。採用 Google Colab 計算、Google Drive 私有快取及 GitHub 靜態彙整結果。

## 第一次設定

1. 在 [Google Colab](https://colab.research.google.com/) 建立新筆記本，執行下列儲存格。
2. 左側鑰匙圖示 **Secrets** 新增 `FINMIND_API_TOKEN`，並允許筆記本存取。
3. 只有要發佈結果時，才需要 `GITHUB_TOKEN`。使用可編輯此倉庫 Contents 的細粒度 Token；**不要顯示或提交 Token**。
4. 首次掛載 Google Drive 會要求帳號授權；請確認使用自己的 Google 帳號。

### 儲存格 1：取得最新程式（獨立功能分支）

```python
!git clone -b feat/colab-market-breadth --single-branch https://github.com/minereric/twstock-for-CANSLIM-system.git /content/twstock-canslim
!pip -q install "pandas>=2.0,<3"
```

### 儲存格 2：安全載入金鑰及掛載 Drive

```python
from google.colab import userdata, drive
import os
drive.mount('/content/drive')
os.environ['FINMIND_API_TOKEN'] = userdata.get('FINMIND_API_TOKEN')
# 第一次先不要設 GITHUB_TOKEN，也不要 --publish。
```

### 儲存格 3：建立快取並檢查結果

```python
!python /content/twstock-canslim/tools/market_breadth/collector.py --max-fetch 30 --delay 7
```

每次可接著執行第三格，預設上限 30 檔／次。若需提高進度，可改為 `--max-fetch 60`，但仍需依 FinMind 當時限制調整；請留意 Colab 工作階段中斷及 API 額度。價格 CSV 保存在自己的 Drive，不提交到 GitHub。

### 儲存格 4：確認覆蓋率達標後發布

只有當結果 `status=ready`，有效樣本至少 500 檔，且覆蓋率至少 90%，才允許發佈。此門檻為品質閘門，**不是完整行情準確度保證**。

```python
os.environ['GITHUB_TOKEN'] = userdata.get('GITHUB_TOKEN')
!python /content/twstock-canslim/tools/market_breadth/collector.py --max-fetch 0 --publish --branch feat/colab-market-breadth
```

接著到 Pull Request 檢視結果。合併到 main 且正式部署後，前端才會讀取 `/market-breadth/latest.json`。若沒有這個檔案，前端顯示「尚未發布」，不會偽造數字。

## 已知限制

- 目前只計算上市 TWSE 普通股的 **最新 200 個有效價格觀察值**，不是原版六分項市場健康評分。
- 免費 FinMind `TaiwanStockPrice` 未還原股價，除權息可能影響判斷。
- 官方 TWSE 每日全市場快照只補當日收盤；錯過的交易日須靠後續 FinMind 歷史查詢補齊。
- 目前掛牌股票池有倖存者偏差。ETF（含反向、槓桿）不列入股票池。
- 腳本限制每輪最多 100 檔與至少 6 秒間隔，但 API 實際限額依帳號方案調整。
- **Colab 不會自行常駐或排程**；需手動執行，若需自動排程需另設執行環境。
- 請勿公開上傳 FinMind 原始行情 CSV；檢視其資料授權條款後再決定是否發布彙整指標。
- 程式來源概念：[HoMuChen/tw-market-breadth-skill](https://github.com/HoMuChen/tw-market-breadth-skill)（MIT），採不同實作，不含原版六因子評分或自動部位建議。

## 後續

先完成真實資料核驗、取樣覆蓋率及測試，再擴增歷史寬度序列與六項評分；將市場環境摘要整合進晨／午／收盤報。避免把美股的 Equity Exposure 門檻直接當成台股建議。

## 官方免費來源（2026-11-17 更新）

預設 `collector.py` 現改用官方來源，不讀取 FinMind token。最新候選行情存於 SQLite，TWSE／TPEx 分市場保留；尚未完成普通股分類與歷史覆蓋時只輸出 `partial`，禁止發布正式訊號。

```python
!git -C /content/twstock-canslim pull --ff-only origin feat/colab-market-breadth
!python -m unittest discover -s /content/twstock-canslim/tools/market_breadth -p 'test_*.py' -v
!python /content/twstock-canslim/tools/market_breadth/probe_official.py
!python /content/twstock-canslim/tools/market_breadth/official.py --dates 2026-09-30 2026-10-01 --db /content/drive/MyDrive/twstock-market-breadth-official.sqlite
!python /content/twstock-canslim/tools/market_breadth/collector.py
```

歷史批次每次最多指定 10 個日期，每個日期依序請求兩市場，間隔 7 秒，無自動重試；402/429 即停止。成功日期原子取代，可重跑續接。休市、缺欄位、非 JSON、回傳日期不符都不寫入；失敗不能推定為休市。官方日期批次的回補程序目前僅蒐集候選價格，尚未接上正式 200 日市場寬度計算。

FinMind 免費版補洞必須明確加上 `--source finmind`，沿用既有每次最多 100 檔及至少 7 秒節流。既有指令若未加此參數，現只走官方快照。所有價格未還原權息。不得將四位數代號篩選當作普通股分類；普通股名冊、掛牌／下市與停牌判定仍待加入。

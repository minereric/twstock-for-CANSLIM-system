# 台股市場寬度整合：分工與交接單

> 位置：`docs/HANDOFF_market_breadth.md`（PR #2，分支 `feat/colab-market-breadth`）
> 原則：**GitHub 分支與本文件是唯一共享狀態**。任何代理（ChatGPT、Claude、Claude Code）開工前先讀本文件，收工後更新「進度紀錄」。

## 0. 硬性限制（Robert 已決定）

- **FinMind 只用免費版**：註冊後每小時 600 次請求；只有未還原股價（`TaiwanStockPrice`）；不得假設可用還原股價或付費資料集。
- 逐檔抓全上市約 1,200 次請求，**首次建立歷史需兩小時以上**，必須分批、可中斷續跑。日常增量更新應盡量不依賴 FinMind。
- 因此**資料源優化（A4）是最優先項目**：先評估以 TWSE／TPEx 官方「依日期抓全市場收盤」資料建立歷史與日更，FinMind 僅作交叉驗證與補洞。
- 不改動 CAN SLIM 演算法、Supabase 資料表、個人庫存與 main 分支（合併前）。
- 未還原股價在除權息旺季（7–9 月）會讓寬度偏低，必須在 UI 與文件標示；任何門檻須以台股歷史校準，不得沿用美股 Equity Exposure。

## 1. 現況（2026-11-17 審查）

- PR #2（Draft）新增：`tools/market_breadth/collector.py`、`src/components/MarketBreadthPanel.tsx`、`ReportGenerator.tsx`（+2 行）、`docs/COLAB_MARKET_BREADTH.md`
- 已驗證：`npm ci`、`npm run lint`、`vite build` 通過；`collector.py` 語法正確
- 尚未驗證：真實 FinMind／TWSE 資料、Colab 實跑；`tests/` 無 collector 測試
- 目前只輸出「單日站上 200 日線比例」，無 6 分項評分、8MA／200MA 序列、指數背離

## 2. 待辦與驗收標準

| # | 任務 | 建議負責 | 驗收標準 |
|---|------|----------|----------|
| A4 | **（最優先）資料源實測**：TWSE／TPEx 依日期全市場收盤資料的欄位、限流、授權、回補約 250 個交易日所需時間，並確認能否取得各日實際掛牌股票（降低倖存者偏差） | Robert 本機 Claude Code 實測，結果回填本文件 | 附實測紀錄與結論：採用／不採用 |
| A1 | 交易日連續性檢查：`summarize()` 註解寫「防止缺日」但程式只檢查筆數 ≥200；缺日超過門檻者不列入有效樣本 | ChatGPT | 單元測試：缺日資料被排除 |
| A2 | 快取由「每檔一個 CSV」改為單一 parquet／SQLite | ChatGPT | 與舊版結果一致 |
| A3 | 加入上櫃（TPEx），與上市分開統計 | ChatGPT | JSON 含 `twse`、`tpex` 兩組欄位 |
| A5 | 免費額度保護：目前 `delay >= 6` 剛好 600 次／小時，無餘裕；建議預設 7 秒、遇限流訊息即停止、不重試放大請求；HTTP 429 不做三次重試 | ChatGPT | 連續執行一小時不超額 |
| B1 | 移植原版 6 分項評分（tradermonty `market-breadth-analyzer`，MIT），保留歷史序列（8MA、200MA、趨勢、高低點） | Claude（程式＋測試，以 patch 交付） | 同一份輸入分數與 HoMuChen 版一致 |
| B2 | 前端面板：分數、區間、近 N 日走勢、指數 vs 寬度背離；partial 狀態不顯示結論；標示未還原股價 | ChatGPT | lint／build 通過 |
| C1 | GitHub Actions 排程（台北收盤後）取代手動 Colab；FinMind token 放 repo secret，以內建 `GITHUB_TOKEN` 提交 JSON，不再使用個人 PAT。首次歷史建置需分批（每批遵守 600 次／小時） | ChatGPT 撰寫、Robert 設 secret | 排程成功更新 `public/market-breadth/latest.json` |
| D1 | 與 CAN SLIM 的 M（市場方向）整合，門檻以台股歷史校準 | B1 完成後另行規劃 | 文件列出校準方法與樣本期 |

## 3. 分工規則

1. **一次一位寫手**：同一時間只有一位代理在分支提交；其他代理只提交 review 意見或 patch。
2. **互不改對方檔案**：A 系列動 `collector.py`；B1 新增 `scoring.py`；B2 動前端。
3. **機密不入對話與 repo**：FinMind／GitHub token 只放 Colab Secrets 或 GitHub Secrets。
4. **數字必須有出處**：標明資料日與來源；未實跑的結果一律標「未驗證」。
5. **Robert 為整合者**：合併 PR、設定 secrets、實跑真實資料皆由 Robert 確認。

## 4. 交接提示詞

**給 ChatGPT：**
> 請先讀 `docs/HANDOFF_market_breadth.md`，特別注意第 0 節限制（FinMind 僅免費版）。你負責 A1、A2、A3、A5、B2、C1。每完成一項，在「進度紀錄」加一行（日期／項目／SHA／測試結果）。不要修改 `scoring.py`，也不要合併 PR。

**給 Claude／Claude Code：**
> 請先讀 `docs/HANDOFF_market_breadth.md` 與 PR #2。你負責 A4（本機實測資料源）與 B1（評分移植＋測試）。以 patch 或獨立分支交付，不要直接改 `collector.py`。

## 5. 進度紀錄

| 日期 | 代理 | 項目 | 結果／SHA |
|------|------|------|-----------|
| 2026-11-17 | Claude | 審查 PR #2；lint／build 驗證；建立本交接單（FinMind 免費版限制） | lint／build 通過；待辦見第 2 節 |
| 2026-11-17 | ChatGPT | 交接單入庫 | `fe63b7a`；未修改其他檔案 |
| 2026-11-17 | ChatGPT | A5 程式防護：FinMind 最短 7 秒；HTTP 402/429 停止重試；API status 402 停止 | `b8c9cb9`；程式提交，尚未完成一小時真實額度測試 |
| 2026-11-17 | ChatGPT | A4 官方資料來源探測程式 | `edf2b76`；本環境 TWSE／TPEx DNS 無法連線；已準備可在 Colab 執行的診斷程式，待真實測試 |


## 6. A4 研究備註與實測方法（2026-11-17）

- 證交所 OpenAPI `exchangeReport/STOCK_DAY_ALL` 提供最新交易日全市場快照，**不能直接指定歷史日期回補**。
- `www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=2330` 是單檔指定月份的歷史資訊，不是指定日期的全市場下載。
- 上櫃最新快照可先測 `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`；歷史按日期的官方 URL、欄位及授權仍待實測。
- 不要將第三方彙整站點的付費／免費服務誤認為官方原生 API。
- 在 Colab 開新儲存格執行 `!python /content/twstock-canslim/tools/market_breadth/probe_official.py`，儲存輸出。探測僅五個網路請求，無須 FinMind token；收到 HTTP 200 仍須確認 schema、日期與資料內容。
- 此次在 ChatGPT 執行容器對 TWSE／TPEx 均發生 DNS 解析失敗，故**並未通過真實資料測試**，暫不對官方歷史批次回補可行性下結論。

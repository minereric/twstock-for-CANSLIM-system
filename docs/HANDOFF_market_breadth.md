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
| 2026-11-17 | ChatGPT | A1 200 交易日完整性修正與離線測試檔 | `ad96ccb`、`67e0a1a`；已新增測試，尚未實際執行 pytest/unittest |
| 2026-11-17 | ChatGPT | 無金鑰 CI 驗證工作流程 | `8bc500b`；新增 read-only GitHub Actions，待首次 workflow 結果 |


## 6. A4 研究備註與實測方法（2026-11-17）

- 證交所 OpenAPI `exchangeReport/STOCK_DAY_ALL` 提供最新交易日全市場快照，**不能直接指定歷史日期回補**。
- `www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=YYYYMMDD&stockNo=2330` 是單檔指定月份的歷史資訊，不是指定日期的全市場下載。
- 上櫃最新快照可先測 `https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes`；櫃買中心網站「每日收盤行情」提供日期查詢與 CSV 下載，標示歷史資料自 2007 年起可查，但實際呼叫介面、批量限制及授權仍待實測（https://www.tpex.org.tw/en-us/mainboard/trading/info/pricing.html）。
- 不要將第三方彙整站點的付費／免費服務誤認為官方原生 API。
- 在 Colab 開新儲存格執行 `!python /content/twstock-canslim/tools/market_breadth/probe_official.py`，儲存輸出。探測僅五個網路請求，無須 FinMind token；收到 HTTP 200 仍須確認 schema、日期與資料內容。
- 此次在 ChatGPT 執行容器對 TWSE／TPEx 均發生 DNS 解析失敗，故**並未通過真實資料測試**，暫不對官方歷史批次回補可行性下結論。

### 待執行的離線驗證

在 Colab 克隆 PR 分支後，執行 `!python -m unittest discover -s /content/twstock-canslim/tools/market_breadth -p 'test_*.py' -v`。此測試不需要 FinMind token。未看到實際測試輸出前，不標記為通過。

### 2026-11-17 Colab A4 真實探測結果（使用者提供）

- GitHub PR 分支 clone 成功（206 objects）。
- TWSE `STOCK_DAY_ALL`: HTTP 200、1,390 筆，回傳 `Date=1151116`（2026-11-16）；含 `Date,Code,Name,ClosingPrice` 等欄位。**1,390 筆並不等於普通股有效樣本**。
- TWSE `STOCK_DAY` 台積電 2330：2026/09、2026/10 均 HTTP 200，`stat=OK`，屬單檔月份資料。
- TWSE `MI_INDEX` 2026-09-30：原版探測程式 `JSONDecodeError`；需核對 Content-Type、回傳開頭及查詢參數，不可當作 API 不可用。
- TPEx `tpex_mainboard_daily_close_quotes`：原版探測程式以 `read(3_000_000)` 截斷，於約第 2.9MB JSON 解析失敗；不等同伺服器失敗。
- 2026-11-17 ChatGPT 修補探測程式，改為完整讀取（16MB 安全上限）、回報 response bytes、Content-Type 與非 JSON 前綴；commit `b1fa96d`。**修補版本尚待 Colab 重測。**

### 2026-11-17 官方來源修正與執行環境實測（ChatGPT）

本次先讀本交接單，再於 PR #2 功能分支工作。**以下真實請求在 ChatGPT 執行容器完成，不是 Colab。** 已連接 Chrome 中只有對話與「新功能」分頁，無 Colab，因此無法讀取新的筆記本輸出或完成 Colab 重測；舊輸出僅以本文件前述使用者提供紀錄為準。未讀取或輸出任何 token。

- 修正 `probe_official.py`：歷史全市場行情路徑由錯誤的 `/indicesReport/MI_INDEX` 改為 `/exchangeReport/MI_INDEX`。
- `collector.py` 預設官方免費來源，TWSE／TPEx 最新候選行情以單一 SQLite 保存（鍵為市場／日期／代號）；FinMind 必須明確指定 `--source finmind`。TWSE 日期直接解析官方 `Date`，取消以台積電價格匹配推算日期的 FinMind 請求。
- 官方最新快照實測：TWSE 1,390 原始筆／1,088 有效候選代號；TPEx 13,843 原始筆／878 有效候選代號。兩市場 `Date=1151116`，即 2026-11-16。TPEx 欄位為 `SecuritiesCompanyCode,Close`，TWSE 為 `Code,ClosingPrice`。代號保留字串；ETF、權證等不能混作普通股。四位數且非零開頭僅作候選篩選，並未完成證券種類分類。
- 新增 `official.py`：以明確日期批次取得官方歷史行情，逐日核對回傳日期、表格欄位及列寬；缺欄位／日期不符／非 JSON／非正有限價格皆不造值。TPEx 實測 `stat="ok"`、歷史欄位 `代號,收盤`；TWSE 為 `stat="OK"`、`證券代號,收盤價`。

| 市場 | 請求與回傳日期 | 有效候選行情數 | 結果 |
|---|---|---:|---|
| TWSE | 2026-09-30 | 1,087 | 成功解析／存入 SQLite |
| TWSE | 2026-10-01 | 1,085 | 成功解析／存入 SQLite |
| TPEx | 2026-09-30 | 877 | 成功解析／存入 SQLite |
| TPEx | 2026-10-01 | 864 | 成功解析／存入 SQLite |

兩市場兩日期的正規化價格雜湊各異，證明測試中回傳內容隨日期不同，而非把最新快照標成歷史日期。完整摘要見 `docs/market_breadth_official_validation.json`。這是端點與蒐集驗證，**不是正式市場寬度分析結果**。

- 離線 `python -m unittest discover -s tools/market_breadth -p 'test_*.py' -v`：12 項通過；涵蓋 200 日缺日、民國／西元日期、混日、錯日、TPEx 欄位、代號與無效價格、重複代號、列寬、SQLite 重跑取代及市場隔離。`py_compile` 與 `git diff --check` 通過。
- 官方 collector 端到端實跑：兩市場成功，輸出維持 `partial`、`breadthAbove200=null`，不可發布；不曾寫入公開市場訊號。未改 CAN SLIM、持股、Supabase、main，未合併 PR。
- 未完成：Colab 同版重測；約 250 交易日長批次效能／限流；官方普通股名冊、歷史掛牌與停牌分類；官方交易日完整性驗證；SQLite 歷史與正式 200 日計算串接；對外再利用條款確認。A2/A3 目前僅官方蒐集層完成，不能標記整體驗收完成。B1/B2/C1/D1 本次未實作。
- 執行方法與可續跑的 Colab 指令已補入 `docs/COLAB_MARKET_BREADTH.md`。本紀錄提交 SHA 以包含本段的 GitHub commit 為準（避免將提交前未知 SHA 寫成已驗證）。

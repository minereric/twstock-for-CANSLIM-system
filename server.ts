import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

const WATCHED_SYMBOLS = [
  '00631L', '00632R', '00981A', '00991A', '2356', '2885', '3481', '1432',
  '2330', '2317', '2382', '2303', '6770', '2344', '2313', '1605', '2481',
  '3416', '3711', '2618', '2610', '2603', '2609', '2882', '2501', '0050',
  '0056', '00919', '00878'
];

// In-memory cache
interface CachedQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  volume: number;
  lastUpdated?: string;
  timestamp: number;
}

const cache: Record<string, CachedQuote> = {};
let lastFetchAllTime = 0;
const CACHE_TTL = 30 * 1000; // 30 seconds cache TTL

const DEFAULT_PRICES: Record<string, { price: number, name: string }> = {
  '00631L': { price: 38.16, name: '元大台灣50正二' },
  '00632R': { price: 9.85, name: '元大台灣50反一' },
  '00981A': { price: 31.50, name: '主動統一台股增長' },
  '00991A': { price: 21.06, name: '主動復華未來50' },
  '2356': { price: 67.50, name: '英業達' },
  '2885': { price: 66.70, name: '元大金' },
  '3481': { price: 66.50, name: '群創' },
  '1432': { price: 15.65, name: '大魯閣' },
  '2330': { price: 2430.00, name: '台積電' },
  '2317': { price: 238.50, name: '鴻海' },
  '2382': { price: 372.50, name: '廣達' },
  '2303': { price: 168.50, name: '聯電' },
  '6770': { price: 75.10, name: '力積電' },
  '2344': { price: 192.00, name: '華邦電' },
  '2313': { price: 226.00, name: '華通' },
  '1605': { price: 35.00, name: '華新' },
  '2481': { price: 60.00, name: '強茂' },
  '3416': { price: 130.00, name: '融程電' },
  '3711': { price: 150.00, name: '日月光投控' },
  '2618': { price: 35.00, name: '長榮航' },
  '2610': { price: 22.00, name: '華航' },
  '2603': { price: 200.00, name: '長榮' },
  '2609': { price: 70.00, name: '陽明' },
  '2882': { price: 55.00, name: '國泰金' },
  '2501': { price: 30.00, name: '國建' },
  '0050': { price: 109.50, name: '元大台灣50' },
  '0056': { price: 38.00, name: '元大高股息' },
  '00919': { price: 25.00, name: '群益台灣精選高息' },
  '00878': { price: 22.00, name: '國泰永續高股息' }
};

// Concurrency-limited promise pool helper
async function fetchInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(item => fn(item).catch(err => {
        console.error(`Error fetching item ${item}:`, err);
        return null as unknown as R;
      }))
    );
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, 80)); // 80ms gap to avoid rate limit spikes
    }
  }
  return results;
}

async function fetchFugleQuote(symbol: string, apiKey: string): Promise<CachedQuote> {
  const url = `https://api.fugle.tw/marketdata/v1.0/stock/intraday/quote/${symbol}`;
  const response = await globalThis.fetch(url, {
    headers: {
      "X-API-KEY": apiKey,
      "User-Agent": "Mozilla/5.0 (NodeJS server-side)"
    }
  });

  if (!response.ok) {
    throw new Error(`Fugle API returned ${response.status} for ${symbol}`);
  }

  const data = (await response.json()) as any;
  const rawPrice = data.lastPrice ?? data.referencePrice ?? data.previousClose;
  if (typeof rawPrice !== 'number') {
    throw new Error(`Fugle API did not return price for ${symbol}`);
  }

  return {
    symbol,
    price: rawPrice,
    change: data.change ?? 0,
    changePercent: data.changePercent ?? 0,
    previousClose: data.previousClose ?? data.referencePrice ?? rawPrice,
    volume: data.volume ?? Math.round(Math.random() * 80000 + 20000),
    lastUpdated: data.lastUpdated,
    timestamp: Date.now()
  };
}

// Yahoo Finance Index translations and API fetch helper
const INDEX_NAMES: Record<string, string> = {
  '^TWII': '台灣加權指數',
  '^GSPC': '美股標普 500',
  '^IXIC': '美股那斯達克',
  '^SOX': '美股費城半導體',
  '^DJI': '美股道瓊工業'
};

async function fetchYahooQuotes(symbols: string[]): Promise<any[]> {
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  
  // Try query2 first as it is highly reliable
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
    const response = await globalThis.fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "application/json"
      }
    });
    if (response.ok) {
      const data = (await response.json()) as any;
      if (data?.quoteResponse?.result) {
        return data.quoteResponse.result;
      }
    }
  } catch (err) {
    console.warn('[Yahoo Finance] query2 failed, trying query1...', err);
  }

  // Fallback to query1
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`;
  const response = await globalThis.fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance API query1 returned status ${response.status}`);
  }

  const data = (await response.json()) as any;
  return data?.quoteResponse?.result || [];
}

async function fetchTwseQuotes(symbols: string[]): Promise<any[]> {
  const channels: string[] = [];
  symbols.forEach(sym => {
    channels.push(`tse_${sym}.tw`);
    channels.push(`otc_${sym}.tw`);
  });
  // Add Taiwan Index symbol
  channels.push('tse_t00.tw');

  const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${channels.join('|')}&_=${Date.now()}`;
  
  const response = await globalThis.fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://mis.twse.com.tw/stock/index.jsp",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`TWSE mis API returned status ${response.status}`);
  }

  const data = (await response.json()) as any;
  return data?.msgArray || [];
}

// REST endpoint for stocks
app.get('/api/stocks', async (req, res) => {
  const now = Date.now();
  let yahooDataMap: Record<string, any> = {};
  let fetchedIndices: Record<string, any> = {};
  let sourceUsed = "Simulated Local Data";

  const indexSymbols = ['^TWII', '^GSPC', '^IXIC', '^SOX', '^DJI'];

  // Helper parser for TWSE real-time API values
  const parseVal = (v: any) => {
    if (v === undefined || v === null || v === '-' || v === '') return null;
    const num = Number(v);
    return isNaN(num) ? null : num;
  };

  // 1. Try fetching Taiwan Stocks and Taiwan Index via TWSE mis API first
  console.log(`[TWSE API] Fetching live Taiwan quotes...`);
  let twseSuccess = false;
  try {
    const twseResults = await fetchTwseQuotes(WATCHED_SYMBOLS);
    if (twseResults && twseResults.length > 0) {
      twseSuccess = true;
      sourceUsed = "TWSE Real-time API";
      
      twseResults.forEach((item: any) => {
        // Taiwan Index
        if (item.c === 't00') {
          const zPrice = parseVal(item.z);
          const yPrice = parseVal(item.y);
          const price = zPrice ?? yPrice ?? 0;
          const prevClose = yPrice ?? price;
          const change = price - prevClose;
          const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
          const rawV = parseVal(item.v);
          const volume = rawV ? rawV * 1000 : 0;

          fetchedIndices['^TWII'] = {
            symbol: '^TWII',
            name: INDEX_NAMES['^TWII'] || '台灣加權指數',
            price,
            change,
            changePercent,
            prevClose,
            volume
          };
        } else if (item.c) {
          const cleanSym = item.c;
          if (WATCHED_SYMBOLS.includes(cleanSym)) {
            const zPrice = parseVal(item.z);
            const oPrice = parseVal(item.o);
            const yPrice = parseVal(item.y);
            const rawV = parseVal(item.v);

            // Determine active/latest price
            const price = zPrice ?? oPrice ?? yPrice;
            if (price && price > 0) {
              const prevClose = yPrice ?? price;
              const change = price - prevClose;
              const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
              const volume = rawV ? rawV * 1000 : 0;

              // If we already added from tse, do not overwrite with empty otc or vice versa
              if (!yahooDataMap[cleanSym] || (yahooDataMap[cleanSym] && volume > yahooDataMap[cleanSym].volume)) {
                yahooDataMap[cleanSym] = {
                  symbol: cleanSym,
                  price,
                  change,
                  changePercent,
                  previousClose: prevClose,
                  volume,
                  timestamp: now
                };
              }
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('[TWSE API] Failed to fetch quotes from TWSE:', err);
  }

  // 2. Fetch US/Global indices and fallback Taiwan quotes from Yahoo Finance
  console.log(`[Yahoo Finance] Fetching US indices and backup quotes...`);
  try {
    // If TWSE API was successful, we only need US indices. Otherwise, we fetch everything from Yahoo as backup.
    const symbolsToFetchYahoo = twseSuccess 
      ? ['^GSPC', '^IXIC', '^SOX', '^DJI'] 
      : [
          ...WATCHED_SYMBOLS.map(sym => `${sym}.TW`),
          ...WATCHED_SYMBOLS.map(sym => `${sym}.TWO`),
          ...indexSymbols
        ];

    const yahooResults = await fetchYahooQuotes(symbolsToFetchYahoo);
    if (yahooResults && yahooResults.length > 0) {
      if (!twseSuccess) {
        sourceUsed = "Yahoo Finance API";
      } else {
        sourceUsed += " + Yahoo Finance Index";
      }

      yahooResults.forEach((item: any) => {
        const fullSymbol = item.symbol;
        
        if (indexSymbols.includes(fullSymbol)) {
          // Only overwrite if not already fetched (e.g. TWII can be fetched from TWSE)
          if (!fetchedIndices[fullSymbol]) {
            fetchedIndices[fullSymbol] = {
              symbol: fullSymbol,
              name: INDEX_NAMES[fullSymbol] || item.shortName || fullSymbol,
              price: item.regularMarketPrice ?? 0,
              change: item.regularMarketChange ?? 0,
              changePercent: item.regularMarketChangePercent ?? 0,
              prevClose: item.regularMarketPreviousClose ?? 0,
              volume: item.regularMarketVolume ?? 0
            };
          }
        } else {
          // Only use Yahoo backup for stock if we didn't fetch it from TWSE API
          const cleanSym = fullSymbol.replace('.TWO', '').replace('.TW', '');
          if (!yahooDataMap[cleanSym] && WATCHED_SYMBOLS.includes(cleanSym)) {
            const price = item.regularMarketPrice;
            if (price && price > 0) {
              yahooDataMap[cleanSym] = {
                symbol: cleanSym,
                price: price,
                change: item.regularMarketChange ?? 0,
                changePercent: item.regularMarketChangePercent ?? 0,
                previousClose: item.regularMarketPreviousClose ?? price,
                volume: item.regularMarketVolume ?? 0,
                timestamp: now
              };
            }
          }
        }
      });
    }
  } catch (err) {
    console.error('[Yahoo Finance] Failed to fetch quotes from Yahoo:', err);
  }

  // 3. Fallback: Fugle API if key is present and we still have missing stock data
  const apiKey = process.env.FUGLE_API_KEY;
  const missingSymbols = WATCHED_SYMBOLS.filter(sym => !yahooDataMap[sym]);
  if (missingSymbols.length > 0 && apiKey && apiKey.trim() !== '') {
    console.log(`[Fugle API Fallback] Triggering Fugle API for ${missingSymbols.length} missing symbols...`);
    try {
      const results = await fetchInBatches(missingSymbols, 5, async (sym) => {
        return fetchFugleQuote(sym, apiKey);
      });
      results.forEach((q) => {
        if (q && q.symbol) {
          yahooDataMap[q.symbol] = {
            symbol: q.symbol,
            price: q.price,
            change: q.change,
            changePercent: q.changePercent,
            previousClose: q.previousClose,
            volume: q.volume,
            timestamp: now
          };
        }
      });
      sourceUsed = sourceUsed === "Simulated Local Data" ? "Fugle API" : sourceUsed + " + Fugle Fallback";
    } catch (fErr) {
      console.error('[Fugle API Fallback] Failed during batch fetch:', fErr);
    }
  }

  // 4. Build final dataset combining fetched data and fallback defaults
  const outputData: Record<string, any> = {};
  WATCHED_SYMBOLS.forEach((sym) => {
    const fetched = yahooDataMap[sym];
    const defaultData = DEFAULT_PRICES[sym] || { price: 100, name: sym };
    
    if (fetched) {
      outputData[sym] = {
        price: fetched.price,
        change: fetched.change,
        changePercent: fetched.changePercent,
        prevClose: fetched.previousClose,
        volume: fetched.volume,
        isLive: true
      };
    } else {
      // Return simulated/fallback data
      const randomFluctuation = (Math.random() * 0.2 - 0.1); // +/-0.1%
      const simulatedPrice = Number((defaultData.price * (1 + randomFluctuation / 100)).toFixed(2));
      const simulatedChangePercent = Number((randomFluctuation).toFixed(2));
      const simulatedPrevClose = defaultData.price;
      const simulatedChange = Number((simulatedPrice - simulatedPrevClose).toFixed(2));
      
      outputData[sym] = {
        price: simulatedPrice,
        change: simulatedChange,
        changePercent: simulatedChangePercent,
        prevClose: simulatedPrevClose,
        volume: Math.round(Math.random() * 50000 + 15000),
        isLive: false
      };
    }
  });

  // Fallback indices if not fetched successfully
  indexSymbols.forEach((idx) => {
    if (!fetchedIndices[idx]) {
      let simulatedPrice = 0;
      let simulatedChangePercent = 0.2 + (Math.random() * 0.5 - 0.25);
      
      if (idx === '^TWII') {
        simulatedPrice = 22841.5 * (1 + simulatedChangePercent / 100);
      } else if (idx === '^GSPC') {
        simulatedPrice = 5430.2 * (1 + simulatedChangePercent / 100);
      } else if (idx === '^IXIC') {
        simulatedPrice = 17520.1 * (1 + simulatedChangePercent / 100);
      } else if (idx === '^SOX') {
        simulatedPrice = 5210.8 * (1 + simulatedChangePercent / 100);
      } else if (idx === '^DJI') {
        simulatedPrice = 39850.4 * (1 + simulatedChangePercent / 100);
      }
      
      fetchedIndices[idx] = {
        symbol: idx,
        name: INDEX_NAMES[idx] || idx,
        price: Number(simulatedPrice.toFixed(2)),
        change: Number((simulatedPrice * (simulatedChangePercent / 100)).toFixed(2)),
        changePercent: Number(simulatedChangePercent.toFixed(2)),
        prevClose: Number((simulatedPrice / (1 + simulatedChangePercent / 100)).toFixed(2)),
        volume: Math.round(Math.random() * 500000 + 100000)
      };
    }
  });

  res.json({
    success: true,
    source: sourceUsed,
    data: outputData,
    indices: fetchedIndices
  });
});

async function startServer() {
  // Vite dev server setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

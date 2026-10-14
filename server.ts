import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const WATCHED_SYMBOLS = [
  '00631L', '00632R', '00981A', '00991A', '2356', '2885', '3481', '1432',
  '2330', '2317', '2382', '2303', '6770', '2344', '2313', '1605', '2481',
  '3416', '3711', '2618', '2610', '2603', '2609', '2882', '2501', '0050',
  '0056', '00919', '00878', '00927'
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
  '00878': { price: 22.00, name: '國泰永續高股息' },
  '00927': { price: 40.19, name: '群益半導體收益' },
  '3293': { price: 801.00, name: '鈊象' }
};

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

async function fetchYahooHistory(symbol: string): Promise<any[]> {
  const cleanSym = symbol.trim().toUpperCase();
  const suffixes = ['.TW', '.TWO'];
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  for (const suffix of suffixes) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanSym + suffix)}?range=2mo&interval=1d`;
      const response = await globalThis.fetch(url, {
        headers: { "User-Agent": userAgent, "Accept": "application/json" }
      });
      if (!response.ok) continue;
      const data = (await response.json()) as any;
      const result = data?.chart?.result?.[0];
      if (!result || !result.timestamp) continue;

      const timestamps: number[] = result.timestamp;
      const quote = result.indicators?.quote?.[0];
      if (!quote || !quote.close) continue;

      const candles: any[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const ts = timestamps[i];
        const dateObj = new Date(ts * 1000);
        const dateString = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getDate().toString().padStart(2, '0')}`;
        
        const close = quote.close?.[i];
        const open = quote.open?.[i] ?? close;
        const high = quote.high?.[i] ?? close;
        const low = quote.low?.[i] ?? close;
        const volume = quote.volume?.[i] ?? 10000;

        if (close !== null && close !== undefined && !isNaN(close)) {
          candles.push({
            time: dateString,
            open: Number(Number(open || close).toFixed(2)),
            high: Number(Number(high || close).toFixed(2)),
            low: Number(Number(low || close).toFixed(2)),
            close: Number(Number(close).toFixed(2)),
            volume: Math.round(volume || 10000)
          });
        }
      }

      if (candles.length > 0) {
        return candles;
      }
    } catch (e) {
      console.warn(`[Yahoo History] Failed for ${cleanSym}${suffix}:`, e);
    }
  }

  return [];
}

interface EtfIndicatorItem {
  id: string;
  name: string;
  price: number;
  nav: number;
  navSpread: number;
  discountPremium: number;
  prevNav: number;
  navChange: number;
  navChangePercent: number;
  date: string;
  time: string;
  sourceUrl: string;
}

let cachedEtfIndicators: EtfIndicatorItem[] = [];
let lastEtfIndicatorFetchTime = 0;
const ETF_CACHE_TTL = 15 * 1000; // 15 seconds

async function fetchTwseEtfIndicators(): Promise<EtfIndicatorItem[]> {
  const now = Date.now();
  if (cachedEtfIndicators.length > 0 && (now - lastEtfIndicatorFetchTime) < ETF_CACHE_TTL) {
    return cachedEtfIndicators;
  }

  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await globalThis.fetch("https://mis.twse.com.tw/stock/data/all_etf.txt", {
      headers: {
        "User-Agent": userAgent,
        "Referer": "https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant",
        "Accept": "application/json"
      }
    });

    if (response.ok) {
      const data = await response.json() as any;
      const list: EtfIndicatorItem[] = [];
      const seen = new Set<string>();

      for (const group of (data?.a1 || [])) {
        for (const item of (group?.msgArray || [])) {
          if (!item.a || seen.has(item.a)) continue;
          seen.add(item.a);

          const parseNum = (v: any) => {
            if (v === undefined || v === null || v === '-' || v === '') return 0;
            const cleanStr = String(v).replace(/,/g, '');
            const n = Number(cleanStr);
            return isNaN(n) ? 0 : n;
          };

          const price = parseNum(item.e);
          const nav = parseNum(item.f);
          const prevNav = parseNum(item.h);
          const discountPremium = parseNum(item.g);
          const navSpread = Number((price - nav).toFixed(2));
          const navChange = Number((nav - prevNav).toFixed(2));
          const navChangePercent = prevNav > 0 ? Number((((nav - prevNav) / prevNav) * 100).toFixed(2)) : 0;
          
          let cleanName = String(item.b || item.a).split('(')[0].trim();
          if (cleanName.endsWith('證券投資信託基金')) {
            cleanName = cleanName.replace('證券投資信託基金', '');
          }

          list.push({
            id: String(item.a).trim(),
            name: cleanName,
            price,
            nav,
            navSpread,
            discountPremium,
            prevNav,
            navChange,
            navChangePercent,
            date: String(item.i || ''),
            time: String(item.j || ''),
            sourceUrl: "https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant"
          });
        }
      }

      if (list.length > 0) {
        cachedEtfIndicators = list;
        lastEtfIndicatorFetchTime = now;
        return list;
      }
    }
  } catch (err) {
    console.error('[TWSE ETF Indicators] Fetch failed:', err);
  }

  return cachedEtfIndicators;
}

// REST endpoint for stocks
app.get('/api/stocks', async (req, res) => {
  const now = Date.now();
  let yahooDataMap: Record<string, any> = {};
  let fetchedIndices: Record<string, any> = {};
  let sourceUsed = "Simulated Local Data";

  const indexSymbols = ['^TWII', '^GSPC', '^IXIC', '^SOX', '^DJI'];

  // Support user requested symbols via query parameter e.g. /api/stocks?symbols=2330,2454,00940
  let requestedSymbols: string[] = [];
  if (req.query.symbols) {
    requestedSymbols = String(req.query.symbols)
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0 && /^[A-Z0-9.]+$/.test(s));
  }

  const allSymbols = Array.from(new Set([...WATCHED_SYMBOLS, ...requestedSymbols]));

  // Helper parser for TWSE real-time API values
  const parseVal = (v: any) => {
    if (v === undefined || v === null || v === '-' || v === '') return null;
    const num = Number(v);
    return isNaN(num) ? null : num;
  };

  // 1. Try fetching Taiwan Stocks and Taiwan Index via TWSE mis API first
  console.log(`[TWSE API] Fetching live Taiwan quotes for ${allSymbols.length} symbols...`);
  let twseSuccess = false;
  try {
    const twseResults = await fetchTwseQuotes(allSymbols);
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
          if (allSymbols.includes(cleanSym)) {
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
  console.log(`[Yahoo Finance] Fetching US indices and quotes...`);
  try {
    const missingYahooSymbols = allSymbols.filter(sym => !yahooDataMap[sym]);
    const symbolsToFetchYahoo = [
      ...missingYahooSymbols.map(sym => `${sym}.TW`),
      ...missingYahooSymbols.map(sym => `${sym}.TWO`),
      ...indexSymbols
    ];

    if (symbolsToFetchYahoo.length > 0) {
      const yahooResults = await fetchYahooQuotes(symbolsToFetchYahoo);
      if (yahooResults && yahooResults.length > 0) {
        if (!twseSuccess) {
          sourceUsed = "Yahoo Finance API";
        } else {
          sourceUsed += " + Yahoo Finance";
        }

        yahooResults.forEach((item: any) => {
          const fullSymbol = item.symbol;
          
          if (indexSymbols.includes(fullSymbol)) {
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
            const cleanSym = fullSymbol.replace('.TWO', '').replace('.TW', '');
            if (!yahooDataMap[cleanSym] && allSymbols.includes(cleanSym)) {
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
    }
  } catch (err) {
    console.error('[Yahoo Finance] Failed to fetch quotes from Yahoo:', err);
  }

  // 3. Build final dataset combining fetched data and fallback defaults
  const outputData: Record<string, any> = {};

  // Fetch real-time TWSE ETF indicators if any ETF is in symbols
  let twseEtfMap: Record<string, EtfIndicatorItem> = {};
  try {
    const etfIndicators = await fetchTwseEtfIndicators();
    etfIndicators.forEach(item => {
      twseEtfMap[item.id] = item;
    });
  } catch (err) {
    console.warn('[TWSE ETF] Could not load indicators for /api/stocks:', err);
  }

  allSymbols.forEach((sym) => {
    const fetched = yahooDataMap[sym];
    const defaultData = DEFAULT_PRICES[sym] || { price: 100, name: sym };
    const etfInfo = twseEtfMap[sym];
    
    if (fetched) {
      outputData[sym] = {
        price: fetched.price,
        change: fetched.change,
        changePercent: fetched.changePercent,
        prevClose: fetched.previousClose,
        volume: fetched.volume,
        isLive: true,
        etfIndicator: etfInfo ? {
          nav: etfInfo.nav,
          discountPremium: etfInfo.discountPremium,
          navSpread: etfInfo.navSpread,
          prevNav: etfInfo.prevNav,
          navChange: etfInfo.navChange,
          navChangePercent: etfInfo.navChangePercent,
          time: etfInfo.time
        } : undefined
      };
    } else if (etfInfo && etfInfo.price > 0) {
      // Direct live TWSE ETF quote
      const prevClose = etfInfo.prevNav > 0 ? etfInfo.prevNav : etfInfo.price;
      const change = Number((etfInfo.price - prevClose).toFixed(2));
      const changePercent = prevClose > 0 ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
      outputData[sym] = {
        price: etfInfo.price,
        change,
        changePercent,
        prevClose,
        volume: 35000,
        isLive: true,
        etfIndicator: {
          nav: etfInfo.nav,
          discountPremium: etfInfo.discountPremium,
          navSpread: etfInfo.navSpread,
          prevNav: etfInfo.prevNav,
          navChange: etfInfo.navChange,
          navChangePercent: etfInfo.navChangePercent,
          time: etfInfo.time
        }
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
        isLive: false,
        etfIndicator: etfInfo ? {
          nav: etfInfo.nav,
          discountPremium: etfInfo.discountPremium,
          navSpread: etfInfo.navSpread,
          prevNav: etfInfo.prevNav,
          navChange: etfInfo.navChange,
          navChangePercent: etfInfo.navChangePercent,
          time: etfInfo.time
        } : undefined
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

// Endpoint to fetch real-time ETF Net Asset Value (NAV) & Premium/Discount Indicators
// Reference: https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant
app.get('/api/etf/indicators', async (req, res) => {
  try {
    const list = await fetchTwseEtfIndicators();
    res.json({
      success: true,
      source: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant',
      officialSite: 'https://mis.twse.com.tw/stock/various-areas/etf-price/indicator-disclosure-etf?lang=zhHant',
      count: list.length,
      timestamp: Date.now(),
      data: list
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to automatically fetch Chinese stock/ETF name and info
app.get('/api/stock/:symbol/info', async (req, res) => {
  const cleanSym = String(req.params.symbol).trim().toUpperCase();
  if (!cleanSym) {
    return res.status(400).json({ success: false, message: 'Invalid symbol' });
  }

  try {
    // 1. Check TWSE ETF indicators (contains 350+ official ETF Chinese names)
    const etfList = await fetchTwseEtfIndicators();
    const etfMatch = etfList.find(e => e.id.toUpperCase() === cleanSym);
    if (etfMatch) {
      return res.json({
        success: true,
        id: cleanSym,
        name: etfMatch.name,
        fullName: etfMatch.name,
        price: etfMatch.price,
        prevClose: etfMatch.prevNav || etfMatch.price,
        nav: etfMatch.nav,
        discountPremium: etfMatch.discountPremium,
        market: 'ETF',
        isEtf: true,
        source: 'TWSE Official ETF Indicator Disclosure'
      });
    }

    // 2. Check TWSE official real-time stock info API
    const twseQuotes = await fetchTwseQuotes([cleanSym]);
    const quote = twseQuotes.find((m: any) => m.c?.toUpperCase() === cleanSym);
    if (quote && (quote.n || quote.nf)) {
      const name = quote.n ? quote.n.trim() : quote.nf.trim();
      const zPrice = Number(quote.z) || Number(quote.y) || 0;
      const yPrice = Number(quote.y) || zPrice;
      return res.json({
        success: true,
        id: cleanSym,
        name: name,
        fullName: quote.nf ? quote.nf.trim() : name,
        price: zPrice,
        prevClose: yPrice,
        market: quote.ex === 'otc' ? '上櫃' : '上市',
        isEtf: cleanSym.startsWith('00'),
        source: 'TWSE Official mis API'
      });
    }

    // 3. Fallback to DEFAULT_PRICES
    const defaultItem = DEFAULT_PRICES[cleanSym];
    if (defaultItem) {
      return res.json({
        success: true,
        id: cleanSym,
        name: defaultItem.name,
        price: defaultItem.price,
        prevClose: defaultItem.price,
        market: cleanSym.startsWith('00') ? 'ETF' : '上市',
        isEtf: cleanSym.startsWith('00'),
        source: 'Local Stock Database'
      });
    }

    // 4. Fallback to Yahoo Quotes
    const yQuotes = await fetchYahooQuotes([`${cleanSym}.TW`, `${cleanSym}.TWO`]);
    if (yQuotes && yQuotes.length > 0) {
      const y = yQuotes[0];
      const yName = y.shortName || y.longName || cleanSym;
      return res.json({
        success: true,
        id: cleanSym,
        name: yName,
        fullName: y.longName || yName,
        price: y.regularMarketPrice || 0,
        prevClose: y.regularMarketPreviousClose || 0,
        market: y.symbol.endsWith('.TWO') ? '上櫃' : '上市',
        isEtf: cleanSym.startsWith('00'),
        source: 'Yahoo Finance'
      });
    }

    return res.json({
      success: true,
      id: cleanSym,
      name: `台股 ${cleanSym}`,
      price: 100,
      prevClose: 100,
      market: cleanSym.startsWith('00') ? 'ETF' : '上市',
      isEtf: cleanSym.startsWith('00'),
      source: 'Default'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to fetch real historical K-lines for a stock
app.get('/api/stock/:symbol/history', async (req, res) => {
  const { symbol } = req.params;
  try {
    const candles = await fetchYahooHistory(symbol);
    if (candles && candles.length > 0) {
      return res.json({
        success: true,
        symbol: symbol.toUpperCase(),
        source: 'Yahoo Finance History API',
        candles
      });
    }
    return res.json({
      success: false,
      symbol: symbol.toUpperCase(),
      message: 'No history found from Yahoo Finance API',
      candles: []
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
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

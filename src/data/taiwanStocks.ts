export interface StockSearchItem {
  id: string;
  name: string;
  category: string;
  market: '上市' | '上櫃' | 'ETF';
}

export const TAIWAN_STOCKS_DATABASE: StockSearchItem[] = [
  // 權值與半導體 (Semiconductors & Tech Giants)
  { id: '2330', name: '台積電', category: '半導體晶圓代工', market: '上市' },
  { id: '2454', name: '聯發科', category: 'IC設計', market: '上市' },
  { id: '2303', name: '聯電', category: '晶圓代工', market: '上市' },
  { id: '2379', name: '瑞昱', category: 'IC設計', market: '上市' },
  { id: '3034', name: '聯詠', category: 'IC設計/驅動IC', market: '上市' },
  { id: '3008', name: '大立光', category: '光學鏡頭', market: '上市' },
  { id: '3661', name: '世芯-KY', category: 'IP/ASIC設計', market: '上市' },
  { id: '3443', name: '創意', category: 'IP/ASIC設計', market: '上市' },
  { id: '3529', name: '力旺', category: '矽智財IP', market: '上市' },
  { id: '6415', name: '矽力*-KY', category: '電源管理IC', market: '上市' },
  { id: '3035', name: '智原', category: 'ASIC服務', market: '上市' },
  { id: '2449', name: '京元電子', category: '半導體封測', market: '上市' },
  { id: '3711', name: '日月光投控', category: '半導體封測', market: '上市' },
  { id: '6239', name: '力成', category: '記憶體封測', market: '上市' },
  { id: '2408', name: '南亞科', category: 'DRAM記憶體', market: '上市' },
  { id: '2344', name: '華邦電', category: '記憶體/Flash', market: '上市' },
  { id: '2337', name: '旺宏', category: 'NOR Flash', market: '上市' },
  { id: '6531', name: '愛普*', category: '記憶體IP', market: '上市' },

  // AI 伺服器與電子組裝 (AI Server, Electronics & Assemblies)
  { id: '2317', name: '鴻海', category: '電子代工/電動車', market: '上市' },
  { id: '2382', name: '廣達', category: 'AI伺服器/筆電代工', market: '上市' },
  { id: '3231', name: '緯創', category: 'AI伺服器代工', market: '上市' },
  { id: '6669', name: '緯穎', category: '雲端AI伺服器', market: '上市' },
  { id: '2356', name: '英業達', category: '伺服器/筆電', market: '上市' },
  { id: '2357', name: '華碩', category: '品牌電腦/顯卡', market: '上市' },
  { id: '2324', name: '仁寶', category: '電子代工', market: '上市' },
  { id: '2308', name: '台達電', category: '電源管理/綠能/儲能', market: '上市' },
  { id: '2301', name: '光寶科', category: '電源模組/LED', market: '上市' },
  { id: '2345', name: '智邦', category: '高速網通交換器', market: '上市' },
  { id: '3037', name: '欣興', category: 'ABF載板', market: '上市' },
  { id: '8046', name: '南電', category: 'ABF載板', market: '上市' },
  { id: '3189', name: '景碩', category: '載板', market: '上市' },
  { id: '2368', name: '金像電', category: '高階PCB伺服器板', market: '上市' },
  { id: '3017', name: '奇鋐', category: 'AI散熱模組', market: '上市' },
  { id: '3324', name: '雙鴻', category: '水冷/散熱模組', market: '上市' },
  { id: '2059', name: '川湖', category: '伺服器導軌', market: '上市' },

  // 上櫃指標股與高價股 (TPEx Leaders & Gaming)
  { id: '3293', name: '鈊象', category: '商用遊戲機/線上博弈', market: '上櫃' },
  { id: '5274', name: '信驊', category: 'BMC晶片/伺服器管理', market: '上櫃' },
  { id: '3529', name: '力旺', category: '嵌入式記憶體IP', market: '上櫃' },
  { id: '6488', name: '環球晶', category: '矽晶圓半導體', market: '上櫃' },
  { id: '8299', name: '群聯', category: 'NAND控制IC', market: '上櫃' },
  { id: '3131', name: '弘塑', category: '先進封裝CoWoS設備', market: '上櫃' },
  { id: '3680', name: '家登', category: '半導體光罩載具', market: '上櫃' },

  // 金融股 (Financial Institutions)
  { id: '2881', name: '富邦金', category: '金融金控', market: '上市' },
  { id: '2882', name: '國泰金', category: '金融金控', market: '上市' },
  { id: '2891', name: '中信金', category: '金融金控', market: '上市' },
  { id: '2886', name: '兆豐金', category: '公股金控', market: '上市' },
  { id: '2884', name: '玉山金', category: '民營金控', market: '上市' },
  { id: '2892', name: '第一金', category: '公股金控', market: '上市' },
  { id: '2880', name: '華南金', category: '公股金控', market: '上市' },
  { id: '2885', name: '元大金', category: '證券金控', market: '上市' },
  { id: '2883', name: '開發金', category: '壽險金控', market: '上市' },
  { id: '2890', name: '永豐金', category: '民營金控', market: '上市' },
  { id: '2887', name: '台新金', category: '民營金控', market: '上市' },
  { id: '5880', name: '合庫金', category: '公股金控', market: '上市' },
  { id: '2801', name: '彰銀', category: '公股銀行', market: '上市' },
  { id: '2834', name: '臺企銀', category: '公股銀行', market: '上市' },
  { id: '5876', name: '上海商銀', category: '商業銀行', market: '上市' },

  // 航運、鋼鐵、塑化與傳產 (Shipping, Steel & Traditional Industries)
  { id: '2603', name: '長榮', category: '貨櫃航運', market: '上市' },
  { id: '2609', name: '陽明', category: '貨櫃航運', market: '上市' },
  { id: '2615', name: '萬海', category: '貨櫃航運', market: '上市' },
  { id: '2618', name: '長榮航', category: '民航客運/貨運', market: '上市' },
  { id: '2610', name: '華航', category: '民航客運/貨運', market: '上市' },
  { id: '2002', name: '中鋼', category: '鋼鐵龍頭', market: '上市' },
  { id: '1301', name: '台塑', category: '石化塑膠', market: '上市' },
  { id: '1303', name: '南亞', category: '石化/電子材料', market: '上市' },
  { id: '1326', name: '台化', category: '芳香烴/塑膠', market: '上市' },
  { id: '6505', name: '台塑化', category: '煉油石化', market: '上市' },
  { id: '1101', name: '台泥', category: '水泥/綠能儲能', market: '上市' },
  { id: '1102', name: '亞泥', category: '水泥建材', market: '上市' },
  { id: '2201', name: '裕隆', category: '汽車製造', market: '上市' },
  { id: '2207', name: '和泰車', category: '汽車總代理', market: '上市' },
  { id: '9910', name: '豐泰', category: '運動鞋製造', market: '上市' },
  { id: '9904', name: '寶成', category: '製鞋龍頭', market: '上市' },
  { id: '1216', name: '統一', category: '食品食品加工', market: '上市' },
  { id: '2912', name: '統一超', category: '連鎖便利商店', market: '上市' },

  // 熱門高股息 ETF (High-Yield ETFs)
  { id: '0056', name: '元大高股息', category: '高股息', market: 'ETF' },
  { id: '00878', name: '國泰永續高股息', category: '高股息', market: 'ETF' },
  { id: '00919', name: '群益台灣精選高息', category: '高股息', market: 'ETF' },
  { id: '00927', name: '群益半導體收益', category: '半導體收益/高息', market: 'ETF' },
  { id: '00929', name: '復華台灣科技優息', category: '高股息', market: 'ETF' },
  { id: '00940', name: '元大台灣價值高息', category: '高股息', market: 'ETF' },
  { id: '00939', name: '統一台灣高息動能', category: '高股息', market: 'ETF' },
  { id: '00915', name: '凱基優選高股息30', category: '高股息', market: 'ETF' },
  { id: '00918', name: '大華優利高股息30', category: '高股息', market: 'ETF' },
  { id: '00713', name: '元大台灣高息低波', category: '高股息', market: 'ETF' },
  { id: '00900', name: '富邦特選高股息30', category: '高股息', market: 'ETF' },
  { id: '00934', name: '中信成長高股息', category: '高股息', market: 'ETF' },
  { id: '00936', name: '台新永續高息中小', category: '高股息', market: 'ETF' },

  // 熱門市值型與主題型 ETF (Market Cap & Thematic ETFs)
  { id: '0050', name: '元大台灣50', category: '市值型', market: 'ETF' },
  { id: '006208', name: '富邦台50', category: '市值型', market: 'ETF' },
  { id: '00631L', name: '元大台灣50正二', category: '槓桿型', market: 'ETF' },
  { id: '00632R', name: '元大台灣50反一', category: '反向型', market: 'ETF' },
  { id: '00981A', name: '主動統一台股增長', category: '主動型基金', market: 'ETF' },
  { id: '00991A', name: '主動復華未來50', category: '主動型基金', market: 'ETF' },
  { id: '0052', name: '富邦科技', category: '科技型', market: 'ETF' },
  { id: '00881', name: '國泰台灣5G+', category: '科技型', market: 'ETF' },
  { id: '00935', name: '野村臺灣創新科技50', category: '科技型', market: 'ETF' },
  { id: '00891', name: '中信關鍵半導體', category: '半導體型', market: 'ETF' },
  { id: '00892', name: '富邦台灣半導體', category: '半導體型', market: 'ETF' },
  { id: '00904', name: '新光臺灣半導體30', category: '半導體型', market: 'ETF' },
  { id: '00922', name: '國泰台灣領袖50', category: '市值型', market: 'ETF' },
  { id: '00923', name: '群益台灣ESG低碳50', category: '市值型', market: 'ETF' },

  // 債券型與海外型 ETF (Bond & Overseas ETFs)
  { id: '00679B', name: '元大美債20年', category: '美債型', market: 'ETF' },
  { id: '00687B', name: '國泰20年美債', category: '美債型', market: 'ETF' },
  { id: '00937B', name: '群益ESG投等債20+', category: '公司債型', market: 'ETF' },
  { id: '00751B', name: '元大AAA至A公司債', category: '公司債型', market: 'ETF' },
  { id: '00720B', name: '元大投資級公司債', category: '公司債型', market: 'ETF' },
  { id: '00662', name: '富邦NASDAQ', category: '海外科技', market: 'ETF' },
  { id: '00757', name: '統一FAANG+', category: '海外科技', market: 'ETF' },
  { id: '00830', name: '國泰費城半導體', category: '海外半導體', market: 'ETF' }
];

export function searchTaiwanStocks(query: string): StockSearchItem[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];

  return TAIWAN_STOCKS_DATABASE.filter(item => 
    item.id.toUpperCase().includes(q) ||
    item.name.includes(query) ||
    item.category.includes(query)
  ).slice(0, 15);
}

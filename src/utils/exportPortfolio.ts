import { Stock } from '../types';

/**
 * 一鍵匯出持股明細為 .xlsx（不含股數為 0 的股票）。
 * exceljs 以動態載入，不影響首頁載入速度。
 * 回傳匯出的檔案名稱與筆數；沒有可匯出的持股時回傳 null。
 */
export async function exportPortfolioXlsx(stocks: Stock[]): Promise<{ fileName: string; count: number } | null> {
  const held = stocks.filter((s) => s.shares > 0);
  if (held.length === 0) return null;

  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet('持股明細', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: '代號', key: 'id', width: 10 },
    { header: '名稱', key: 'name', width: 22 },
    { header: '股數', key: 'shares', width: 12, style: { numFmt: '#,##0' } },
    { header: '張數', key: 'lots', width: 10, style: { numFmt: '#,##0.###' } },
    { header: '平均成本', key: 'cost', width: 12, style: { numFmt: '#,##0.00' } },
    { header: '現價', key: 'price', width: 12, style: { numFmt: '#,##0.00' } },
    { header: '單日漲跌(%)', key: 'change', width: 13, style: { numFmt: '0.00' } },
    { header: '成本總額', key: 'totalCost', width: 15, style: { numFmt: '#,##0' } },
    { header: '市值', key: 'marketValue', width: 15, style: { numFmt: '#,##0' } },
    { header: '未實現損益', key: 'pnl', width: 15, style: { numFmt: '#,##0;[Red]-#,##0' } },
    { header: '損益(%)', key: 'pnlPct', width: 11, style: { numFmt: '0.00;[Red]-0.00' } },
    { header: '報價時間', key: 'quoteTime', width: 20 },
  ];

  held.forEach((s, i) => {
    const r = i + 2; // 資料列（第 1 列為標題）
    ws.addRow({
      id: s.id,
      name: s.name,
      shares: s.shares,
      lots: { formula: `C${r}/1000`, result: s.shares / 1000 },
      cost: s.cost,
      price: s.price,
      change: s.change,
      totalCost: { formula: `C${r}*E${r}`, result: s.shares * s.cost },
      marketValue: { formula: `C${r}*F${r}`, result: s.shares * s.price },
      pnl: { formula: `I${r}-H${r}`, result: s.shares * (s.price - s.cost) },
      pnlPct: {
        formula: `IF(H${r}=0,0,J${r}/H${r}*100)`,
        result: s.cost > 0 ? ((s.price - s.cost) / s.cost) * 100 : 0,
      },
      quoteTime: s.quoteAsOf ? new Date(s.quoteAsOf).toLocaleString('zh-TW', { hour12: false }) : '',
    });
  });

  // 合計列
  const last = held.length + 1;
  const total = ws.addRow({
    id: '合計',
    totalCost: { formula: `SUM(H2:H${last})`, result: held.reduce((a, s) => a + s.shares * s.cost, 0) },
    marketValue: { formula: `SUM(I2:I${last})`, result: held.reduce((a, s) => a + s.shares * s.price, 0) },
    pnl: { formula: `SUM(J2:J${last})`, result: held.reduce((a, s) => a + s.shares * (s.price - s.cost), 0) },
  });
  const totalCostV = held.reduce((a, s) => a + s.shares * s.cost, 0);
  const totalPnlV = held.reduce((a, s) => a + s.shares * (s.price - s.cost), 0);
  total.getCell('pnlPct').value = {
    formula: `IF(H${last + 1}=0,0,J${last + 1}/H${last + 1}*100)`,
    result: totalCostV > 0 ? (totalPnlV / totalCostV) * 100 : 0,
  };
  total.eachCell((c) => {
    c.font = { bold: true };
    c.border = { top: { style: 'thin' } };
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
  header.alignment = { vertical: 'middle', horizontal: 'center' };

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fileName = `持股明細_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { fileName, count: held.length };
}

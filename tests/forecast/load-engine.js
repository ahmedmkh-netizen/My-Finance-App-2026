// يستخرج منطق الكروت من index.src.html (من غير تشغيل الصفحة) عشان نختبره بـ node.
// الاستخدام: const E = require('./load-engine.js')(pathToIndexSrc)
const fs = require("fs");
module.exports = function (srcPath) {
  const src = fs.readFileSync(srcPath, "utf8").replace(/\r\n/g, "\n");
  const slice = (a, b) => {
    const i = src.indexOf(a);
    if (i < 0) throw new Error("anchor not found: " + a);
    const j = src.indexOf(b, i + a.length);
    if (j < 0) throw new Error("end anchor not found: " + b);
    return src.slice(i, j);
  };
  const parts = [
    'const HANY_TAB_METHOD="hany_tab",HANY_TAB_CATEGORY="مشتريات محل هاني",HANY_SETTLE_CATEGORY="سداد دفتر هاني",HANY_REFUND_EFFECT="refund";',
    'const normalizeCategory=c=>(c==="مسحوبات محل هاني"||c==="مشتريات بقالة هاني")?HANY_TAB_CATEGORY:c;',
    'const isHanyShopCategory=c=>normalizeCategory(c)===HANY_TAB_CATEGORY; const isHanySettleCategory=c=>c===HANY_SETTLE_CATEGORY;',
    slice("const ALL_MONTHS = [", "const YEARS_CONFIG"),
    "const getMonthIndex = (m) => ALL_MONTHS.indexOf(m);",
    slice("const roundMoney = (v) =>", "const fmt = (n) =>"),
    slice("const getLocalISODate = (d", "const getLocalTimeHM"),
    slice("const dayStart = (d)", "const endOfToday"),
    "const endOfToday = () => { const x = new Date(); x.setHours(23, 59, 59, 999); return x; };",
    slice("const parseISODate = (iso)", "const formatTxTimeHM"),
    slice("const getCardMethod = (card)", "const hasCashEffect"),
    slice("const isCarryoverMarker = (t)", "const _balanceCache = new Map()"),
    slice("const isCardPaymentTx = (t, cardId)", "let _appReady"),
    slice("const computeCardDebt = (data, card", "const computeCardAvailable"),
    slice("/* ═══════════════ CARD INSTALLMENTS ENGINE", "/* ═══════════════ MIGRATION V90"),
    "return {computeCardPaymentPrediction,buildCardStatementEngine,computeCardDebt,computeCardInstallmentsInfo,getCycleKeyForDate,getCycleRange};",
  ];
  return new Function(parts.join("\n"))();
};

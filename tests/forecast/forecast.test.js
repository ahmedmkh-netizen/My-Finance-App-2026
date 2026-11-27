// اختبارات منطق الكروت على بيانات تجريبية (مفيش بيانات حقيقية في الريبو).
// التشغيل: node tests/forecast/forecast.test.js
const assert = require("assert");
const path = require("path");
const E = require("./load-engine.js")(path.join(__dirname, "../../index.src.html"));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h);
const tx = (o) => ({ status: "paid", type: "expense", amount: 0, source: "x", ...o });
const mk = (over) => ({ id: 1, bank: "CIB", name: "Titanium", last4: "1016", subCardLast4: [], limit: 100000,
  openingDebt: 10000, openingDebtDate: "2026-11-02", statementDay: 10, dueDay: 5, cycleType: "next-month-due", apr: 18, ...over });

t("كشف يوم 10 وسداد يوم 5: السداد بعد الكشف والدورة من 10 للـ 9", () => {
  const card = mk();
  const r = E.getCycleRange(card, "2026-11");
  assert.strictEqual(r.cycleStartISO, "2026-10-10");
  assert.strictEqual(r.cycleEndISO, "2026-11-09");
  assert.strictEqual(r.statementDateISO, "2026-11-10");
  assert.strictEqual(r.dueDateISO, "2026-12-05");
  assert.strictEqual(E.getCycleKeyForDate(card, "2026-11-05"), "2026-11");
  assert.strictEqual(E.getCycleKeyForDate(card, "2026-11-10"), "2026-12");
});

t("كشف يوم 1: الدورة الشهر السابق كاملاً زي الأول", () => {
  const card = mk({ statementDay: 1, dueDay: 25 });
  const r = E.getCycleRange(card, "2026-12");
  assert.strictEqual(r.cycleStartISO, "2026-11-01");
  assert.strictEqual(r.cycleEndISO, "2026-11-30");
  assert.strictEqual(r.statementDateISO, "2026-12-01");
  assert.strictEqual(r.dueDateISO, "2026-12-25");
});

t("مشتريات 5 نوفمبر تدخل كشف 10 نوفمبر، ومشتريات 15 نوفمبر تدخل كشف 10 ديسمبر", () => {
  const card = mk();
  const data = { cards: [card], cardInstallments: [], transactions: [
    tx({ id: "a", date: "2026-11-05", amount: 100, linkedCardId: 1 }),
    tx({ id: "b", date: "2026-11-15", amount: 300, linkedCardId: 1 }) ] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  const c11 = p.cycles.find((c) => c.cycleKey === "2026-11");
  const c12 = p.cycles.find((c) => c.cycleKey === "2026-12");
  assert.strictEqual(c11.purchases, 100);
  assert.strictEqual(c12.purchases, 300);
  assert.strictEqual(p.nextDueDateISO, "2026-12-05"); // مش 5 نوفمبر
});

t("قسط اتدفع قبل شهر البداية بيقصّر الجدول (مفيش قسط وهمي)", () => {
  const card = mk({ statementDay: 1, dueDay: 25, id: 4, bank: "ADIB Egypt", name: "Tainum" });
  const plan = { id: "p1", cardId: 4, months: 3, startMonth: "نوفمبر", startYear: 2026, totalAmount: 3000, monthlyAmount: 1000, paidAmount: 1000, status: "active" };
  const data = { cards: [card], cardInstallments: [plan], transactions: [
    tx({ id: "adv", date: "2026-10-20", amount: 1000, linkedCardId: 4, source: "card-payment-plan", linkedPlanId: "p1", category: "الالتزامات البنكية والتمويلية" }) ] };
  const p = E.computeCardPaymentPrediction(data, card, D(2027, 1, 20));
  const withInst = p.cycles.filter((c) => c.installmentsDueThisCycle > 0).map((c) => c.cycleKey);
  assert.deepStrictEqual(withInst, ["2026-11", "2026-12"]);
});

t("خطة عادية (بدون دفعة مقدمة) بتفضل بعدد شهورها كامل", () => {
  const card = mk({ statementDay: 1, dueDay: 25 });
  const plan = { id: "p2", cardId: 1, months: 3, startMonth: "نوفمبر", startYear: 2026, totalAmount: 3000, monthlyAmount: 1000, paidAmount: 0, status: "active" };
  const data = { cards: [card], cardInstallments: [plan], transactions: [] };
  const p = E.computeCardPaymentPrediction(data, card, D(2027, 1, 20));
  assert.deepStrictEqual(p.cycles.filter((c) => c.installmentsDueThisCycle > 0).map((c) => c.cycleKey), ["2026-11", "2026-12", "2027-01"]);
});

t("مفيش دورات وهمية قبل تاريخ الرصيد الافتتاحي", () => {
  const card = mk({ statementDay: 10, dueDay: 5 });
  const plan = { id: "p3", cardId: 1, months: 12, startMonth: "أغسطس", startYear: 2026, totalAmount: 12000, monthlyAmount: 1000, paidAmount: 3000, status: "active" };
  const data = { cards: [card], cardInstallments: [plan], transactions: [] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  assert.ok(p.cycles.every((c) => c.cycleEnd.getTime() >= new Date(2026, 10, 2).getTime()), "no cycle ends before opening");
  assert.ok(p.cycles.every((c) => c.financeCharges === 0 || c.cycleKey > "2026-10"));
});

t("آخر كشف قبل الافتتاحي بيوم بيفضل (الرصيد الافتتاحي = رصيد الكشف)", () => {
  const card = mk({ statementDay: 1, dueDay: 25, openingDebtDate: "2026-11-02" });
  const plan = { id: "p4", cardId: 1, months: 6, startMonth: "سبتمبر", startYear: 2026, totalAmount: 6000, monthlyAmount: 1000, paidAmount: 2000, status: "active" };
  const data = { cards: [card], cardInstallments: [plan], transactions: [] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  assert.deepStrictEqual(p.cycles.map((c) => c.cycleKey), ["2026-11", "2026-12"]);
  assert.strictEqual(p.currentStatement.cycleKey, "2026-11");
  assert.strictEqual(p.currentStatement.closingBalance, 10000);
});

t("مفيش عدّ مزدوج للأقساط: المطلوب الكلي = المديونية لما مفيش كشف", () => {
  const card = mk({ statementDay: 1, dueDay: 10, openingDebt: 0, openingDebtDate: "2026-11-02", id: 3 });
  const plan = { id: "p5", cardId: 3, months: 3, startMonth: "ديسمبر", startYear: 2026, totalAmount: 900, monthlyAmount: 300, paidAmount: 0, status: "active", linkedTxIds: ["pp"] };
  const data = { cards: [card], cardInstallments: [plan], transactions: [
    tx({ id: "pp", date: "2026-11-20", amount: 900, linkedCardId: 3, source: "installment-purchase", linkedPlanId: "p5" }) ] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  assert.strictEqual(p.currentDebt, 900);
  // المطلوب في الكشف = أول قسط بس (300). باقي الأصل (600) لسه ماجاش معاده.
  assert.strictEqual(p.totalMandatory, 300);
  assert.strictEqual(p.nextCycleEstimate, 300);
});

t("المطلوب في الكشف مش بيشمل أصل الأقساط اللي لسه ماجاش (بنك بقسط 1000 x 6)", () => {
  const card = mk({ statementDay: 1, dueDay: 25, openingDebt: 6000 + 500, openingDebtDate: "2026-11-01" });
  const plan = { id: "p6", cardId: 1, months: 6, startMonth: "نوفمبر", startYear: 2026, totalAmount: 6000, monthlyAmount: 1000, paidAmount: 0, status: "active" };
  const data = { cards: [card], cardInstallments: [plan], transactions: [] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  const st = p.currentStatement;
  assert.strictEqual(st.closingBalance, 6500);
  assert.strictEqual(st.unbilledPrincipal, 5000); // 5 أقساط لسه
  assert.strictEqual(st.totalDue, 1500);          // 500 مشتريات عادية + قسط 1000
  assert.strictEqual(p.totalMandatory, 1500);
  assert.ok(st.minDue <= st.totalDue);
});

t("المتوقع عند تاريخ السداد = المديونية + مصروفات مجدولة - سدادات مجدولة", () => {
  const card = mk({ statementDay: 1, dueDay: 25, openingDebt: 5000 });
  const data = { cards: [card], cardInstallments: [], transactions: [
    tx({ id: "c1", status: "pending", date: "2026-12-03", amount: 400, linkedCardId: 1 }),
    tx({ id: "c2", status: "pending", date: "2027-02-03", amount: 999, linkedCardId: 1 }), // بعد تاريخ السداد
    tx({ id: "pay", status: "pending", date: "2026-12-20", amount: 1500, linkedCardId: 1, source: "card-payment-plan", category: "الالتزامات البنكية والتمويلية" }),
    tx({ id: "other", status: "pending", date: "2026-12-04", amount: 777, linkedCardId: 2 }) ] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  assert.strictEqual(p.pendingCharges, 400);
  assert.strictEqual(p.pendingPayments, 1500);
  assert.strictEqual(p.projectedAtDue, 5000 + 400 - 1500);
});

t("مدفوع بتاريخ مستقبلي: مش في مديونية النهارده، لكن في المتوقع", () => {
  const card = mk({ statementDay: 1, dueDay: 25, openingDebt: 5000 });
  const data = { cards: [card], cardInstallments: [], transactions: [
    tx({ id: "f1", date: "2026-12-15", amount: 1000, linkedCardId: 1 }) ] };
  const p = E.computeCardPaymentPrediction(data, card, D(2026, 11, 27));
  assert.strictEqual(p.currentDebt, 5000);
  assert.strictEqual(p.pendingCharges, 1000);
  assert.strictEqual(p.projectedAtDue, 6000);
});
console.log(n + " tests passed");

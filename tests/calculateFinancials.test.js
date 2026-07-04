const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extract(source, pattern, label) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Failed to extract ${label} from index.html`);
  }
  return match[0];
}

function loadCalculateFinancials() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  const snippets = [
    extract(html, /const PENSION_RATE_HALF =[\s\S]*?let isTaxIncluded = false; \/\/ default to Tax Exclude \(税抜\)/, 'tax constants'),
    extract(html, /function getBasicDeductionIncomeTax\(totalIncome\) \{[\s\S]*?\n        \}/, 'getBasicDeductionIncomeTax'),
    extract(html, /function getBasicDeductionResidentTax\(totalIncome\) \{[\s\S]*?\n        \}/, 'getBasicDeductionResidentTax'),
    extract(html, /function getEmploymentIncomeDeduction\(annualSalary\) \{[\s\S]*?\n        \}/, 'getEmploymentIncomeDeduction'),
    extract(html, /function roundToNearestTen\(value\) \{[\s\S]*?\n        \}/, 'roundToNearestTen'),
    extract(html, /function roundToTaxHundred\(value\) \{[\s\S]*?\n        \}/, 'roundToTaxHundred'),
    extract(html, /function getMonthlySocialInsuranceBreakdown\(monthlySalary, ageGroup, healthRate\) \{[\s\S]*?\n        \}/, 'getMonthlySocialInsuranceBreakdown'),
    extract(html, /function getMonthlyEmploymentIncomeDeductionYen\(monthlyAmountYen\) \{[\s\S]*?\n        \}/, 'getMonthlyEmploymentIncomeDeductionYen'),
    extract(html, /function getMonthlyBasicDeductionYen\(monthlyAmountYen\) \{[\s\S]*?\n        \}/, 'getMonthlyBasicDeductionYen'),
    extract(html, /function getMonthlyTaxRateTable\(taxableYen\) \{[\s\S]*?\n        \}/, 'getMonthlyTaxRateTable'),
    extract(html, /function getOtsuBaseTaxRateTable\(taxableYen\) \{[\s\S]*?\n        \}/, 'getOtsuBaseTaxRateTable'),
    extract(html, /function calculateKouWithholdingTaxYen\(salaryAfterSocialInsuranceYen, dependents\) \{[\s\S]*?\n        \}/, 'calculateKouWithholdingTaxYen'),
    extract(html, /function calculateOtsuWithholdingTaxYen\(salaryAfterSocialInsuranceYen, dependents\) \{[\s\S]*?\n        \}/, 'calculateOtsuWithholdingTaxYen'),
    extract(html, /function calculateMonthlyPayroll\(monthlySalary, ageGroup, healthRate, dependents, taxMode, residentTax\) \{[\s\S]*?\n        \}/, 'calculateMonthlyPayroll'),
    extract(html, /function calculateFinancials\(rawRevenue, rawSubcontracting, rawSga, monthlySalary, ageGroup, providentDeductionType, taxType, industryRate, healthRate, accountingMethod\) \{[\s\S]*?\n        \}/, 'calculateFinancials')
  ];

  const script = `
${snippets.join('\n\n')}
module.exports = { calculateFinancials, calculateMonthlyPayroll };
`;

  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(script, context);
  return context.module.exports;
}

function loadInputHelpers() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const snippets = [
    extract(html, /function clampValue\(value, min, max\) \{[\s\S]*?\n        \}/, 'clampValue'),
    extract(html, /function snapValueToStep\(value, min, max, step\) \{[\s\S]*?\n        \}/, 'snapValueToStep'),
    extract(html, /function getSliderBounds\(slider\) \{[\s\S]*?\n        \}/, 'getSliderBounds'),
    extract(html, /function syncInputPairValue\(slider, number, rawValue\) \{[\s\S]*?\n        \}/, 'syncInputPairValue')
  ];

  const script = `
${snippets.join('\n\n')}
module.exports = { clampValue, snapValueToStep, getSliderBounds, syncInputPairValue };
`;

  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(script, context);
  return context.module.exports;
}

function loadMarkup() {
  return fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
}

const { calculateFinancials, calculateMonthlyPayroll } = loadCalculateFinancials();
const { snapValueToStep, syncInputPairValue } = loadInputHelpers();
const htmlMarkup = loadMarkup();

function runScenario(taxType, industryRate = 0.5) {
  return calculateFinancials(1000, 200, 100, 0, 'under40', '0', taxType, industryRate, 0.1, 'excluded');
}

function testPrincipleTaxPaidTracksExpenseTax() {
  const result = runScenario('principle');
  assert.strictEqual(result.taxPaidOnExpenses, 30);
  assert.strictEqual(result.consumptionTaxToPay, 70);
  assert.strictEqual(result.consumptionTaxImpact, 0);
}

function testSimplifiedTaxPaidIsNotCountedButImpactStillUsesActualExpenseTax() {
  const result = runScenario('simplified', 0.5);
  assert.strictEqual(result.taxPaidOnExpenses, 0);
  assert.strictEqual(result.consumptionTaxToPay, 50);
  assert.strictEqual(result.consumptionTaxImpact, 20);
}

function testTwowariTaxPaidIsNotCountedButImpactStillUsesActualExpenseTax() {
  const result = runScenario('twowari');
  assert.strictEqual(result.taxPaidOnExpenses, 0);
  assert.strictEqual(result.consumptionTaxToPay, 20);
  assert.strictEqual(result.consumptionTaxImpact, 50);
}

function testSnapValueToStepRoundsToNearestFiveWithinRange() {
  assert.strictEqual(snapValueToStep(123, 0, 5000, 5), 125);
  assert.strictEqual(snapValueToStep(122, 0, 5000, 5), 120);
  assert.strictEqual(snapValueToStep(-1, 0, 5000, 5), 0);
  assert.strictEqual(snapValueToStep(5003, 0, 5000, 5), 5000);
}

function testRevenueInputsUseFiveManStep() {
  assert.match(htmlMarkup, /<input type="range" id="input-revenue" min="100" max="10000" step="5" value="1200"/);
  assert.match(htmlMarkup, /<input type="number" id="num-revenue" value="1200" step="5"/);
}

function testSyncInputPairValueSnapsMisalignedValues() {
  const slider = { min: '100', max: '10000', step: '5', value: '1200' };
  const number = { value: '1200' };
  const synced = syncInputPairValue(slider, number, 1209);
  assert.strictEqual(synced, 1210);
  assert.strictEqual(slider.value, 1210);
  assert.strictEqual(number.value, 1210);
}

function testPayrollTabMarkupExists() {
  assert.match(htmlMarkup, /id="tab-payroll"/);
  assert.match(htmlMarkup, /id="content-payroll"/);
  assert.match(htmlMarkup, /id="input-payroll-dependents"/);
  assert.match(htmlMarkup, /id="select-payroll-tax-mode"/);
  assert.match(htmlMarkup, /id="input-payroll-resident-tax"/);
}

function testMonthlyPayrollRepresentativeCase() {
  const result = calculateMonthlyPayroll(40, 'over40', 0.099, 0, 'kou', 0);
  assert.strictEqual(result.gross, 400000);
  assert.strictEqual(result.employeeHealth, 19800);
  assert.strictEqual(result.employeeCare, 3240);
  assert.strictEqual(result.employeePension, 36600);
  assert.strictEqual(result.withholdingTax, 10790);
  assert.strictEqual(result.netPay, 329110);
  assert.strictEqual(result.employerChildcareSupport, 460);
  assert.strictEqual(result.employeeChildcareSupport, 460);
  assert.strictEqual(result.totalCompanyCost, 460100);
}

function testCareInsuranceTurnsOffUnder40() {
  const under40 = calculateMonthlyPayroll(40, 'under40', 0.099, 0, 'kou', 0);
  const over40 = calculateMonthlyPayroll(40, 'over40', 0.099, 0, 'kou', 0);
  assert.strictEqual(under40.employeeCare, 0);
  assert.strictEqual(under40.employerCare, 0);
  assert.strictEqual(over40.employeeCare > 0, true);
}

function testDependentsReduceKouWithholdingTax() {
  const noDependents = calculateMonthlyPayroll(40, 'over40', 0.099, 0, 'kou', 0);
  const twoDependents = calculateMonthlyPayroll(40, 'over40', 0.099, 2, 'kou', 0);
  assert.strictEqual(twoDependents.withholdingTax < noDependents.withholdingTax, true);
}

function testResidentTaxFlowsThroughToNetPay() {
  const withoutResidentTax = calculateMonthlyPayroll(40, 'over40', 0.099, 0, 'kou', 0);
  const withResidentTax = calculateMonthlyPayroll(40, 'over40', 0.099, 0, 'kou', 15000);
  assert.strictEqual(withResidentTax.residentTax, 15000);
  assert.strictEqual(withResidentTax.netPay, withoutResidentTax.netPay - 15000);
}

function testMonthlyAndAnnualSocialInsuranceStayAligned() {
  const monthly = calculateMonthlyPayroll(40, 'over40', 0.099, 0, 'kou', 0);
  const annual = calculateFinancials(1200, 200, 100, 40, 'over40', '0', 'principle', 0.5, 0.099, 'excluded');
  assert.strictEqual(annual.pShaho, (monthly.employeeHealth + monthly.employeeCare + monthly.employeeChildcareSupport + monthly.employeePension) / 10000 * 12);
  assert.strictEqual(annual.cShaho, (monthly.employerHealth + monthly.employerCare + monthly.employerChildcareSupport + monthly.employerPension) / 10000 * 12);
}

testPrincipleTaxPaidTracksExpenseTax();
testSimplifiedTaxPaidIsNotCountedButImpactStillUsesActualExpenseTax();
testTwowariTaxPaidIsNotCountedButImpactStillUsesActualExpenseTax();
testSnapValueToStepRoundsToNearestFiveWithinRange();
testRevenueInputsUseFiveManStep();
testSyncInputPairValueSnapsMisalignedValues();
testPayrollTabMarkupExists();
testMonthlyPayrollRepresentativeCase();
testCareInsuranceTurnsOffUnder40();
testDependentsReduceKouWithholdingTax();
testResidentTaxFlowsThroughToNetPay();
testMonthlyAndAnnualSocialInsuranceStayAligned();

console.log('calculateFinancials and monthly payroll tests passed');

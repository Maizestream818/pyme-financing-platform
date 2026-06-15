import { Prisma, RiskLevel } from '@prisma/client';

export function toDecimal(value: Prisma.Decimal | number | string) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function roundDecimal(value: Prisma.Decimal, places: number) {
  return value.toDecimalPlaces(places);
}

export function calculateMonthlyPayment(params: {
  principal: Prisma.Decimal;
  annualRatePercent?: Prisma.Decimal | null;
  termMonths: number;
}) {
  const { principal, annualRatePercent, termMonths } = params;

  if (!annualRatePercent || annualRatePercent.lte(0)) {
    return roundDecimal(principal.div(termMonths), 2);
  }

  const monthlyRate = annualRatePercent.div(100).div(12);
  const discountFactor = new Prisma.Decimal(1)
    .plus(monthlyRate)
    .pow(-termMonths);
  const payment = principal.mul(monthlyRate).div(new Prisma.Decimal(1).minus(discountFactor));

  return roundDecimal(payment, 2);
}

export function calculateDebtServiceCoverageRatio(params: {
  estimatedCashflow: Prisma.Decimal;
  totalMonthlyDebtPayment: Prisma.Decimal;
}) {
  if (params.totalMonthlyDebtPayment.equals(0)) {
    return new Prisma.Decimal(0);
  }

  return roundDecimal(
    params.estimatedCashflow.div(params.totalMonthlyDebtPayment),
    4,
  );
}

export function clampScore(value: Prisma.Decimal) {
  if (value.lt(0)) {
    return new Prisma.Decimal(0);
  }

  if (value.gt(100)) {
    return new Prisma.Decimal(100);
  }

  return roundDecimal(value, 2);
}

export function riskLevelFromScore(score: Prisma.Decimal): RiskLevel {
  if (score.gte(75)) {
    return 'low';
  }

  if (score.gte(50)) {
    return 'medium';
  }

  return 'high';
}

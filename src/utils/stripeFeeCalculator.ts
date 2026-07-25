/**
 * Stripe Fee Calculator for NZ (New Zealand)
 * 
 * Standard Stripe NZ rates:
 * - Domestic cards: 2.65% + NZ$0.30
 * - International cards: 3.7% + NZ$0.30
 * 
 * This utility helps dispatchers see the Stripe fee breakdown
 * so they can set fares that cover processing costs.
 */

// Stripe NZ domestic rate (most common for local taxi business)
const STRIPE_PERCENT = 2.65;
const STRIPE_FIXED_FEE = 0.30; // NZ$0.30

export interface StripeFeeBreakdown {
  /** The original charge amount */
  chargeAmount: number;
  /** Stripe's percentage fee (2.65%) */
  percentFee: number;
  /** Stripe's fixed fee ($0.30) */
  fixedFee: number;
  /** Total Stripe fee (percent + fixed) */
  totalFee: number;
  /** What you actually receive after Stripe takes their cut */
  netReceived: number;
  /** What you should charge to receive the full original amount after fees */
  chargeToBreakEven: number;
}

/**
 * Calculate Stripe fee breakdown for a given charge amount.
 * Uses NZ domestic card rates: 2.65% + NZ$0.30
 */
export function calculateStripeFee(amount: number): StripeFeeBreakdown {
  if (!amount || amount <= 0) {
    return {
      chargeAmount: 0,
      percentFee: 0,
      fixedFee: 0,
      totalFee: 0,
      netReceived: 0,
      chargeToBreakEven: 0,
    };
  }

  const percentFee = amount * (STRIPE_PERCENT / 100);
  const fixedFee = STRIPE_FIXED_FEE;
  const totalFee = percentFee + fixedFee;
  const netReceived = amount - totalFee;

  // To receive exactly `amount` after fees:
  // chargeToBreakEven = (amount + fixedFee) / (1 - percentRate)
  const chargeToBreakEven = (amount + STRIPE_FIXED_FEE) / (1 - STRIPE_PERCENT / 100);

  return {
    chargeAmount: round2(amount),
    percentFee: round2(percentFee),
    fixedFee: round2(fixedFee),
    totalFee: round2(totalFee),
    netReceived: round2(netReceived),
    chargeToBreakEven: round2(chargeToBreakEven),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Format a number as currency string e.g. "12.50" */
export function formatFee(n: number): string {
  return n.toFixed(2);
}

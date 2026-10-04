import { DomainError } from './errors.js';

/**
 * Allowed state transitions (spec §10). Payment, commercial order state and
 * shipping state are separate machines. Every transition is persisted with
 * actor, time, from/to and a reason where `REASON_REQUIRED` says so.
 */
export const SOURCING_REQUEST_STATES = [
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'QUOTED', 'CONVERTED', 'CLOSED', 'CANCELLED',
] as const;
export const QUOTE_VERSION_STATES = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'REJECTED', 'SUPERSEDED', 'CANCELLED'] as const;
export const PAYMENT_STATES = ['CREATED', 'PENDING', 'PENDING_VERIFICATION', 'SUCCEEDED', 'FAILED', 'CANCELLED'] as const;
export const STOCK_ORDER_STATES = [
  'AWAITING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'EXCEPTION',
] as const;
export const PROCUREMENT_STATES = [
  'AWAITING_PAYMENT', 'PROCUREMENT_PENDING', 'SOURCING', 'PURCHASED', 'IN_TRANSIT_TO_WAREHOUSE', 'RECEIVED',
  'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'ON_HOLD', 'CANCELLED', 'EXCEPTION',
] as const;
export const REFUND_STATES = ['REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REJECTED'] as const;
export const RETURN_REQUEST_STATES = ['REQUESTED', 'APPROVED', 'REJECTED', 'ITEMS_RECEIVED', 'COMPLETED', 'CANCELLED'] as const;

export type SourcingRequestState = (typeof SOURCING_REQUEST_STATES)[number];
export type QuoteVersionState = (typeof QUOTE_VERSION_STATES)[number];
export type PaymentState = (typeof PAYMENT_STATES)[number];
export type StockOrderState = (typeof STOCK_ORDER_STATES)[number];
export type ProcurementState = (typeof PROCUREMENT_STATES)[number];
export type RefundState = (typeof REFUND_STATES)[number];
export type ReturnRequestState = (typeof RETURN_REQUEST_STATES)[number];

type Machine<S extends string> = Readonly<Record<S, readonly S[]>>;

export const SOURCING_REQUEST_MACHINE: Machine<SourcingRequestState> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'CLOSED', 'CANCELLED'],
  UNDER_REVIEW: ['NEEDS_CUSTOMER_INFO', 'QUOTED', 'CLOSED', 'CANCELLED'],
  NEEDS_CUSTOMER_INFO: ['UNDER_REVIEW', 'CLOSED', 'CANCELLED'],
  QUOTED: ['UNDER_REVIEW', 'NEEDS_CUSTOMER_INFO', 'CONVERTED', 'CLOSED', 'CANCELLED'],
  CONVERTED: ['CLOSED'],
  CLOSED: ['UNDER_REVIEW'],
  CANCELLED: [],
};

export const QUOTE_VERSION_MACHINE: Machine<QuoteVersionState> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'CANCELLED'],
  // Accepted-but-unpaid versions can still be replaced or expire; paid ones are
  // protected by the service layer (a paid version is never superseded in place).
  ACCEPTED: ['SUPERSEDED', 'EXPIRED', 'CANCELLED'],
  EXPIRED: [],
  REJECTED: [],
  SUPERSEDED: [],
  CANCELLED: [],
};

export const PAYMENT_MACHINE: Machine<PaymentState> = {
  CREATED: ['PENDING', 'FAILED', 'CANCELLED'],
  PENDING: ['PENDING_VERIFICATION', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PENDING_VERIFICATION: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export const STOCK_ORDER_MACHINE: Machine<StockOrderState> = {
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'EXCEPTION'],
  CONFIRMED: ['PREPARING', 'CANCELLED', 'EXCEPTION'],
  PREPARING: ['READY_TO_SHIP', 'CANCELLED', 'EXCEPTION'],
  READY_TO_SHIP: ['SHIPPED', 'PREPARING', 'EXCEPTION'],
  SHIPPED: ['DELIVERED', 'EXCEPTION'],
  DELIVERED: [],
  CANCELLED: [],
  EXCEPTION: ['CONFIRMED', 'PREPARING', 'READY_TO_SHIP', 'SHIPPED', 'CANCELLED'],
};

const PROCUREMENT_RESUME: readonly ProcurementState[] = [
  'PROCUREMENT_PENDING', 'SOURCING', 'PURCHASED', 'IN_TRANSIT_TO_WAREHOUSE', 'RECEIVED', 'READY_TO_SHIP',
];

export const PROCUREMENT_MACHINE: Machine<ProcurementState> = {
  AWAITING_PAYMENT: ['PROCUREMENT_PENDING', 'CANCELLED'],
  PROCUREMENT_PENDING: ['SOURCING', 'ON_HOLD', 'CANCELLED', 'EXCEPTION'],
  SOURCING: ['PURCHASED', 'ON_HOLD', 'CANCELLED', 'EXCEPTION'],
  PURCHASED: ['IN_TRANSIT_TO_WAREHOUSE', 'RECEIVED', 'ON_HOLD', 'EXCEPTION'],
  IN_TRANSIT_TO_WAREHOUSE: ['RECEIVED', 'ON_HOLD', 'EXCEPTION'],
  RECEIVED: ['READY_TO_SHIP', 'ON_HOLD', 'EXCEPTION'],
  READY_TO_SHIP: ['SHIPPED', 'ON_HOLD', 'EXCEPTION'],
  SHIPPED: ['DELIVERED', 'EXCEPTION'],
  DELIVERED: [],
  ON_HOLD: [...PROCUREMENT_RESUME, 'CANCELLED', 'EXCEPTION'],
  CANCELLED: [],
  EXCEPTION: [...PROCUREMENT_RESUME, 'ON_HOLD', 'SHIPPED', 'CANCELLED'],
};

export const REFUND_MACHINE: Machine<RefundState> = {
  REQUESTED: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['SUCCEEDED', 'FAILED'],
  FAILED: ['PROCESSING', 'REJECTED'],
  SUCCEEDED: [],
  REJECTED: [],
};

export const RETURN_REQUEST_MACHINE: Machine<ReturnRequestState> = {
  REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ITEMS_RECEIVED', 'COMPLETED', 'CANCELLED'],
  ITEMS_RECEIVED: ['COMPLETED'],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export const MACHINES = {
  sourcingRequest: SOURCING_REQUEST_MACHINE,
  quoteVersion: QUOTE_VERSION_MACHINE,
  payment: PAYMENT_MACHINE,
  stockOrder: STOCK_ORDER_MACHINE,
  procurement: PROCUREMENT_MACHINE,
  refund: REFUND_MACHINE,
  returnRequest: RETURN_REQUEST_MACHINE,
} as const;

export type MachineName = keyof typeof MACHINES;

/** Target states for which a human-readable reason is mandatory. */
export const REASON_REQUIRED: Readonly<Partial<Record<MachineName, readonly string[]>>> = {
  sourcingRequest: ['NEEDS_CUSTOMER_INFO', 'CLOSED', 'CANCELLED'],
  quoteVersion: ['CANCELLED'],
  stockOrder: ['CANCELLED', 'EXCEPTION'],
  procurement: ['ON_HOLD', 'CANCELLED', 'EXCEPTION'],
  refund: ['REJECTED'],
  returnRequest: ['REJECTED'],
};

export function canTransition(machine: MachineName, from: string, to: string): boolean {
  const table = MACHINES[machine] as Readonly<Record<string, readonly string[]>>;
  return table[from]?.includes(to) ?? false;
}

export function isTerminal(machine: MachineName, state: string): boolean {
  const table = MACHINES[machine] as Readonly<Record<string, readonly string[]>>;
  return (table[state]?.length ?? 0) === 0;
}

export function assertTransition(machine: MachineName, from: string, to: string, reason?: string | null): void {
  if (!canTransition(machine, from, to)) {
    throw new DomainError('INVALID_TRANSITION', `${machine}: ${from} → ${to} is not allowed`, { machine, from, to });
  }
  const needsReason = REASON_REQUIRED[machine]?.includes(to) ?? false;
  if (needsReason && !reason?.trim()) {
    throw new DomainError('REASON_REQUIRED', `${machine}: a reason is required for ${to}`, { machine, to });
  }
}

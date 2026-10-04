import { DomainError } from './errors.js';

/**
 * Fine-grained staff permissions (spec §13). Data scope (ownership or
 * assignment) is checked separately in services; a permission alone never
 * grants access to every conversation.
 */
export const PERMISSIONS = {
  'dashboard.view': 'View admin dashboard',
  'products.read': 'View products including unpublished',
  'products.write': 'Create/edit/archive products, media, categories, brands',
  'products.publish': 'Publish or unpublish products',
  'prices.write': 'Change product prices and price rules',
  'costs.read': 'See supplier cost and margin',
  'inventory.read': 'View stock balances and ledger',
  'inventory.adjust': 'Adjust on-hand stock',
  'imports.run': 'Upload, preview and commit Excel imports',
  'exports.run': 'Export catalog data',
  'customers.read': 'View customers',
  'customers.write': 'Edit customers',
  'customers.groups.approve': 'Approve business/wholesale customer groups',
  'sourcing.read.assigned': 'View sourcing requests assigned to self',
  'sourcing.read.all': 'View all sourcing requests',
  'sourcing.assign': 'Assign sourcing requests',
  'sourcing.write': 'Update sourcing requests and items',
  'conversations.read.assigned': 'Read conversations assigned to self',
  'conversations.read.all': 'Read all conversations',
  'conversations.write': 'Send messages as staff',
  'notes.write': 'Write internal notes',
  'quotes.write': 'Draft quotes',
  'quotes.publish': 'Send/replace/cancel quotes to customers',
  'orders.read': 'View orders',
  'orders.fulfil': 'Prepare, ship and deliver orders',
  'orders.manage': 'Cancel orders and resolve exceptions',
  'procurement.read': 'View procurement orders',
  'procurement.write': 'Update procurement stages and suppliers',
  'payments.read': 'View payments',
  'payments.reconcile': 'Trigger payment reconciliation',
  'payments.refund': 'Approve and execute refunds',
  'returns.manage': 'Review cancel/return requests',
  'fx.manage': 'Record exchange rates',
  'shipping.manage': 'Configure shipping methods and costs',
  'settings.manage': 'Edit site settings and policies',
  'content.manage': 'Edit public content pages',
  'reports.read': 'View sales and operations reports',
  'reports.financial': 'View financial collection/refund reports',
  'audit.read': 'Read audit log',
  'users.manage': 'Invite staff, suspend accounts',
  'roles.manage': 'Create roles and change permissions',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface RoleDefinition {
  key: string;
  nameFa: string;
  nameEn: string;
  permissions: readonly Permission[];
  requiresMfa: boolean;
  isOwner: boolean;
}

export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  { key: 'owner', nameFa: 'مالک', nameEn: 'Owner', permissions: ALL_PERMISSIONS, requiresMfa: true, isOwner: true },
  {
    key: 'sales_manager', nameFa: 'مدیر فروش', nameEn: 'Sales manager', requiresMfa: false, isOwner: false,
    permissions: [
      'dashboard.view', 'products.read', 'customers.read', 'customers.write', 'sourcing.read.all', 'sourcing.assign',
      'sourcing.write', 'conversations.read.all', 'conversations.write', 'notes.write', 'quotes.write', 'quotes.publish',
      'orders.read', 'orders.manage', 'procurement.read', 'payments.read', 'returns.manage', 'reports.read', 'inventory.read',
    ],
  },
  {
    key: 'support', nameFa: 'کارشناس پشتیبانی', nameEn: 'Support agent', requiresMfa: false, isOwner: false,
    permissions: [
      'dashboard.view', 'products.read', 'customers.read', 'sourcing.read.assigned', 'sourcing.write',
      'conversations.read.assigned', 'conversations.write', 'notes.write', 'orders.read', 'inventory.read',
    ],
  },
  {
    key: 'catalog_warehouse', nameFa: 'مسئول کالا و انبار', nameEn: 'Catalog & warehouse', requiresMfa: false, isOwner: false,
    permissions: [
      'dashboard.view', 'products.read', 'products.write', 'products.publish', 'inventory.read', 'inventory.adjust',
      'imports.run', 'exports.run', 'orders.read', 'orders.fulfil',
    ],
  },
  {
    key: 'procurement', nameFa: 'مسئول تأمین', nameEn: 'Procurement', requiresMfa: false, isOwner: false,
    permissions: [
      'dashboard.view', 'products.read', 'sourcing.read.assigned', 'procurement.read', 'procurement.write', 'costs.read',
      'orders.read', 'inventory.read',
    ],
  },
  {
    key: 'finance', nameFa: 'مالی', nameEn: 'Finance', requiresMfa: true, isOwner: false,
    permissions: [
      'dashboard.view', 'payments.read', 'payments.reconcile', 'payments.refund', 'fx.manage', 'reports.read',
      'reports.financial', 'orders.read', 'returns.manage', 'costs.read',
    ],
  },
];

export function hasPermission(granted: ReadonlySet<string>, required: Permission): boolean {
  return granted.has(required);
}

/** A staff member can only grant permissions they hold themselves (no escalation). */
export function assertCanGrant(actorPermissions: ReadonlySet<string>, requested: readonly string[]): void {
  const unknown = requested.filter((p) => !(p in PERMISSIONS));
  if (unknown.length) throw new DomainError('UNKNOWN_PERMISSION', 'Unknown permission', { unknown });
  const beyond = requested.filter((p) => !actorPermissions.has(p));
  if (beyond.length) throw new DomainError('PERMISSION_ESCALATION', 'Cannot grant permissions you do not hold', { beyond });
}

/** Owner protection: the last active owner can never be suspended, demoted or deleted. */
export function assertNotLastOwner(activeOwnerIds: readonly string[], targetUserId: string): void {
  if (activeOwnerIds.length <= 1 && activeOwnerIds.includes(targetUserId)) {
    throw new DomainError('LAST_OWNER', 'The last owner cannot be removed or suspended');
  }
}

/** Data scope for conversations/sourcing: all vs assigned-only. */
export function conversationScope(granted: ReadonlySet<string>): 'ALL' | 'ASSIGNED' | 'NONE' {
  if (granted.has('conversations.read.all')) return 'ALL';
  if (granted.has('conversations.read.assigned')) return 'ASSIGNED';
  return 'NONE';
}

export function sourcingScope(granted: ReadonlySet<string>): 'ALL' | 'ASSIGNED' | 'NONE' {
  if (granted.has('sourcing.read.all')) return 'ALL';
  if (granted.has('sourcing.read.assigned')) return 'ASSIGNED';
  return 'NONE';
}

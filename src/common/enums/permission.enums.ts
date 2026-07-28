export const PERMISSION_MODULES = [
  'AUTH',
  'USERS',
  'COORDINATIONS',
  'SITUATIONS',
  'AI',
  'REPORTS',
  'SYSTEM',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export const MODULES = {
  production: 'Production',
  inventory: 'Inventory',
  materialStock: 'Material Stock',
  crm: 'CRM',
  cashFlow: 'Cash Flow',
  qc: 'QC',
  vendors: 'Vendors',
  payroll: 'Payroll',
  pl: 'P&L',
  setup: 'Setup',
  settings: 'Settings',
  bills: 'Bills',
  reports: 'Reports',
}

export const ALL_MODULES = Object.values(MODULES)

const ALLOWED_USERS = [
  // Backend foundation only. Add non-secret users here later if needed.
  // {
  //   email: 'operator@example.com',
  //   role: 'Operator',
  //   modules: [MODULES.production, MODULES.inventory, MODULES.materialStock],
  // },
]

function cleanEmail(email) {
  return (email || '').toString().trim().toLowerCase()
}

export function getUserRole(email) {
  const normalized = cleanEmail(email)
  const ownerEmail = cleanEmail(process.env.OWNER_EMAIL)

  if (!normalized) {
    return { isAllowed: false, role: 'Unknown', modules: [], reason: 'missing-email' }
  }

  if (ownerEmail && normalized === ownerEmail) {
    return { isAllowed: true, role: 'Owner', modules: ALL_MODULES, reason: 'owner' }
  }

  const allowed = ALLOWED_USERS.find(user => cleanEmail(user.email) === normalized)
  if (!allowed) {
    return { isAllowed: false, role: 'Pending', modules: [], reason: 'not-allowed' }
  }

  return {
    isAllowed: true,
    role: allowed.role || 'Operator',
    modules: allowed.modules || [],
    reason: 'allowed-user',
  }
}

export function hasModuleAccess(email, moduleName) {
  const access = getUserRole(email)
  return Boolean(access.isAllowed && access.modules.includes(moduleName))
}

export function requireRoleOrPermission(user, moduleName) {
  const access = getUserRole(user?.email)
  if (!access.isAllowed) {
    return { ok: false, status: 403, code: 'ACCESS_PENDING', message: 'Access pending. Contact owner.', access }
  }

  if (access.role === 'Owner' || access.modules.includes(moduleName)) {
    return { ok: true, access }
  }

  return {
    ok: false,
    status: 403,
    code: 'PERMISSION_DENIED',
    message: 'You do not have permission for this module.',
    access,
  }
}

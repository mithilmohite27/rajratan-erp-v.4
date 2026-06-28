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
}

export const ALL_MODULES = Object.values(MODULES)

export const ALLOWED_USERS = [
  // Example only. Add non-secret operator/admin emails here when needed.
  // {
  //   email: 'operator@example.com',
  //   role: 'Operator',
  //   modules: [MODULES.production, MODULES.inventory, MODULES.materialStock],
  // },
]

function cleanEmail(email) {
  return (email || '').toString().trim().toLowerCase()
}

export function getUserAccess(user) {
  const email = cleanEmail(user?.email)
  const ownerEmail = cleanEmail(import.meta.env.VITE_OWNER_EMAIL)

  if (!email) {
    return {
      isAllowed: false,
      role: 'Unknown',
      modules: [],
      reason: 'missing-email',
    }
  }

  if (ownerEmail && email === ownerEmail) {
    return {
      isAllowed: true,
      role: 'Owner',
      modules: ALL_MODULES,
      reason: 'owner',
    }
  }

  const allowed = ALLOWED_USERS.find(entry => cleanEmail(entry.email) === email)
  if (!allowed) {
    return {
      isAllowed: false,
      role: 'Pending',
      modules: [],
      reason: 'not-allowed',
    }
  }

  return {
    isAllowed: true,
    role: allowed.role || 'Operator',
    modules: allowed.modules || [],
    reason: 'allowed-user',
  }
}

export function canAccessModule(access, moduleName) {
  return Boolean(access?.isAllowed && access.modules?.includes(moduleName))
}

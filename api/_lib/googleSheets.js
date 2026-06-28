import crypto from 'node:crypto'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

export const DEFAULT_CONFIG = {
  ghamela_g: 17,
  weight_g: 17,
  ghamela_p: 12,
  weight_p: 18,
  litre_m: 1,
  ml_c: 0.5,
  yellowRatio: 0.5,
  redRatio: 0.5,
  reti_multiplier: 3,
  plastic_ml: 180,
  cementRate: 340,
  greetRate: 600,
  powderRate: 450,
  chemicalRate: 25,
  colorRate: 135,
  plasticRate: 100,
  retiRate: 30,
  labourRate: 1.80,
  miscDefault: 1000,
  COMPANY_NAME: 'RAJ RATAN ENTERPRISE',
  FACTORY_NAME: 'Rajratan Enterprises',
  BUSINESS_ADDRESS: 'H.NO.628, CHUNKHADA FALIYU HANUMANBARI\nHANUMANBARI 396580\nGujarat, India',
  BUSINESS_PHONE: '8141680323',
  BUSINESS_EMAIL: '',
  OWNER_NAME: '',
  BUSINESS_LOCATION: 'Gujarat',
  GST_NUMBER: '24AOUPM1117L1ZP',
  INVOICE_PREFIX: 'INV',
  CHALLAN_PREFIX: 'CHN',
  DEFAULT_GST_RATE: 18,
  BANK_NAME: 'BARODA GUJARAT GRAMIN BANK',
  BANK_ACCOUNT_NAME: 'RAJ RATAN ENTERPRISE',
  BANK_ACCOUNT_NUMBER: '30670200000471',
  IFSC_CODE: 'BARB0BGGBXX',
  PAYMENT_TERMS: '',
  INVOICE_FOOTER_NOTE: '',
  APP_NAME: 'Rajratan ERP',
  POWERED_BY_TEXT: 'Premium factory workspace',
}

function requiredEnv(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

function privateKey() {
  return requiredEnv('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n')
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signJwt() {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: requiredEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }

  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(privateKey(), 'base64url')}`
}

export async function getServiceAccountAccessToken() {
  const assertion = signJwt()
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Service account token error: ${res.status} ${text}`)
  }

  const json = await res.json()
  return json.access_token
}

export async function readSheetRange(range) {
  const spreadsheetId = requiredEnv('SPREADSHEET_ID')
  const token = await getServiceAccountAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (res.status === 400 || res.status === 404) {
    const error = new Error(`Sheet range not found: ${range}`)
    error.code = 'SHEET_RANGE_NOT_FOUND'
    throw error
  }

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets read error: ${res.status} ${text}`)
  }

  const json = await res.json()
  return json.values || []
}

export async function updateSheetRange(range, values) {
  const spreadsheetId = requiredEnv('SPREADSHEET_ID')
  const token = await getServiceAccountAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets update error: ${res.status} ${text}`)
  }

  return res.json()
}

export async function appendSheetRow(range, values) {
  const spreadsheetId = requiredEnv('SPREADSHEET_ID')
  const token = await getServiceAccountAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets append error: ${res.status} ${text}`)
  }

  return res.json()
}

export async function appendSheetRows(range, rows) {
  if (!rows.length) return { skipped: true }

  const spreadsheetId = requiredEnv('SPREADSHEET_ID')
  const token = await getServiceAccountAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Sheets append error: ${res.status} ${text}`)
  }

  return res.json()
}

export async function ensureHeadersIfEmpty(tab, headers) {
  const existing = await readSheetRange(`${tab}!A1:A1`).catch(error => {
    if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
    throw error
  })

  if (!existing.length) {
    await appendSheetRow(`${tab}!A:A`, headers)
    return true
  }

  return false
}

export async function readConfig() {
  const values = await readSheetRange('Config!A:B')
  const config = { ...DEFAULT_CONFIG }

  values.forEach(([key, value]) => {
    if (!key) return
    const parsed = Number(value)
    config[key] = value !== '' && !Number.isNaN(parsed) ? parsed : value
  })

  return config
}

export async function readConfigRows() {
  return readSheetRange('Config!A:B')
}

export async function saveConfigMerge(incomingConfig) {
  const rows = await readConfigRows().catch(error => {
    if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
    throw error
  })
  const incoming = { ...incomingConfig }
  const nextRows = []
  const seen = new Set()

  rows.forEach(row => {
    const key = row[0]
    if (!key) return

    if (Object.prototype.hasOwnProperty.call(incoming, key)) {
      nextRows.push([key, incoming[key]])
      seen.add(key)
      return
    }

    nextRows.push([key, row[1] ?? ''])
  })

  Object.entries(incoming).forEach(([key, value]) => {
    if (!seen.has(key)) nextRows.push([key, value])
  })

  await updateSheetRange('Config!A1', nextRows)
  return nextRows.reduce((acc, [key, value]) => {
    if (!key) return acc
    const parsed = Number(value)
    acc[key] = value !== '' && !Number.isNaN(parsed) ? parsed : value
    return acc
  }, { ...DEFAULT_CONFIG })
}

function rowsToObjects(rows) {
  if (!rows || rows.length < 2) return []
  const [headers, ...data] = rows
  return data
    .filter(row => row.some(cell => String(cell || '').trim() !== ''))
    .map(row => {
      const obj = {}
      headers.forEach((header, index) => {
        obj[header] = row[index] ?? ''
      })
      return obj
    })
}

export async function readCashFlowRows() {
  return rowsToObjects(await readSheetRange('CashFlow_Log!A:F'))
}

export async function appendCashFlowEntry(entry) {
  return appendSheetRow('CashFlow_Log!A:A', [
    entry.date,
    entry.type,
    entry.source,
    entry.amount,
    entry.description || '',
    entry.vendorName || '',
  ])
}

export async function readVendorRows() {
  return rowsToObjects(await readSheetRange('Vendor_Ledger!A:H'))
}

export async function appendVendorEntry(entry) {
  return appendSheetRow('Vendor_Ledger!A:A', [
    entry.date,
    entry.vendorName,
    entry.material || '',
    entry.type,
    entry.quantity !== undefined && entry.quantity !== null ? entry.quantity : '',
    entry.unit || '',
    entry.amount,
    entry.notes || '',
  ])
}

export async function readPayrollRows() {
  return rowsToObjects(await readSheetRange('Payroll_Log!A:G'))
}

export async function appendPayrollEntry(entry) {
  return appendSheetRow('Payroll_Log!A:A', [
    entry.date,
    entry.workerName,
    entry.type,
    entry.blocks || 0,
    entry.wageRate || 0,
    entry.amount,
    entry.notes || '',
  ])
}

export async function readProductionRows() {
  return rowsToObjects(await readSheetRange('Production_Log!A:Z'))
}

export async function readProductionVariantRows() {
  return rowsToObjects(await readSheetRange('Production_Variants!A:F'))
}

export async function appendProductionEntry(entry) {
  return appendSheetRow('Production_Log!A:A', [
    entry.date,
    entry.blocks,
    entry.mortarCement,
    entry.colorCement,
    entry.totalCement,
    entry.greet,
    entry.powder,
    entry.chemical,
    entry.yellowKG,
    entry.redKG,
    entry.yellowFinal,
    entry.redFinal,
    entry.reti,
    entry.plastic,
    entry.misc,
    entry.cementCost,
    entry.greetCost,
    entry.powderCost,
    entry.chemicalCost,
    entry.colorCost,
    entry.plasticCost,
    entry.retiCost,
    entry.labourCost,
    entry.totalDailyCost,
  ])
}

export async function appendProductionVariants(variants) {
  const rows = variants.map(variant => [
    variant.date,
    variant.color,
    variant.blocks,
    variant.brass,
    variant.batchId || variant.date,
    variant.notes || '',
  ])

  return appendSheetRows('Production_Variants!A:A', rows)
}

export async function readCRMRows() {
  return rowsToObjects(await readSheetRange('CRM_Log!A:Z'))
}

export async function appendCRMEntries(entries) {
  const rows = entries.map(entry => [
    entry.date,
    entry.clientName,
    entry.location || '',
    entry.orderBrass || 0,
    entry.orderBlocks || 0,
    entry.rate || 0,
    entry.dispatchBrass || 0,
    entry.dispatchBlocks || 0,
    entry.color || '',
    entry.status || 'Order',
    entry.transport || '',
    entry.transporter || '',
    entry.freightCharge || 0,
    entry.notes || '',
  ])

  return appendSheetRows('CRM_Log!A:A', rows)
}

export async function readQCRows() {
  return rowsToObjects(await readSheetRange('QC_Log!A:F'))
}

export async function appendQCEntry(entry) {
  return appendSheetRow('QC_Log!A:A', [
    entry.date,
    entry.color || 'All Colors',
    entry.brokenBlocks,
    entry.costPerBlock,
    entry.totalLoss,
    entry.notes || '',
  ])
}

export async function seedStaticDataIfEmpty() {
  const defaults = [
    ['ghamela_g', 17], ['weight_g', 17],
    ['ghamela_p', 12], ['weight_p', 18],
    ['litre_m', 1], ['ml_c', 0.5],
    ['yellowRatio', 0.5], ['redRatio', 0.5],
    ['reti_multiplier', 3], ['plastic_ml', 180],
    ['cementRate', 340], ['greetRate', 600], ['powderRate', 450],
    ['chemicalRate', 25], ['colorRate', 135], ['plasticRate', 100],
    ['retiRate', 30], ['labourRate', 1.8],
    ['miscDefault', 1000],
  ]

  const seeded = []
  const existingConfig = await readSheetRange('Config!A1:A1').catch(error => {
    if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
    throw error
  })

  if (!existingConfig.length) {
    await updateSheetRange('Config!A1', defaults)
    seeded.push('Config')
  }

  const headerSeeds = [
    ['Opening_Stock', ['Color', 'Blocks', 'SetupDate', 'Notes']],
    ['Production_Log', ['Date', 'Blocks', 'MortarCement', 'ColorCement', 'TotalCement', 'Greet_Ton', 'Powder_Ton', 'Chemical_L', 'YellowKG', 'RedKG', 'YellowFinal', 'RedFinal', 'Reti', 'Plastic_ml', 'MiscExpenses', 'CementCost', 'GreetCost', 'PowderCost', 'ChemicalCost', 'ColorCost', 'PlasticCost', 'RetiCost', 'LabourCost', 'TotalDailyCost']],
    ['Production_Variants', ['Date', 'Color', 'Blocks', 'Brass', 'BatchID', 'Notes']],
    ['CRM_Log', ['Date', 'ClientName', 'Location', 'OrderBrass', 'OrderBlocks', 'Rate', 'DispatchBrass', 'DispatchBlocks', 'Color', 'Status', 'Transport', 'Transporter', 'FreightCharge', 'Notes']],
    ['QC_Log', ['Date', 'Color', 'BrokenBlocks', 'CostPerBlock', 'TotalLoss', 'Notes']],
    ['CashFlow_Log', ['Date', 'Type', 'Source', 'Amount', 'Description', 'VendorName']],
    ['Vendor_Ledger', ['Date', 'VendorName', 'Material', 'Type', 'Quantity', 'Unit', 'Amount', 'Notes']],
    ['Payroll_Log', ['Date', 'WorkerName', 'Type', 'Blocks', 'WageRate', 'Amount', 'Notes']],
    ['External_Material_Usage', ['Date', 'Material', 'Quantity', 'Unit', 'Reason', 'Notes']],
  ]

  for (const [tab, headers] of headerSeeds) {
    if (await ensureHeadersIfEmpty(tab, headers)) seeded.push(tab)
  }

  return seeded
}

export async function readOpeningStockRows() {
  return rowsToObjects(await readSheetRange('Opening_Stock!A:F'))
}

export async function appendOpeningStockRows(entries) {
  const rows = entries.map(entry => [
    entry.date,
    entry.type,
    entry.color,
    entry.blocks,
    entry.brass,
    entry.notes || '',
  ])

  return appendSheetRows('Opening_Stock!A:A', rows)
}

export async function readOpeningMaterialStockRows() {
  return rowsToObjects(await readSheetRange('Opening_Material_Stock!A:F'))
}

export async function appendOpeningMaterialStockRows(entries) {
  const rows = entries.map(entry => [
    entry.date,
    entry.type,
    entry.material,
    entry.quantity,
    entry.unit,
    entry.notes || '',
  ])

  return appendSheetRows('Opening_Material_Stock!A:A', rows)
}

export async function readExternalMaterialUsageRows() {
  return rowsToObjects(await readSheetRange('External_Material_Usage!A:F'))
}

export async function appendExternalMaterialUsageEntry(entry) {
  await ensureHeadersIfEmpty('External_Material_Usage', ['Date', 'Material', 'Quantity', 'Unit', 'Reason', 'Notes'])
  return appendSheetRow('External_Material_Usage!A:A', [
    entry.date,
    entry.material,
    entry.quantity,
    entry.unit || '',
    entry.reason || '',
    entry.notes || '',
  ])
}

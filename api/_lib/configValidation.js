export const PRODUCTION_CONFIG_KEYS = [
  'ghamela_g',
  'weight_g',
  'ghamela_p',
  'weight_p',
  'litre_m',
  'ml_c',
  'yellowRatio',
  'redRatio',
  'reti_multiplier',
  'plastic_ml',
  'cementRate',
  'greetRate',
  'powderRate',
  'chemicalRate',
  'colorRate',
  'plasticRate',
  'retiRate',
  'labourRate',
  'miscDefault',
]

export const BUSINESS_PROFILE_KEYS = [
  'COMPANY_NAME',
  'FACTORY_NAME',
  'BUSINESS_ADDRESS',
  'BUSINESS_PHONE',
  'BUSINESS_EMAIL',
  'OWNER_NAME',
  'BUSINESS_LOCATION',
]

export const BILLING_CONFIG_KEYS = [
  'GST_NUMBER',
  'INVOICE_PREFIX',
  'CHALLAN_PREFIX',
  'DEFAULT_GST_RATE',
  'BANK_NAME',
  'BANK_ACCOUNT_NAME',
  'BANK_ACCOUNT_NUMBER',
  'IFSC_CODE',
  'PAYMENT_TERMS',
  'INVOICE_FOOTER_NOTE',
]

export const BRANDING_CONFIG_KEYS = [
  'APP_NAME',
  'POWERED_BY_TEXT',
]

export const ALLOWED_CONFIG_KEYS = [
  ...PRODUCTION_CONFIG_KEYS,
  ...BUSINESS_PROFILE_KEYS,
  ...BILLING_CONFIG_KEYS,
  ...BRANDING_CONFIG_KEYS,
]

const ALLOWED_SET = new Set(ALLOWED_CONFIG_KEYS)
const TEXT_KEYS = new Set([
  ...BUSINESS_PROFILE_KEYS,
  ...BILLING_CONFIG_KEYS.filter(key => key !== 'DEFAULT_GST_RATE'),
  ...BRANDING_CONFIG_KEYS,
])

function cleanValue(key, value) {
  if (TEXT_KEYS.has(key)) return String(value ?? '').trim()

  const number = Number(value)
  if (!Number.isFinite(number)) {
    throw new Error(`${key} must be a valid number.`)
  }

  if (key === 'DEFAULT_GST_RATE' && number <= 0) {
    throw new Error('DEFAULT_GST_RATE must be a positive number.')
  }

  if (PRODUCTION_CONFIG_KEYS.includes(key) && number === 0) {
    throw new Error(`${key} cannot be 0 because current formulas may fall back to defaults.`)
  }

  return number
}

export function validateConfigPayload(payload) {
  const source = payload?.config && typeof payload.config === 'object'
    ? payload.config
    : payload

  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_CONFIG_PAYLOAD',
      message: 'Request body must include a config object.',
    }
  }

  const incomingKeys = Object.keys(source)
  const unknownKeys = incomingKeys.filter(key => !ALLOWED_SET.has(key))
  if (unknownKeys.length) {
    return {
      ok: false,
      status: 400,
      code: 'UNKNOWN_CONFIG_KEYS',
      message: `Unknown Config key(s) rejected: ${unknownKeys.join(', ')}`,
    }
  }

  try {
    const cleaned = {}
    incomingKeys.forEach(key => {
      cleaned[key] = cleanValue(key, source[key])
    })
    return { ok: true, config: cleaned }
  } catch (error) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_SETTING_VALUE',
      message: error.message,
    }
  }
}

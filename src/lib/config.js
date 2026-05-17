// ─────────────────────────────────────────────
//  config.js — Default config & config context
// ─────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  // Greet multipliers
  ghamela_g:       17,
  weight_g:        17,
  // Powder multipliers
  ghamela_p:       12,
  weight_p:        18,
  // Chemical
  litre_m:         1,
  ml_c:            0.5,
  // Color split ratios
  yellowRatio:     0.5,
  redRatio:        0.5,
  // Reti
  reti_multiplier: 3,
  // Plastic
  plastic_ml:      180,
  // Rates (₹)
  cementRate:      340,
  greetRate:       600,
  powderRate:      450,
  chemicalRate:    25,
  colorRate:       135,
  plasticRate:     100,
  retiRate:        30,
  labourRate:      1.80,
  miscDefault:     1000,
}

export const CONFIG_LABELS = {
  ghamela_g:       'Greet Ghamela (default 17)',
  weight_g:        'Greet Weight per Ghamela kg (default 17)',
  ghamela_p:       'Powder Ghamela (default 12)',
  weight_p:        'Powder Weight per Ghamela kg (default 18)',
  litre_m:         'Chemical per Mortar Cement bag (L)',
  ml_c:            'Chemical per Color Cement bag (L)',
  yellowRatio:     'Yellow Color Split Ratio (0.5 = 50%)',
  redRatio:        'Red Color Split Ratio (0.5 = 50%)',
  reti_multiplier: 'Reti Ghamela per Color Cement bag',
  plastic_ml:      'Plastic ml per Color Cement bag',
  cementRate:      'Cement Rate (₹/bag)',
  greetRate:       'Greet Rate (₹/ton)',
  powderRate:      'Powder Rate (₹/ton)',
  chemicalRate:    'Chemical Rate (₹/litre)',
  colorRate:       'Color Rate (₹/kg)',
  plasticRate:     'Plastic Cost (₹ flat)',
  retiRate:        'Reti Rate (₹/ghamela)',
  labourRate:      'Labour Rate (₹/block)',
  miscDefault:     'Default Miscellaneous Expense (₹)',
}

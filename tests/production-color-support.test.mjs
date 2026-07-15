import assert from 'node:assert/strict'
import { calcProduction, calcDailyCost, blocksToBrass } from '../src/lib/formulas.js'
import { consumptionFromProductionRow, MATERIAL_IDS, normalizeVendorMaterial } from '../src/lib/materials.js'
import { validateProductionPayload, findProductionDuplicate } from '../api/_lib/productionValidation.js'

const config = {
  ghamela_g: 17,
  weight_g: 17,
  ghamela_p: 12,
  weight_p: 18,
  litre_m: 1,
  ml_c: 0.5,
  yellowRatio: 0.5,
  redRatio: 0.5,
  colorRate: 135,
  cementRate: 340,
  greetRate: 600,
  powderRate: 450,
  chemicalRate: 25,
  plasticRate: 100,
  retiRate: 30,
  labourRate: 1.8,
  miscDefault: 1000,
}

function productionFor(overrides = {}) {
  return {
    date: '2026-07-15',
    blocks: 1140,
    mortarCement: 10,
    colorCement: 4,
    yellowKG: 0,
    redKG: 0,
    blackKG: 0,
    whiteKG: 0,
    misc: 1000,
    ...overrides,
  }
}

function assertColorCase(label, colorKey, expectedCostKg) {
  const inputs = productionFor({ [colorKey]: expectedCostKg })
  const calc = calcProduction(inputs, config)
  const cost = calcDailyCost(inputs, calc, config)
  assert.equal(cost.colorCost, expectedCostKg * config.colorRate, label)
}

assertColorCase('Yellow only cost', 'yellowKG', 3)
assertColorCase('Red only cost', 'redKG', 4)
assertColorCase('Black only cost', 'blackKG', 5)
assertColorCase('White only cost', 'whiteKG', 6)

const allColors = productionFor({ yellowKG: 1, redKG: 2, blackKG: 3, whiteKG: 4 })
const allCalc = calcProduction(allColors, config)
const allCost = calcDailyCost(allColors, allCalc, config)
assert.equal(allCalc.yellowShare, 2)
assert.equal(allCalc.redShare, 2)
assert.equal(allCalc.blackShare, 2)
assert.equal(allCalc.whiteShare, 2)
assert.equal(allCalc.yellowFinal, 2)
assert.equal(allCalc.redFinal, 4)
assert.equal(allCalc.blackFinal, 6)
assert.equal(allCalc.whiteFinal, 8)
assert.equal(allCost.colorCost, 10 * config.colorRate)

const zeroColors = productionFor()
const zeroCalc = calcProduction(zeroColors, config)
const zeroCost = calcDailyCost(zeroColors, zeroCalc, config)
assert.equal(zeroCost.colorCost, 0)
assert.equal(Number.isNaN(zeroCalc.blackFinal), false)
assert.equal(Number.isNaN(zeroCalc.whiteFinal), false)

assert.equal(blocksToBrass(285), 1)
assert.equal(blocksToBrass(570), 2)

const oldRowConsumption = consumptionFromProductionRow({
  MortarCement: 10,
  ColorCement: 4,
  Greet_kg: 4046,
  Powder_kg: 2160,
  Chemical_L: 12,
  YellowKG: 1,
  RedKG: 2,
})
assert.equal(oldRowConsumption.Black, 0)
assert.equal(oldRowConsumption.White, 0)

const newRowConsumption = consumptionFromProductionRow({
  MortarCement: 10,
  ColorCement: 4,
  Greet_kg: 4046,
  Powder_kg: 2160,
  Chemical_L: 12,
  YellowKG: 1,
  RedKG: 2,
  BlackKG: 3,
  WhiteKG: 4,
})
assert.equal(newRowConsumption.Black, 3)
assert.equal(newRowConsumption.White, 4)
assert.ok(MATERIAL_IDS.includes('White'))
assert.equal(normalizeVendorMaterial('white pigment'), 'White')

const validPayload = validateProductionPayload({
  entry: {
    ...allColors,
    ...allCalc,
    ...allCost,
    totalCement: allCalc.totalCement,
    greet: allCalc.greet,
    powder: allCalc.powder,
    chemical: allCalc.chemical,
    reti: allCalc.reti,
    plastic: allCalc.plastic,
    yellowFinal: allCalc.yellowFinal,
    redFinal: allCalc.redFinal,
    blackFinal: allCalc.blackFinal,
    whiteFinal: allCalc.whiteFinal,
    totalDailyCost: allCost.totalDailyCost,
  },
  variants: [
    { date: '2026-07-15', color: 'Black', blocks: 285, brass: 1, batchId: '2026-07-15' },
    { date: '2026-07-15', color: 'White', blocks: 285, brass: 1, batchId: '2026-07-15' },
  ],
})
assert.equal(validPayload.ok, true)
assert.equal(validPayload.entry.blackKG, 3)
assert.equal(validPayload.entry.whiteKG, 4)
assert.equal(validPayload.variants.length, 2)

const invalidNegative = validateProductionPayload({
  entry: { ...allColors, blocks: 100, mortarCement: -1 },
  variants: [{ date: '2026-07-15', color: 'Red', blocks: 100, brass: 0.35 }],
})
assert.equal(invalidNegative.ok, false)

assert.equal(findProductionDuplicate({
  productionRows: [],
  variantRows: [{ Date: '2026-07-15', Color: 'Black', Blocks: 285, Brass: 1, BatchID: '2026-07-15' }],
}, validPayload.entry, validPayload.variants), true)

console.log('production color support tests passed')

// ─────────────────────────────────────────────
//  formulas.js — All calculation logic
//  Every formula from the requirements doc
// ─────────────────────────────────────────────

const safe = (n) => (isNaN(n) || n === '' || n === null ? 0 : parseFloat(n))

// ── Production Calculations ───────────────────
export function calcProduction(inputs, config) {
  const mortar = safe(inputs.mortarCement)
  const color  = safe(inputs.colorCement)
  const yellow = safe(inputs.yellowKG)
  const red    = safe(inputs.redKG)
  const black  = safe(inputs.blackKG)
  const white  = safe(inputs.whiteKG)

  const c = {
    ghamela_g:       safe(config.ghamela_g)       || 17,
    weight_g:        safe(config.weight_g)         || 17,
    ghamela_p:       safe(config.ghamela_p)        || 12,
    weight_p:        safe(config.weight_p)         || 18,
    litre_m:         safe(config.litre_m)          || 1,
    ml_c:            safe(config.ml_c)             || 0.5,
    yellowRatio:     safe(config.yellowRatio)      || 0.5,
    redRatio:        safe(config.redRatio)         || 0.5,
    blackRatio:      safe(config.blackRatio)       || 0.5,
    whiteRatio:      safe(config.whiteRatio)       || 0.5,
    reti_multiplier: safe(config.reti_multiplier)  || 3,
    plastic_ml:      safe(config.plastic_ml)       || 180,
  }

  const totalCement  = mortar + color
  const greet        = (mortar * c.ghamela_g * c.weight_g) + (color * c.ghamela_g * c.weight_g)
  const powder       = mortar * c.ghamela_p * c.weight_p
  const chemical     = (c.litre_m * mortar) + (c.ml_c * color)
  const yellowShare  = (color / 2) * c.yellowRatio * 2   // = color * yellowRatio
  const redShare     = (color / 2) * c.redRatio * 2      // = color * redRatio
  const blackShare   = (color / 2) * c.blackRatio * 2    // = color * blackRatio
  const whiteShare   = (color / 2) * c.whiteRatio * 2    // = color * whiteRatio
  const yellowFinal  = yellow * yellowShare
  const redFinal     = red * redShare
  const blackFinal   = black * blackShare
  const whiteFinal   = white * whiteShare
  const reti         = c.reti_multiplier * color
  const plastic      = c.plastic_ml * color

  return {
    totalCement:  round2(totalCement),
    greet:        round2(greet),
    powder:       round2(powder),
    chemical:     round2(chemical),
    yellowShare:  round2(yellowShare),
    redShare:     round2(redShare),
    blackShare:   round2(blackShare),
    whiteShare:   round2(whiteShare),
    yellowFinal:  round2(yellowFinal),
    redFinal:     round2(redFinal),
    blackFinal:   round2(blackFinal),
    whiteFinal:   round2(whiteFinal),
    reti:         round2(reti),
    plastic:      round2(plastic),
    plasticL:     round2(plastic / 1000),
  }
}

// ── Daily Cost Calculations ───────────────────
export function calcDailyCost(inputs, calc, config) {
  const c = {
    cementRate:  safe(config.cementRate)  || 340,
    greetRate:   safe(config.greetRate)   || 600,
    powderRate:  safe(config.powderRate)  || 450,
    chemicalRate:safe(config.chemicalRate)|| 25,
    colorRate:   safe(config.colorRate)   || 135,
    plasticRate: safe(config.plasticRate) || 100,
    retiRate:    safe(config.retiRate)    || 30,
    labourRate:  safe(config.labourRate)  || 1.80,
  }

  const yellow = safe(inputs.yellowKG)
  const red    = safe(inputs.redKG)
  const black  = safe(inputs.blackKG)
  const white  = safe(inputs.whiteKG)
  const blocks = safe(inputs.blocks)
  const misc   = safe(inputs.misc) || safe(config.miscDefault) || 1000

  const cementCost   = calc.totalCement * c.cementRate
  const greetCost    = (calc.greet / 1000) * c.greetRate
  const powderCost   = (calc.powder / 1000) * c.powderRate
  const chemicalCost = calc.chemical * c.chemicalRate
  const colorCost    = (yellow + red + black + white) * c.colorRate
  const plasticCost  = c.plasticRate
  const retiCost     = calc.reti * c.retiRate
  const labourCost   = blocks * c.labourRate
  const miscCost     = misc

  const totalDailyCost = cementCost + greetCost + powderCost +
    chemicalCost + colorCost + plasticCost + retiCost + labourCost + miscCost

  return {
    cementCost:    round2(cementCost),
    greetCost:     round2(greetCost),
    powderCost:    round2(powderCost),
    chemicalCost:  round2(chemicalCost),
    colorCost:     round2(colorCost),
    plasticCost:   round2(plasticCost),
    retiCost:      round2(retiCost),
    labourCost:    round2(labourCost),
    miscCost:      round2(miscCost),
    totalDailyCost:round2(totalDailyCost),
    costPerBlock:  blocks > 0 ? round2(totalDailyCost / blocks) : 0,
  }
}

// ── Inventory Helpers ─────────────────────────
export const BRASS = 285

export function blocksToBrass(blocks) {
  return round2(safe(blocks) / BRASS)
}

export function brassToBlocks(brass) {
  return Math.round(safe(brass) * BRASS)
}

// ── Utility ───────────────────────────────────
function round2(n) {
  return Math.round(n * 100) / 100
}

export function formatINR(n) {
  return '₹' + safe(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export function formatNum(n, decimals = 2) {
  return safe(n).toFixed(decimals)
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

import { verifyGoogleToken } from './_lib/auth.js'
import {
  appendCRMEntries,
  appendOpeningMaterialStockRows,
  appendOpeningStockRows,
  appendProductionVariants,
  ensureHeadersIfEmpty,
  readCRMRows,
  readOpeningMaterialStockRows,
  readOpeningStockRows,
  readProductionVariantRows,
  repairBlackWhiteParity,
  seedStaticDataIfEmpty,
} from './_lib/googleSheets.js'
import { MODULES, requireRoleOrPermission } from './_lib/permissions.js'
import {
  countCRMImportDuplicates,
  countOpeningMaterialDuplicates,
  countOpeningStockDuplicates,
  countProductionImportDuplicates,
  validateSetupPayload,
} from './_lib/setupValidation.js'
import { fail, handleOptions, json, ok, requireMethod, setCors } from './_lib/response.js'

function readOrEmpty(readFn) {
  return readFn().catch(error => {
    if (error.code === 'SHEET_RANGE_NOT_FOUND') return []
    throw error
  })
}

function duplicateResponse(res, code, message, duplicateRows, extra = {}) {
  json(res, 409, {
    ok: false,
    duplicate: true,
    code,
    message,
    duplicateRows,
    ...extra,
  })
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return
  setCors(req, res)
  if (!requireMethod(req, res, 'POST')) return

  const auth = await verifyGoogleToken(req)
  if (!auth.ok) {
    fail(res, auth.status, auth.code, auth.message)
    return
  }

  const permission = requireRoleOrPermission(auth.user, MODULES.setup)
  if (!permission.ok) {
    fail(res, permission.status, permission.code, permission.message)
    return
  }

  const validation = validateSetupPayload(req.body)
  if (!validation.ok) {
    fail(res, validation.status, validation.code, validation.message, validation.details)
    return
  }

  try {
    if (validation.action === 'seed_headers') {
      const seeded = await seedStaticDataIfEmpty()
      ok(res, {
        message: 'Setup headers checked safely.',
        action: validation.action,
        seeded,
        schemaChanged: false,
      })
      return
    }

    if (validation.action === 'repair_black_white_parity') {
      const result = await repairBlackWhiteParity({ dryRun: validation.dryRun })
      ok(res, {
        message: validation.dryRun
          ? 'Black/White parity check completed.'
          : 'Black/White parity repair completed.',
        action: validation.action,
        ...result,
      })
      return
    }

    if (validation.action === 'opening_stock') {
      const existing = await readOrEmpty(readOpeningStockRows)
      const duplicateRows = countOpeningStockDuplicates(existing, validation.entries)

      if (duplicateRows > 0 && !validation.force) {
        duplicateResponse(res, 'DUPLICATE_OPENING_STOCK', 'Similar opening stock row already exists. Please confirm before saving again.', duplicateRows)
        return
      }

      await ensureHeadersIfEmpty('Opening_Stock', ['Date', 'Type', 'Color', 'Blocks', 'Brass', 'Notes'])
      await appendOpeningStockRows(validation.entries)
      ok(res, {
        message: 'Opening stock saved successfully.',
        action: validation.action,
        rowsSaved: validation.entries.length,
        duplicateConfirmed: Boolean(duplicateRows && validation.force),
        schemaChanged: false,
      })
      return
    }

    if (validation.action === 'opening_material_stock') {
      const existing = await readOrEmpty(readOpeningMaterialStockRows)
      const duplicateRows = countOpeningMaterialDuplicates(existing, validation.entries)

      if (duplicateRows > 0 && !validation.force) {
        duplicateResponse(res, 'DUPLICATE_OPENING_MATERIAL_STOCK', 'Similar opening material stock row already exists. Please confirm before saving again.', duplicateRows)
        return
      }

      await ensureHeadersIfEmpty('Opening_Material_Stock', ['Date', 'Type', 'Material', 'Quantity', 'Unit', 'Notes'])
      await appendOpeningMaterialStockRows(validation.entries)
      ok(res, {
        message: 'Opening material stock saved successfully.',
        action: validation.action,
        rowsSaved: validation.entries.length,
        duplicateConfirmed: Boolean(duplicateRows && validation.force),
        schemaChanged: false,
      })
      return
    }

    if (validation.invalidRows.length > 0) {
      fail(res, 400, 'INVALID_IMPORT_ROWS', 'Import contains invalid rows. Fix the CSV and try again.', {
        totalRows: validation.totalRows,
        validRows: validation.entries.length,
        invalidRows: validation.invalidRows.length,
        invalidSamples: validation.invalidRows.slice(0, 5),
      })
      return
    }

    if (validation.action === 'production_csv_import') {
      const existing = await readOrEmpty(readProductionVariantRows)
      const duplicateRows = countProductionImportDuplicates(existing, validation.entries)

      if (duplicateRows > 0 && !validation.force) {
        duplicateResponse(res, 'DUPLICATE_PRODUCTION_IMPORT_ROWS', 'Possible duplicate production import rows found. Please confirm before importing again.', duplicateRows, {
          totalRows: validation.totalRows,
          validRows: validation.entries.length,
          invalidRows: 0,
        })
        return
      }

      await ensureHeadersIfEmpty('Production_Variants', ['Date', 'Color', 'Blocks', 'Brass', 'BatchID', 'Notes'])
      await appendProductionVariants(validation.entries)
      ok(res, {
        message: 'Production CSV import completed successfully.',
        action: validation.action,
        totalRows: validation.totalRows,
        validRows: validation.entries.length,
        invalidRows: 0,
        duplicateRows,
        rowsSaved: validation.entries.length,
        duplicateConfirmed: Boolean(duplicateRows && validation.force),
        schemaChanged: false,
      })
      return
    }

    const existing = await readOrEmpty(readCRMRows)
    const duplicateRows = countCRMImportDuplicates(existing, validation.entries)

    if (duplicateRows > 0 && !validation.force) {
      duplicateResponse(res, 'DUPLICATE_CRM_IMPORT_ROWS', 'Possible duplicate CRM import rows found. Please confirm before importing again.', duplicateRows, {
        totalRows: validation.totalRows,
        validRows: validation.entries.length,
        invalidRows: 0,
      })
      return
    }

    await ensureHeadersIfEmpty('CRM_Log', ['Date', 'ClientName', 'Location', 'OrderBrass', 'OrderBlocks', 'Rate', 'DispatchBrass', 'DispatchBlocks', 'Color', 'Status', 'Transport', 'Transporter', 'FreightCharge', 'Notes'])
    await appendCRMEntries(validation.entries)
    ok(res, {
      message: 'CRM CSV import completed successfully.',
      action: validation.action,
      totalRows: validation.totalRows,
      validRows: validation.entries.length,
      invalidRows: 0,
      duplicateRows,
      rowsSaved: validation.entries.length,
      duplicateConfirmed: Boolean(duplicateRows && validation.force),
      schemaChanged: false,
    })
  } catch (error) {
    fail(
      res,
      500,
      'SETUP_ACTION_FAILED',
      'Setup action failed. Check backend environment and service account access.',
      { reason: error.message }
    )
  }
}

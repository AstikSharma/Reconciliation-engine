const ASSET_ALIAS_MAP = {
  'bitcoin': 'btc',
  'ethereum': 'eth',
  'tether': 'usdt',
  'usd coin': 'usdc'
};

/**
 * @param {Object} rawRow
 * @returns {Object} 
 */
export const validateAndNormalizeRow = (rawRow) => {
  const errors = [];
  const normalizedData = {};

  const rawId = rawRow.transaction_id || rawRow.id || rawRow.tx_id || rawRow.txid || rawRow.external_id;
  if (!rawId || String(rawId).trim() === '') {
    errors.push('Missing unique transaction identifier (id/tx_id).');
  } else {
    normalizedData.externalId = String(rawId).trim();
  }

  const rawTimestamp = rawRow.timestamp || rawRow.date || rawRow.time;
  if (!rawTimestamp) {
    errors.push('Missing transaction timestamp.');
  } else {
    const parsedDate = new Date(rawTimestamp);
    if (isNaN(parsedDate.getTime())) {
      errors.push(`Invalid date format encountered: "${rawTimestamp}"`);
    } else {
      normalizedData.timestamp = parsedDate;
    }
  }

  const rawAsset = rawRow.asset || rawRow.token || rawRow.currency || rawRow.symbol;
  if (!rawAsset || String(rawAsset).trim() === '') {
    errors.push('Missing asset denomination.');
  } else {
    const baseline = String(rawAsset).trim().toLowerCase();
    normalizedData.asset = ASSET_ALIAS_MAP[baseline] || baseline;
  }

  const rawQuantity = rawRow.quantity || rawRow.amount || rawRow.vol || rawRow.volume;
  if (rawQuantity === undefined || rawQuantity === null || String(rawQuantity).trim() === '') {
    errors.push('Missing transaction quantity.');
  } else {
    const parsedQty = parseFloat(rawQuantity);
    if (isNaN(parsedQty)) {
      errors.push(`Quantity is not a valid numerical representation: "${rawQuantity}"`);
    } else if (parsedQty <= 0) {
      errors.push(`Quantity must be greater than zero: ${parsedQty}`);
    } else {
      normalizedData.quantity = parsedQty;
    }
  }

  const rawType = rawRow.type || rawRow.side || rawRow.operation;
  if (!rawType || String(rawType).trim() === '') {
    errors.push('Missing transaction operational type.');
  } else {
    normalizedData.type = String(rawType).trim().toUpperCase();
  }

  const status = errors.length > 0 ? 'malformed' : 'valid';

  return {
    status,
    errors,
    normalized: status === 'valid' ? normalizedData : null
  };
};
const TYPE_PERSPECTIVE_MAP = {
  'TRANSFER_OUT': 'TRANSFER_IN',
  'TRANSFER_IN': 'TRANSFER_OUT',
  'WITHDRAWAL': 'DEPOSIT',
  'DEPOSIT': 'WITHDRAWAL'
};

export const areTypesCompatible = (userType, exchangeType) => {
  if (userType === exchangeType) return true;
  return TYPE_PERSPECTIVE_MAP[userType] === exchangeType;
};

export const calculateQuantityVariance = (userQty, exchangeQty) => {
  if (userQty === 0) return exchangeQty === 0 ? 0 : 100;
  return (Math.abs(userQty - exchangeQty) / userQty) * 100;
};
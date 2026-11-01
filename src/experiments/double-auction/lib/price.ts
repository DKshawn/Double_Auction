// Shared limit for private values, costs and submitted prices in every market.
export const MAX_PRICE = 99_999;

export const isValidPrice = (price: number) =>
  Number.isInteger(price) && price >= 1 && price <= MAX_PRICE;

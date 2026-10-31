import { roundMoney } from '../utils/helpers.js';

export interface PricedLine {
  productId: string;
  name: string;
  slug: string;
  sku: string;
  image?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  mrp?: number;
  taxPercent: number;
  taxAmount: number;
  discountAmount: number;
  lineTotal: number;
}

export interface PriceBreakdown {
  items: PricedLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  shippingCharge: number;
  total: number;
  currency: string;
}

export interface PriceableProduct {
  _id: { toString(): string };
  name: string;
  slug: string;
  sku: string;
  price: number;
  mrp?: number | null;
  taxPercent?: number | null;
  unit: string;
  images?: { url: string; isPrimary?: boolean }[];
}

/**
 * Computes order totals exclusively from server-side product data.
 * The browser never supplies prices, discounts or totals.
 */
export function calculateOrderPricing(
  products: PriceableProduct[],
  requestedQuantities: Map<string, number>,
  shippingCharge = 0,
): PriceBreakdown {
  const items: PricedLine[] = [];
  let subtotal = 0;
  let taxAmount = 0;
  let discountAmount = 0;

  for (const product of products) {
    const productId = product._id.toString();
    const quantity = requestedQuantities.get(productId) ?? 0;
    if (quantity <= 0) continue;

    const unitPrice = roundMoney(product.price);
    const mrp = product.mrp ? roundMoney(product.mrp) : undefined;
    const taxPercent = product.taxPercent ?? 0;

    const gross = unitPrice * quantity;
    const discount = mrp && mrp > unitPrice ? roundMoney((mrp - unitPrice) * quantity) : 0;
    const taxable = gross - discount;
    const tax = roundMoney((taxable * taxPercent) / 100);
    const lineTotal = roundMoney(taxable + tax);

    subtotal += gross;
    discountAmount += discount;
    taxAmount += tax;

    const primaryImage = product.images?.find((i) => i.isPrimary) ?? product.images?.[0];

    items.push({
      productId,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      image: primaryImage?.url,
      unit: product.unit,
      quantity,
      unitPrice,
      mrp,
      taxPercent,
      taxAmount: tax,
      discountAmount: discount,
      lineTotal,
    });
  }

  const roundedSubtotal = roundMoney(subtotal);
  const roundedDiscount = roundMoney(discountAmount);
  const roundedTax = roundMoney(taxAmount);
  const charge = roundMoney(shippingCharge);

  const total = roundMoney(roundedSubtotal - roundedDiscount + roundedTax + charge);

  return {
    items,
    subtotal: roundedSubtotal,
    discountAmount: roundedDiscount,
    taxAmount: roundedTax,
    shippingCharge: charge,
    total,
    currency: 'INR',
  };
}

export default calculateOrderPricing;

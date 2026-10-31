import { roundMoney } from '../utils/helpers.js';
/**
 * Computes order totals exclusively from server-side product data.
 * The browser never supplies prices, discounts or totals.
 */
export function calculateOrderPricing(products, requestedQuantities, shippingCharge = 0) {
    const items = [];
    let subtotal = 0;
    let taxAmount = 0;
    let discountAmount = 0;
    for (const product of products) {
        const productId = product._id.toString();
        const quantity = requestedQuantities.get(productId) ?? 0;
        if (quantity <= 0)
            continue;
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
//# sourceMappingURL=pricing.service.js.map
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { calculateOrderPricing } from '../services/pricing.service.js';
import { shippingChargeFor } from '../services/delivery.service.js';
async function loadCart(userId) {
    const cart = (await Cart.findOne({ user: userId })) ?? new Cart({ user: userId, items: [] });
    return cart;
}
/** Builds the cart payload with live prices and stock from the database. */
async function buildCartPayload(cart) {
    if (!cart.items.length) {
        return {
            items: [],
            itemCount: 0,
            totalItems: 0,
            subtotal: 0,
            discountAmount: 0,
            taxAmount: 0,
            shippingCharge: 0,
            total: 0,
            savings: 0,
        };
    }
    const productIds = cart.items.map((i) => String(i.product));
    const products = await Product.find({ _id: { $in: productIds }, isArchived: { $ne: true } }).populate([
        { path: 'category', select: 'name slug' },
        { path: 'brand', select: 'name slug' },
    ]);
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const items = cart.items
        .map((item) => {
        const product = productMap.get(String(item.product));
        if (!product)
            return null;
        const quantity = Math.min(item.quantity, Math.max(product.stock, 0));
        const unitPrice = product.price;
        const mrp = product.mrp ?? undefined;
        return {
            product: {
                _id: product._id,
                name: product.name,
                slug: product.slug,
                sku: product.sku,
                image: product.images?.find((i) => i.isPrimary)?.url ?? product.images?.[0]?.url,
                unit: product.unit,
                price: unitPrice,
                mrp,
                stock: product.stock,
                isPublished: product.isPublished,
                category: product.category,
                brand: product.brand,
            },
            quantity,
            unitPrice,
            mrp,
            lineTotal: Math.round(unitPrice * quantity * 100) / 100,
            available: product.stock,
            isAvailable: product.isPublished && product.stock > 0,
        };
    })
        .filter((i) => i !== null);
    const quantityMap = new Map(items.map((i) => [String(i.product._id), i.quantity]));
    const pricing = calculateOrderPricing(products, quantityMap, 0);
    const { charge } = shippingChargeFor(pricing.subtotal);
    return {
        items,
        itemCount: items.length,
        totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        taxAmount: pricing.taxAmount,
        shippingCharge: charge,
        total: Math.round((pricing.subtotal - pricing.discountAmount + pricing.taxAmount + charge) * 100) / 100,
        savings: pricing.discountAmount,
    };
}
/** GET /api/v1/cart */
export const getCart = asyncHandler(async (req, res) => {
    const cart = await loadCart(String(req.user._id));
    const payload = await buildCartPayload(cart);
    return sendSuccess(res, payload, 'Cart retrieved');
});
/** POST /api/v1/cart/items */
export const addToCart = asyncHandler(async (req, res) => {
    const { product: productId, quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product || product.isArchived)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    if (!product.isPublished)
        throw AppError.badRequest('This product is not available', 'PRODUCT_UNAVAILABLE');
    if (product.stock <= 0)
        throw AppError.conflict('This product is out of stock', 'OUT_OF_STOCK');
    const cart = await loadCart(String(req.user._id));
    const existing = cart.items.find((i) => String(i.product) === productId);
    const desired = (existing?.quantity ?? 0) + quantity;
    if (desired > product.stock) {
        throw AppError.conflict(`Only ${product.stock} unit(s) of "${product.name}" are in stock`, 'INSUFFICIENT_STOCK', { available: product.stock });
    }
    if (existing) {
        existing.quantity = desired;
        existing.unitPrice = product.price;
    }
    else {
        cart.items.push({ product: product._id, quantity, unitPrice: product.price });
    }
    await cart.save();
    const payload = await buildCartPayload(cart);
    return sendSuccess(res, payload, 'Item added to cart', 201);
});
/** PATCH /api/v1/cart/items/:productId */
export const updateCartItem = asyncHandler(async (req, res) => {
    const { product: productId } = req.params;
    const { quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product)
        throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
    const cart = await loadCart(String(req.user._id));
    const item = cart.items.find((i) => String(i.product) === productId);
    if (!item)
        throw AppError.notFound('Item is not in your cart', 'CART_ITEM_NOT_FOUND');
    if (quantity <= 0) {
        cart.items = cart.items.filter((i) => String(i.product) !== productId);
    }
    else {
        if (quantity > product.stock) {
            throw AppError.conflict(`Only ${product.stock} unit(s) of "${product.name}" are in stock`, 'INSUFFICIENT_STOCK', { available: product.stock });
        }
        item.quantity = quantity;
        item.unitPrice = product.price;
    }
    await cart.save();
    const payload = await buildCartPayload(cart);
    return sendSuccess(res, payload, 'Cart updated');
});
/**
 * PUT /api/v1/cart/items
 * Replaces the whole cart with the supplied item list. This is NOT the same as
 * POST /cart/items (which adds a single line and accumulates the quantity).
 * Quantities are absolute, and every line is validated against live stock.
 */
export const replaceCart = asyncHandler(async (req, res) => {
    const { items } = req.body;
    // Merge duplicate lines for the same product so the client cannot smuggle
    // an over-stock total by repeating a product id.
    const merged = new Map();
    for (const item of items) {
        merged.set(item.product, (merged.get(item.product) ?? 0) + item.quantity);
    }
    const productIds = [...merged.keys()];
    const products = await Product.find({
        _id: { $in: productIds },
        isArchived: { $ne: true },
    });
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    // Validate every line before mutating the cart.
    for (const [productId, quantity] of merged) {
        const product = productMap.get(productId);
        if (!product)
            throw AppError.notFound('Product not found', 'PRODUCT_NOT_FOUND');
        if (!product.isPublished) {
            throw AppError.badRequest('This product is not available', 'PRODUCT_UNAVAILABLE');
        }
        if (quantity > product.stock) {
            throw AppError.conflict(`Only ${product.stock} unit(s) of "${product.name}" are in stock`, 'INSUFFICIENT_STOCK', { available: product.stock });
        }
    }
    const cart = await loadCart(String(req.user._id));
    cart.items = [...merged.entries()].map(([productId, quantity]) => ({
        product: productMap.get(productId)._id,
        quantity,
        unitPrice: productMap.get(productId).price,
    }));
    await cart.save();
    const payload = await buildCartPayload(cart);
    return sendSuccess(res, payload, 'Cart updated');
});
/** DELETE /api/v1/cart/items/:productId */
export const removeCartItem = asyncHandler(async (req, res) => {
    const { product: productId } = req.params;
    const cart = await loadCart(String(req.user._id));
    cart.items = cart.items.filter((i) => String(i.product) !== productId);
    await cart.save();
    const payload = await buildCartPayload(cart);
    return sendSuccess(res, payload, 'Item removed from cart');
});
/** DELETE /api/v1/cart */
export const clearCart = asyncHandler(async (req, res) => {
    const cart = await loadCart(String(req.user._id));
    cart.items = [];
    await cart.save();
    return sendSuccess(res, { items: [], itemCount: 0, totalItems: 0, total: 0 }, 'Cart cleared');
});
export default { getCart, addToCart, updateCartItem, replaceCart, removeCartItem, clearCart };
//# sourceMappingURL=cart.controller.js.map
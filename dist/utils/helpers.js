/** URL-friendly slug generator. */
export function slugify(input) {
    return input
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}
/** Appends a short random suffix to make a slug unique. */
export function uniqueSlug(input) {
    return `${slugify(input)}-${Math.random().toString(36).slice(2, 7)}`;
}
/** Generates a human-friendly sequential-ish order number: ES-20260115-8F3A2B */
export function generateOrderNumber(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ES-${y}${m}${d}-${rand}`;
}
/** Rounds money to 2 decimals, avoiding floating point drift. */
export function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
/** Formats an amount as INR. */
export function formatINR(value) {
    return `₹${roundMoney(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}
/** Masks a secret for safe logging. */
export function maskSecret(value) {
    if (!value)
        return '(not set)';
    if (value.length <= 6)
        return '***';
    return `${value.slice(0, 3)}***${value.slice(-2)}`;
}
export default slugify;
//# sourceMappingURL=helpers.js.map
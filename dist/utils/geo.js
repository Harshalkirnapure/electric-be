/** Distance between two coordinates using the Haversine formula (kilometres). */
export function calculateDistanceKm(lat1, lng1, lat2, lng2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371; // mean radius of the Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}
/** Straight-line distance in kilometres, rounded to 2 decimals. */
export function distanceBetween(a, b) {
    return Math.round(calculateDistanceKm(a.lat, a.lng, b.lat, b.lng) * 100) / 100;
}
export default distanceBetween;
//# sourceMappingURL=geo.js.map
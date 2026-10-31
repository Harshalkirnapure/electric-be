/**
 * Shipping provider abstraction.
 *
 * The order system only ever talks to this interface, so a courier aggregator
 * (Shiprocket, Delhivery, Blue Dart, ...) can be plugged in later without
 * touching the order workflow.
 */
/**
 * Default provider: the store's own local delivery fleet.
 * It never fabricates a tracking number — a courier is only recorded once an
 * operator has manually entered real courier details in the admin dashboard.
 */
export class LocalDeliveryProvider {
    name = 'local_delivery';
    isConfigured() {
        return true;
    }
    async bookShipment(_request) {
        return {
            success: false,
            provider: this.name,
            message: 'Local delivery is fulfilled by our own team. Shipment details are recorded manually by an operator — no online booking is available yet.',
        };
    }
    async trackShipment(trackingNumber) {
        return {
            provider: this.name,
            trackingNumber,
            status: 'in_transit',
            message: 'Tracking is updated manually by our delivery team. Please contact the store for the latest status.',
        };
    }
}
let activeProvider = new LocalDeliveryProvider();
/** Registers a courier provider (used when integrating an aggregator later). */
export function registerShippingProvider(provider) {
    activeProvider = provider;
}
export function getShippingProvider() {
    return activeProvider;
}
export default getShippingProvider;
//# sourceMappingURL=shipping.provider.js.map
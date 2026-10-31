/**
 * Shipping provider abstraction.
 *
 * The order system only ever talks to this interface, so a courier aggregator
 * (Shiprocket, Delhivery, Blue Dart, ...) can be plugged in later without
 * touching the order workflow.
 */

export interface ShipmentRequest {
  orderNumber: string;
  orderId: string;
  recipient: {
    name: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  items: { name: string; sku: string; quantity: number; unitPrice: number }[];
  packageValue: number;
  weightKg?: number;
}

export interface ShipmentBooking {
  success: boolean;
  provider: string;
  courierName?: string;
  trackingNumber?: string;
  estimatedDeliveryDays?: number;
  labelUrl?: string;
  message: string;
}

export interface ShipmentTracking {
  provider: string;
  trackingNumber: string;
  status: string;
  message: string;
  lastUpdated?: Date;
}

export interface ShippingProvider {
  readonly name: string;
  isConfigured(): boolean;
  bookShipment(request: ShipmentRequest): Promise<ShipmentBooking>;
  trackShipment(trackingNumber: string): Promise<ShipmentTracking>;
  cancelShipment?(trackingNumber: string): Promise<{ success: boolean; message: string }>;
}

/**
 * Default provider: the store's own local delivery fleet.
 * It never fabricates a tracking number — a courier is only recorded once an
 * operator has manually entered real courier details in the admin dashboard.
 */
export class LocalDeliveryProvider implements ShippingProvider {
  readonly name = 'local_delivery';

  isConfigured(): boolean {
    return true;
  }

  async bookShipment(_request: ShipmentRequest): Promise<ShipmentBooking> {
    return {
      success: false,
      provider: this.name,
      message:
        'Local delivery is fulfilled by our own team. Shipment details are recorded manually by an operator — no online booking is available yet.',
    };
  }

  async trackShipment(trackingNumber: string): Promise<ShipmentTracking> {
    return {
      provider: this.name,
      trackingNumber,
      status: 'in_transit',
      message:
        'Tracking is updated manually by our delivery team. Please contact the store for the latest status.',
    };
  }
}

let activeProvider: ShippingProvider = new LocalDeliveryProvider();

/** Registers a courier provider (used when integrating an aggregator later). */
export function registerShippingProvider(provider: ShippingProvider): void {
  activeProvider = provider;
}

export function getShippingProvider(): ShippingProvider {
  return activeProvider;
}

export default getShippingProvider;

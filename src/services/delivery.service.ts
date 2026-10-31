import { config } from '../config/env.js';

export interface AddressLike {
  pincode?: string;
  lat?: number;
  lng?: number;
  city?: string;
}

export interface DeliveryQuote {
  eligible: boolean;
  reason?: string;
  message: string;
  distanceKm: number | null;
  charge: number;
  freeDelivery: boolean;
  etaDays: number;
  method: 'local_delivery';
}

/**
 * Local delivery eligibility is decided on the server only.
 * A location qualifies when:
 *  1. its PIN code is in the configured allow-list (when one is set), and
 *  2. its straight-line distance from the store is within the configured radius.
 */
export function checkDeliveryEligibility(address: AddressLike): DeliveryQuote {
  const { store } = config;

  if (!store.lat || !store.lng) {
    // Store coordinates not configured yet: fall back to the PIN allow-list only.
    const allowed = store.allowedPinCodes.includes(address.pincode ?? '');
    if (store.allowedPinCodes.length > 0 && !allowed) {
      return {
        eligible: false,
        reason: 'PINCODE_NOT_SERVICEABLE',
        message: `Sorry, we do not deliver to PIN code ${address.pincode ?? ''} yet.`,
        distanceKm: null,
        charge: 0,
        freeDelivery: false,
        etaDays: 0,
        method: 'local_delivery',
      };
    }
    return {
      eligible: true,
      message: 'Delivery is available in your area.',
      distanceKm: null,
      charge: 0,
      freeDelivery: false,
      etaDays: 2,
      method: 'local_delivery',
    };
  }

  if (address.lat === undefined || address.lng === undefined) {
    return {
      eligible: false,
      reason: 'LOCATION_REQUIRED',
      message:
        'We could not determine your location. Please enter your PIN code and re-check delivery availability.',
      distanceKm: null,
      charge: 0,
      freeDelivery: false,
      etaDays: 0,
      method: 'local_delivery',
    };
  }

  const distanceKm = haversineKm(store.lat, store.lng, address.lat, address.lng);

  if (store.allowedPinCodes.length > 0 && !store.allowedPinCodes.includes(address.pincode ?? '')) {
    return {
      eligible: false,
      reason: 'PINCODE_NOT_SERVICEABLE',
      message: `Sorry, we do not deliver to PIN code ${address.pincode ?? ''} yet.`,
      distanceKm,
      charge: 0,
      freeDelivery: false,
      etaDays: 0,
      method: 'local_delivery',
    };
  }

  if (distanceKm > store.deliveryRadiusKm) {
    return {
      eligible: false,
      reason: 'OUT_OF_RANGE',
      message: `Your location is approximately ${distanceKm} km from our store. We currently deliver within ${store.deliveryRadiusKm} km only.`,
      distanceKm,
      charge: 0,
      freeDelivery: false,
      etaDays: 0,
      method: 'local_delivery',
    };
  }

  return {
    eligible: true,
    message: 'Delivery is available in your area.',
    distanceKm,
    charge: 0,
    freeDelivery: false,
    etaDays: distanceKm <= 15 ? 1 : distanceKm <= 35 ? 2 : 3,
    method: 'local_delivery',
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/** Delivery charge for a given subtotal (free-delivery threshold applied). */
export function shippingChargeFor(subtotal: number): { charge: number; freeDelivery: boolean } {
  const { store } = config;
  if (store.freeDeliveryAbove > 0 && subtotal >= store.freeDeliveryAbove) {
    return { charge: 0, freeDelivery: true };
  }
  return { charge: store.localDeliveryCharge, freeDelivery: false };
}

export default checkDeliveryEligibility;

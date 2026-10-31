import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import { checkDeliveryEligibility } from '../services/delivery.service.js';
import { config } from '../config/env.js';
import { validate } from '../middlewares/validate.js';
import { deliveryCheckSchema } from '../validators/order.validator.js';

const router = Router();

/** GET /api/v1/delivery/check — server-side delivery eligibility check. */
router.post(
  '/check',
  validate({ body: deliveryCheckSchema }),
  asyncHandler(async (req, res) => {
    const { pincode, lat, lng } = req.body as { pincode: string; lat?: number; lng?: number };

    const quote = checkDeliveryEligibility({ pincode, lat, lng });
    const { charge, freeDelivery } = (await import('../services/delivery.service.js')).shippingChargeFor(
      0,
    );

    res.json({
      success: true,
      data: {
        ...quote,
        shippingCharge: quote.eligible ? charge : 0,
        freeDelivery,
        store: {
          lat: config.store.lat ?? null,
          lng: config.store.lng ?? null,
          radiusKm: config.store.deliveryRadiusKm,
        },
      },
      message: quote.message,
    });
  }),
);

/** GET /api/v1/delivery/config — public delivery configuration for the storefront. */
router.get('/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      method: 'local_delivery',
      deliveryRadiusKm: config.store.deliveryRadiusKm,
      localDeliveryCharge: config.store.localDeliveryCharge,
      freeDeliveryAbove: config.store.freeDeliveryAbove,
      allowedPinCodes: config.store.allowedPinCodes,
      codEnabled: config.cod.enabled,
      codMaxAmount: config.cod.maxAmount,
      storeLocationConfigured: Boolean(config.store.lat && config.store.lng),
    },
    message: 'Delivery configuration retrieved',
  });
});

export default router;

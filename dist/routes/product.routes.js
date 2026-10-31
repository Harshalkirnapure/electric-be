import { Router } from 'express';
import { listProducts, getFeaturedProducts, getBestSellers, getLatestProducts, getProductCategories, searchProducts, getProductBySlug, } from '../controllers/product.controller.js';
import { optionalAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { productListQuerySchema } from '../validators/product.validator.js';
const router = Router();
// Static segments must be declared before the `/:slug` catch-all.
router.get('/featured', getFeaturedProducts);
router.get('/best-sellers', getBestSellers);
router.get('/latest', getLatestProducts);
router.get('/categories', getProductCategories);
router.get('/search', validate({ query: productListQuerySchema }), searchProducts);
router.get('/', validate({ query: productListQuerySchema }), optionalAuth, listProducts);
router.get('/:slug', optionalAuth, getProductBySlug);
export default router;
//# sourceMappingURL=product.routes.js.map
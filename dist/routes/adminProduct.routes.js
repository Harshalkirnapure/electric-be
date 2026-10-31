import { Router } from 'express';
import { listAdminProducts, getAdminProduct, createProduct, updateProduct, togglePublish, updateStock, deleteProduct, } from '../controllers/adminProduct.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { createProductSchema, updateProductSchema, productListQuerySchema, stockUpdateSchema, publishSchema, } from '../validators/product.validator.js';
const router = Router();
router.use(authenticate, authorize('admin'));
router.get('/', validate({ query: productListQuerySchema }), listAdminProducts);
router.post('/', validate({ body: createProductSchema }), createProduct);
router.get('/:id', getAdminProduct);
router.patch('/:id', validate({ body: updateProductSchema }), updateProduct);
router.patch('/:id/publish', validate({ body: publishSchema }), togglePublish);
router.patch('/:id/stock', validate({ body: stockUpdateSchema }), updateStock);
router.delete('/:id', deleteProduct);
export default router;
//# sourceMappingURL=adminProduct.routes.js.map
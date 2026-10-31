import { Router } from 'express';
import { listCategories, createCategory, updateCategory, deleteCategory, listBrands, createBrand, updateBrand, deleteBrand, } from '../controllers/category.controller.js';
import { authenticate, optionalAuth } from '../middlewares/auth.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { createCategorySchema, updateCategorySchema, createBrandSchema, updateBrandSchema, } from '../validators/catalog.validator.js';
const router = Router();
router.get('/categories', optionalAuth, listCategories);
router.get('/brands', optionalAuth, listBrands);
router.post('/categories', authenticate, authorize('admin'), validate({ body: createCategorySchema }), createCategory);
router.patch('/categories/:id', authenticate, authorize('admin'), validate({ body: updateCategorySchema }), updateCategory);
router.delete('/categories/:id', authenticate, authorize('admin'), deleteCategory);
router.post('/brands', authenticate, authorize('admin'), validate({ body: createBrandSchema }), createBrand);
router.patch('/brands/:id', authenticate, authorize('admin'), validate({ body: updateBrandSchema }), updateBrand);
router.delete('/brands/:id', authenticate, authorize('admin'), deleteBrand);
export default router;
//# sourceMappingURL=catalog.routes.js.map
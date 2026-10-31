import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import AuditLog from '../models/AuditLog.js';
import AppError from '../utils/AppError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';
import { slugify } from '../utils/helpers.js';

async function audit(req: Request, action: string, entity: string, entityId: unknown, metadata?: unknown) {
  await AuditLog.create({
    action,
    entity,
    entityId: entityId ? new mongoose.Types.ObjectId(String(entityId)) : undefined,
    actor: req.user?._id,
    actorEmail: req.user?.email,
    metadata,
    ip: req.ip,
    requestId: req.id,
  });
}

/** GET /api/v1/categories */
export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const includeAll = req.user?.role === 'admin' && req.query.all === 'true';
  const filter = includeAll ? {} : { isActive: true, isArchived: { $ne: true } };

  const categories = await Category.find(filter)
    .populate({ path: 'parent', select: 'name slug' })
    .sort({ displayOrder: 1, name: 1 })
    .lean();

  const counts = await Product.aggregate([
    { $match: { isPublished: true, isArchived: { $ne: true } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  return sendSuccess(
    res,
    categories.map((c) => ({ ...c, productCount: countMap.get(String(c._id)) ?? 0 })),
    'Categories retrieved',
  );
});

/** POST /api/v1/admin/categories */
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = String(body.name).trim();

  if (await Category.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) {
    throw AppError.conflict('A category with this name already exists', 'DUPLICATE_CATEGORY');
  }

  const category = await Category.create({
    ...body,
    name,
    slug: slugify(name),
  });

  await audit(req, 'category.create', 'Category', category._id, { name });
  return sendSuccess(res, category, 'Category created successfully', 201);
});

/** PATCH /api/v1/admin/categories/:id */
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw AppError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  const body = req.body as Record<string, unknown>;
  if (body.name) {
    const name = String(body.name).trim();
    const duplicate = await Category.exists({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      _id: { $ne: category._id },
    });
    if (duplicate) throw AppError.conflict('A category with this name already exists', 'DUPLICATE_CATEGORY');
    body.name = name;
    body.slug = slugify(name);
  }

  Object.assign(category, body);
  await category.save();

  await audit(req, 'category.update', 'Category', category._id, { changed: Object.keys(body) });
  return sendSuccess(res, category, 'Category updated successfully');
});

/** DELETE /api/v1/admin/categories/:id — archives when products still reference it. */
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw AppError.notFound('Category not found', 'CATEGORY_NOT_FOUND');

  const productCount = await Product.countDocuments({ category: category._id, isArchived: { $ne: true } });

  if (productCount > 0) {
    category.isArchived = true;
    category.isActive = false;
    await category.save();
    await audit(req, 'category.archive', 'Category', category._id, { productCount });
    return sendSuccess(
      res,
      { archived: true, productCount },
      'Category still has products, so it was archived instead of deleted',
    );
  }

  await category.deleteOne();
  await audit(req, 'category.delete', 'Category', category._id, { name: category.name });
  return sendSuccess(res, null, 'Category deleted successfully');
});

/** GET /api/v1/brands */
export const listBrands = asyncHandler(async (req: Request, res: Response) => {
  const includeAll = req.user?.role === 'admin' && req.query.all === 'true';
  const filter = includeAll ? {} : { isActive: true, isArchived: { $ne: true } };

  const brands = await Brand.find(filter).sort({ name: 1 }).lean();

  const counts = await Product.aggregate([
    { $match: { isPublished: true, isArchived: { $ne: true } } },
    { $group: { _id: '$brand', count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  return sendSuccess(
    res,
    brands.map((b) => ({ ...b, productCount: countMap.get(String(b._id)) ?? 0 })),
    'Brands retrieved',
  );
});

/** POST /api/v1/admin/brands */
export const createBrand = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = String(body.name).trim();

  if (await Brand.exists({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })) {
    throw AppError.conflict('A brand with this name already exists', 'DUPLICATE_BRAND');
  }

  const brand = await Brand.create({ ...body, name, slug: slugify(name) });
  await audit(req, 'brand.create', 'Brand', brand._id, { name });
  return sendSuccess(res, brand, 'Brand created successfully', 201);
});

/** PATCH /api/v1/admin/brands/:id */
export const updateBrand = asyncHandler(async (req: Request, res: Response) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw AppError.notFound('Brand not found', 'BRAND_NOT_FOUND');

  const body = req.body as Record<string, unknown>;
  if (body.name) {
    const name = String(body.name).trim();
    const duplicate = await Brand.exists({
      name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      _id: { $ne: brand._id },
    });
    if (duplicate) throw AppError.conflict('A brand with this name already exists', 'DUPLICATE_BRAND');
    body.name = name;
    body.slug = slugify(name);
  }

  Object.assign(brand, body);
  await brand.save();

  await audit(req, 'brand.update', 'Brand', brand._id, { changed: Object.keys(body) });
  return sendSuccess(res, brand, 'Brand updated successfully');
});

/** DELETE /api/v1/admin/brands/:id — archives when products still reference it. */
export const deleteBrand = asyncHandler(async (req: Request, res: Response) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw AppError.notFound('Brand not found', 'BRAND_NOT_FOUND');

  const productCount = await Product.countDocuments({ brand: brand._id, isArchived: { $ne: true } });

  if (productCount > 0) {
    brand.isArchived = true;
    brand.isActive = false;
    await brand.save();
    await audit(req, 'brand.archive', 'Brand', brand._id, { productCount });
    return sendSuccess(
      res,
      { archived: true, productCount },
      'Brand still has products, so it was archived instead of deleted',
    );
  }

  await brand.deleteOne();
  await audit(req, 'brand.delete', 'Brand', brand._id, { name: brand.name });
  return sendSuccess(res, null, 'Brand deleted successfully');
});

export default {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listBrands,
  createBrand,
  updateBrand,
  deleteBrand,
};


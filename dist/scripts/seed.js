import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { config } from '../config/env.js';
import User from '../models/User.js';
import Category from '../models/Category.js';
import Brand from '../models/Brand.js';
import Product from '../models/Product.js';
import { slugify } from '../utils/helpers.js';
import logger from '../utils/logger.js';
import { CATEGORIES, BRANDS, PRODUCTS } from './seedData.js';
async function seedAdmin() {
    const existing = await User.findOne({ email: config.admin.email.toLowerCase() });
    if (existing) {
        existing.role = 'admin';
        existing.isActive = true;
        await existing.hashPassword(config.admin.password);
        await existing.save();
        logger.info('Administrator account updated', { email: existing.email });
        return;
    }
    const admin = new User({
        name: config.admin.name,
        email: config.admin.email.toLowerCase(),
        phone: config.store.phone.replace(/\s/g, ''),
        role: 'admin',
        isActive: true,
    });
    await admin.hashPassword(config.admin.password);
    await admin.save();
    logger.info('Administrator account created', { email: admin.email });
}
async function seedCategories() {
    const map = new Map();
    for (const [index, cat] of CATEGORIES.entries()) {
        const slug = slugify(cat.name);
        const doc = await Category.findOneAndUpdate({ slug }, { ...cat, slug, displayOrder: index + 1, isActive: true, isArchived: false }, { upsert: true, new: true, setDefaultsOnInsert: true });
        map.set(cat.name, doc._id);
    }
    logger.info(`Seeded ${map.size} categories`);
    return map;
}
async function seedBrands() {
    const map = new Map();
    for (const brand of BRANDS) {
        const slug = slugify(brand.name);
        const doc = await Brand.findOneAndUpdate({ slug }, { ...brand, slug, isActive: true, isArchived: false }, { upsert: true, new: true, setDefaultsOnInsert: true });
        map.set(brand.name, doc._id);
    }
    logger.info(`Seeded ${map.size} brands`);
    return map;
}
async function seedProducts(categoryMap, brandMap) {
    for (const item of PRODUCTS) {
        const categoryId = categoryMap.get(item.category);
        if (!categoryId) {
            logger.warn(`Skipping product with unknown category: ${item.name}`);
            continue;
        }
        const slug = slugify(item.name);
        const payload = {
            name: item.name,
            slug,
            sku: item.sku.toUpperCase(),
            shortDescription: item.shortDescription,
            description: `${item.shortDescription} Supplied by ${config.store.name}. Please check the specifications before purchase.`,
            category: categoryId,
            brand: item.brand ? brandMap.get(item.brand) : undefined,
            price: item.price,
            mrp: item.mrp,
            taxPercent: item.taxPercent ?? 18,
            stock: item.stock,
            lowStockThreshold: 10,
            unit: item.unit,
            specs: item.specs ?? [],
            isPublished: true,
            isFeatured: item.isFeatured ?? false,
            isArchived: false,
            tags: [item.category.toLowerCase(), (item.brand ?? '').toLowerCase()].filter(Boolean),
            images: [
                {
                    url: `https://placehold.co/600x600/f1f5f9/334155?text=${encodeURIComponent(item.name.slice(0, 28))}`,
                    alt: item.name,
                    isPrimary: true,
                },
            ],
        };
        await Product.findOneAndUpdate({ sku: payload.sku }, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    logger.info(`Seeded ${PRODUCTS.length} products`);
}
/** Runs the full seed. Safe to call repeatedly: records are upserted, not duplicated. */
export async function runSeed() {
    await seedAdmin();
    const categoryMap = await seedCategories();
    const brandMap = await seedBrands();
    await seedProducts(categoryMap, brandMap);
    logger.info('Seed completed successfully');
}
async function main() {
    await connectDatabase();
    await runSeed();
    // eslint-disable-next-line no-console
    console.log('\n  Seed complete.');
    // eslint-disable-next-line no-console
    console.log(`  Admin login: ${config.admin.email} / ${config.admin.password}\n`);
    await disconnectDatabase();
}
// Only run automatically when invoked directly (not when imported).
const isDirectRun = process.argv[1]?.includes('seed') && !process.argv[1]?.includes('devServer');
if (isDirectRun) {
    main().catch(async (err) => {
        // eslint-disable-next-line no-console
        console.error('Seed failed:', err);
        await disconnectDatabase().catch(() => undefined);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map
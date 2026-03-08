import { eq, and } from 'drizzle-orm';
import { getDb } from './db';
import { layerMappings, InsertLayerMapping } from '../drizzle/schema';

/**
 * Create a new layer mapping
 */
export async function createLayerMapping(mapping: InsertLayerMapping) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.insert(layerMappings).values(mapping);
  return result;
}

/**
 * Get all layer mappings for a user and template
 */
export async function getUserTemplateMappings(userId: number, templateId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const results = await db
    .select()
    .from(layerMappings)
    .where(and(eq(layerMappings.userId, userId), eq(layerMappings.templateId, templateId)));

  return results;
}

/**
 * Get a specific layer mapping by ID
 */
export async function getLayerMappingById(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.select().from(layerMappings).where(eq(layerMappings.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Update a layer mapping
 */
export async function updateLayerMapping(id: number, updates: Partial<InsertLayerMapping>) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.update(layerMappings).set(updates).where(eq(layerMappings.id, id));
  return result;
}

/**
 * Delete a layer mapping
 */
export async function deleteLayerMapping(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const result = await db.delete(layerMappings).where(eq(layerMappings.id, id));
  return result;
}

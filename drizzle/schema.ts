import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Layer mappings table for storing user-defined mappings between Excel columns and PSD text layers
export const layerMappings = mysqlTable('layer_mappings', {
  id: int('id').autoincrement().primaryKey(),
  userId: int('userId').notNull(),
  templateId: int('templateId').notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  mapping: text('mapping').notNull(), // JSON string
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt').defaultNow().onUpdateNow().notNull(),
});

export type LayerMapping = typeof layerMappings.$inferSelect;
export type InsertLayerMapping = typeof layerMappings.$inferInsert;

/**
 * PSD templates table - stores uploaded PSD files and their metadata
 */
export const psdTemplates = mysqlTable('psd_templates', {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(), // S3 file key
  fileUrl: text("fileUrl").notNull(), // S3 file URL
  width: int("width").notNull(),
  height: int("height").notNull(),
  textLayers: json("textLayers").notNull(), // Array of {name, currentText}
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PsdTemplate = typeof psdTemplates.$inferSelect;
export type InsertPsdTemplate = typeof psdTemplates.$inferInsert;

/**
 * Processing Jobs table - tracks batch image generation jobs
 */
export const processingJobs = mysqlTable("processing_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  templateId: int("templateId").notNull(),
  excelFileKey: varchar("excelFileKey", { length: 512 }).notNull(),
  excelFileUrl: text("excelFileUrl").notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  totalRows: int("totalRows").notNull(),
  processedRows: int("processedRows").default(0).notNull(),
  failedRows: int("failedRows").default(0).notNull(),
  errorMessage: text("errorMessage"),
  layerMapping: json("layerMapping").notNull(), // {excelColumn: psdLayerName}
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ProcessingJob = typeof processingJobs.$inferSelect;
export type InsertProcessingJob = typeof processingJobs.$inferInsert;

/**
 * Generated Images table - stores metadata for generated product images
 */
export const generatedImages = mysqlTable("generated_images", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  rowIndex: int("rowIndex").notNull(), // Row number from Excel
  productName: varchar("productName", { length: 255 }),
  imageFileKey: varchar("imageFileKey", { length: 512 }).notNull(),
  imageUrl: text("imageUrl").notNull(),
  status: mysqlEnum("status", ["success", "failed"]).notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedImage = typeof generatedImages.$inferSelect;
export type InsertGeneratedImage = typeof generatedImages.$inferInsert;

/**
 * Batch Downloads table - tracks ZIP file exports
 */
export const batchDownloads = mysqlTable("batch_downloads", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  zipFileKey: varchar("zipFileKey", { length: 512 }).notNull(),
  zipFileUrl: text("zipFileUrl").notNull(),
  imageCount: int("imageCount").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type BatchDownload = typeof batchDownloads.$inferSelect;
export type InsertBatchDownload = typeof batchDownloads.$inferInsert;

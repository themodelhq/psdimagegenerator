import { z } from 'zod';
import { protectedProcedure, router } from './_core/trpc';
import * as db from './db-mappings';

export const mappingRouter = router({
  save: protectedProcedure
    .input(z.object({
      templateId: z.number(),
      name: z.string().min(1),
      mapping: z.record(z.string(), z.string()),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await db.createLayerMapping({
          userId: ctx.user.id,
          templateId: input.templateId,
          name: input.name,
          mapping: JSON.stringify(input.mapping),
        });

        return { success: true };
      } catch (error) {
        console.error('Error saving mapping:', error);
        throw new Error(`Failed to save mapping: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),

  list: protectedProcedure
    .input(z.object({
      templateId: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const mappings = await db.getUserTemplateMappings(ctx.user.id, input.templateId);
        return mappings.map(m => ({
          ...m,
          mapping: typeof m.mapping === 'string' ? JSON.parse(m.mapping) : m.mapping,
        }));
      } catch (error) {
        console.error('Error fetching mappings:', error);
        throw new Error(`Failed to fetch mappings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),

  get: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const mapping = await db.getLayerMappingById(input.id);
        if (!mapping || mapping.userId !== ctx.user.id) {
          throw new Error('Mapping not found');
        }

        return {
          ...mapping,
          mapping: typeof mapping.mapping === 'string' ? JSON.parse(mapping.mapping) : mapping.mapping,
        };
      } catch (error) {
        console.error('Error fetching mapping:', error);
        throw new Error(`Failed to fetch mapping: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const mapping = await db.getLayerMappingById(input.id);
        if (!mapping || mapping.userId !== ctx.user.id) {
          throw new Error('Mapping not found');
        }

        await db.deleteLayerMapping(input.id);
        return { success: true };
      } catch (error) {
        console.error('Error deleting mapping:', error);
        throw new Error(`Failed to delete mapping: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }),
});

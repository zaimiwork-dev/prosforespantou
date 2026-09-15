// Server-side validation for the anonymous profile sync (W4a). Mirrors the
// client limits in lib/profile-snapshot.js — anything larger is refused, not
// truncated, so a tampered client cannot bloat a row.
import { z } from 'zod';
import { PROFILE_LIMITS as L } from '../profile-snapshot.js';

const shortText = z.string().min(1).max(L.shortText);
const weights = z.record(z.string().max(L.shortText), z.number().finite().min(0).max(1e6))
  .refine((m) => Object.keys(m).length <= L.interestKeys, { message: 'too many interest keys' });

export const profileSnapshotSchema = z.object({
  preferredStores: z.array(shortText).max(L.stores),
  preferredCategories: z.array(shortText).max(L.categories),
  favorites: z.array(z.object({
    key: z.string().min(1).max(L.key),
    productId: z.string().uuid().nullable(),
    productName: z.string().max(L.name),
    supermarket: shortText.nullable(),
  })).max(L.favorites),
  listItems: z.array(z.object({
    discountId: z.string().uuid(),
    productId: z.string().uuid().nullable(),
    supermarket: shortText.nullable(),
    quantity: z.number().int().min(1).max(99),
  })).max(L.listItems),
  interests: z.object({
    updatedAt: z.number().finite().min(0),
    categories: weights,
    brands: weights,
  }),
  textSize: z.enum(['normal', 'large']),
});

export const syncProfileSchema = profileSnapshotSchema.extend({
  profileId: z.string().uuid(),
});

export const deleteProfileSchema = z.object({
  profileId: z.string().uuid(),
});

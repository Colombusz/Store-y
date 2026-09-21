import { z } from 'zod';

export const REGION_KINDS = ['continent', 'country', 'province', 'city', 'district', 'landmark', 'ocean'] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

export const regionKindSchema = z.enum(REGION_KINDS);

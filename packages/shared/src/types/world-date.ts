import { z } from 'zod';
import { worldDateSchema } from '../schemas/world-date';

export type WorldDate = z.infer<typeof worldDateSchema>;

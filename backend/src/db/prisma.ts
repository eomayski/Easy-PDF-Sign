import { PrismaClient } from '@prisma/client';

// Single shared client — ts-node-dev respawns the whole process, so no
// hot-reload connection-leak guard is needed here.
export const prisma = new PrismaClient();

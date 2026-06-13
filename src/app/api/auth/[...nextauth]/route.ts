// Auth.js v5 catch-all route — mounts sign-in / callback / session endpoints
// under /api/auth/*. Node runtime (default) so the Prisma adapter works.
import { handlers } from '@/auth';

export const { GET, POST } = handlers;

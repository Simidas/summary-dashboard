import { fail } from '../lib/response.js';
import { getSession } from '../lib/session.js';

export async function requireOwner(request, env) {
  const session = await getSession(request, env);
  if (!session) return { error: fail(401, 'UNAUTHORIZED', '请先登录') };
  if (session.user.role !== 'owner') {
    return { error: fail(403, 'FORBIDDEN', '当前账号没有写入权限') };
  }
  return { session };
}

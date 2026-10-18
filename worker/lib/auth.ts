import { HttpError } from './http';
import { verifyJwt, type JwtPayload } from './jwt';

const BEARER = /^Bearer\s+(.+)$/i;

/** 校验 Authorization: Bearer <token>，失败抛 401 */
export async function requireAuth(request: Request, env: Env): Promise<JwtPayload> {
	const header = request.headers.get('Authorization') ?? '';
	const match = BEARER.exec(header);
	if (!match) throw new HttpError(401, 'UNAUTHORIZED', '未登录或缺少凭证');

	const payload = await verifyJwt(match[1].trim(), env.JWT_SECRET);
	if (!payload) throw new HttpError(401, 'UNAUTHORIZED', '登录状态无效或已过期');
	return payload;
}

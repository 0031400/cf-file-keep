import { requireAuth } from '../lib/auth';
import { HttpError, json, readJson } from '../lib/http';
import { signJwt, timingSafeEqual } from '../lib/jwt';

/** JWT 有效期：7 天 */
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function login(request: Request, env: Env): Promise<Response> {
	const body = await readJson<{ username?: unknown; password?: unknown }>(request);
	const { username, password } = body;

	if (typeof username !== 'string' || typeof password !== 'string') {
		throw new HttpError(400, 'INVALID_BODY', 'username 和 password 必填');
	}

	// 单账号，密码明文存在 secret 里，比较用常量时间避免时序泄露
	const userOk = timingSafeEqual(username, env.AUTH_USERNAME);
	const passOk = timingSafeEqual(password, env.AUTH_PASSWORD);
	if (!userOk || !passOk) throw new HttpError(401, 'INVALID_CREDENTIALS', '用户名或密码错误');

	const now = Math.floor(Date.now() / 1000);
	const exp = now + TOKEN_TTL_SECONDS;
	const token = await signJwt({ sub: env.AUTH_USERNAME, iat: now, exp }, env.JWT_SECRET);

	return json({ token, username: env.AUTH_USERNAME, expiresAt: exp * 1000 });
}

export async function me(request: Request, env: Env): Promise<Response> {
	const payload = await requireAuth(request, env);
	return json({ username: payload.sub, expiresAt: payload.exp * 1000 });
}

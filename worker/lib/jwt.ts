const encoder = new TextEncoder();

export interface JwtPayload {
	sub: string;
	iat: number;
	exp: number;
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Uint8Array {
	const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function importKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
		'sign',
		'verify',
	]);
}

/** 生成 HS256 JWT */
export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
	const header = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
	const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
	const data = `${header}.${body}`;
	const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(data));
	return `${data}.${toBase64Url(new Uint8Array(signature))}`;
}

/** 校验签名与过期时间，失败返回 null */
export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
	const parts = token.split('.');
	if (parts.length !== 3) return null;

	const [header, body, signature] = parts;
	const valid = await crypto.subtle.verify(
		'HMAC',
		await importKey(secret),
		fromBase64Url(signature),
		encoder.encode(`${header}.${body}`),
	);
	if (!valid) return null;

	let payload: JwtPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as JwtPayload;
	} catch {
		return null;
	}
	if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
	return payload;
}

/** 常量时间比较，避免时序侧信道 */
export function timingSafeEqual(a: string, b: string): boolean {
	const ab = encoder.encode(a);
	const bb = encoder.encode(b);
	const length = Math.max(ab.length, bb.length);
	let diff = ab.length ^ bb.length;
	for (let i = 0; i < length; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
	return diff === 0;
}

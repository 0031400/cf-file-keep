export class HttpError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'HttpError';
		this.status = status;
		this.code = code;
	}
}

export function json(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	headers.set('Content-Type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(err: unknown): Response {
	if (err instanceof HttpError) {
		return json({ error: { code: err.code, message: err.message } }, { status: err.status });
	}
	console.error('Unhandled error:', err);
	return json({ error: { code: 'INTERNAL', message: '服务器内部错误' } }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
	try {
		return (await request.json()) as T;
	} catch {
		throw new HttpError(400, 'INVALID_JSON', '请求体不是合法的 JSON');
	}
}

/** 组名等普通名称：去空格、非空、限长 */
export function requireName(value: unknown, field = 'name'): string {
	if (typeof value !== 'string') {
		throw new HttpError(400, 'INVALID_NAME', `${field} 必须是字符串`);
	}
	const name = value.trim();
	if (!name) throw new HttpError(400, 'INVALID_NAME', `${field} 不能为空`);
	if (name.length > 200) throw new HttpError(400, 'INVALID_NAME', `${field} 不能超过 200 个字符`);
	return name;
}

/** 文件名：过滤路径分隔符与控制字符，防止目录穿越 */
export function sanitizeFileName(raw: string): string {
	const name = raw.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
	if (!name || name === '.' || name === '..') {
		throw new HttpError(400, 'INVALID_NAME', '文件名不合法');
	}
	if (name.length > 200) throw new HttpError(400, 'INVALID_NAME', '文件名不能超过 200 个字符');
	return name;
}

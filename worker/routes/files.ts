import { HttpError, json, readJson, requireName, sanitizeFileName } from '../lib/http';

interface FileRow {
	id: string;
	group_id: string;
	name: string;
	size: number;
	content_type: string | null;
	r2_key: string;
	created_at: number;
	updated_at: number;
}

function toFile(row: FileRow) {
	return {
		id: row.id,
		groupId: row.group_id,
		name: row.name,
		size: row.size,
		contentType: row.content_type,
		// 文件名只用于展示，查找只认 UUID，所以改名后旧链接依然有效
		url: `/api/file/${row.id}/${encodeURIComponent(row.name)}`,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function findFile(env: Env, id: string): Promise<FileRow | null> {
	return env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(id).first<FileRow>();
}

async function groupExists(env: Env, groupId: string): Promise<boolean> {
	const row = await env.DB.prepare('SELECT id FROM file_groups WHERE id = ?').bind(groupId).first();
	return row !== null;
}

async function touchGroup(env: Env, groupId: string): Promise<void> {
	await env.DB.prepare('UPDATE file_groups SET updated_at = ? WHERE id = ?').bind(Date.now(), groupId).run();
}

interface UploadPayload {
	name: string;
	contentType: string | null;
	size: number | null;
	/** 写入 R2，返回真实字节数 */
	write: (key: string) => Promise<number>;
}

async function parseUpload(request: Request, url: URL, env: Env): Promise<UploadPayload> {
	const contentType = request.headers.get('Content-Type') ?? '';

	// 方式一：multipart/form-data（前端 FormData，最省事）
	if (contentType.toLowerCase().startsWith('multipart/form-data')) {
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File)) throw new HttpError(400, 'INVALID_BODY', 'multipart 请求必须包含 file 字段');

		const rawName = form.get('name');
		const name = sanitizeFileName(typeof rawName === 'string' && rawName.trim() ? rawName : file.name);
		const type = file.type || null;

		return {
			name,
			contentType: type,
			size: file.size,
			write: async (key) => {
				// R2 只接受长度已知的流，FixedLengthStream 让文件边读边传，不整块读进内存
				const { readable, writable } = new FixedLengthStream(file.size);
				void file.stream().pipeTo(writable).catch(() => {});
				const object = await env.BUCKET.put(key, readable, type ? { httpMetadata: { contentType: type } } : undefined);
				return object.size;
			},
		};
	}

	// 方式二：原始 body 直传（大文件推荐，request.body 直接转给 R2）
	const rawName = url.searchParams.get('name') ?? request.headers.get('X-File-Name');
	if (!rawName) {
		throw new HttpError(400, 'INVALID_BODY', '请通过 ?name= 查询参数或 X-File-Name 请求头提供文件名');
	}
	if (!request.body) throw new HttpError(400, 'EMPTY_BODY', '请求体为空');

	const name = sanitizeFileName(rawName);
	const type = contentType || null;
	const lengthHeader = request.headers.get('Content-Length');
	const size = lengthHeader && /^\d+$/.test(lengthHeader) ? Number(lengthHeader) : null;

	return {
		name,
		contentType: type,
		size,
		write: async (key) => {
			const object = await env.BUCKET.put(key, request.body, type ? { httpMetadata: { contentType: type } } : undefined);
			return object.size;
		},
	};
}

/** GET /api/groups/:id/files */
export async function listFiles(env: Env, groupId: string): Promise<Response> {
	if (!(await groupExists(env, groupId))) throw new HttpError(404, 'GROUP_NOT_FOUND', '文件组不存在');

	const { results } = await env.DB.prepare('SELECT * FROM files WHERE group_id = ? ORDER BY created_at DESC')
		.bind(groupId)
		.all<FileRow>();
	return json({ files: (results ?? []).map(toFile) });
}

/** POST /api/groups/:id/files */
export async function uploadFile(request: Request, env: Env, url: URL, groupId: string): Promise<Response> {
	if (!(await groupExists(env, groupId))) throw new HttpError(404, 'GROUP_NOT_FOUND', '文件组不存在');

	const upload = await parseUpload(request, url, env);

	const id = crypto.randomUUID();
	const r2Key = `files/${id}`;
	const size = await upload.write(r2Key);
	const now = Date.now();

	try {
		await env.DB.prepare(
			'INSERT INTO files (id, group_id, name, size, content_type, r2_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
		)
			.bind(id, groupId, upload.name, size, upload.contentType, r2Key, now, now)
			.run();
	} catch (err) {
		// 入库失败就把刚传上去的对象删掉，避免 R2 里留孤儿文件
		await env.BUCKET.delete(r2Key).catch(() => {});
		throw err;
	}

	await touchGroup(env, groupId);

	return json(
		{
			file: toFile({
				id,
				group_id: groupId,
				name: upload.name,
				size,
				content_type: upload.contentType,
				r2_key: r2Key,
				created_at: now,
				updated_at: now,
			}),
		},
		{ status: 201 },
	);
}

/** PATCH /api/files/:id { name } */
export async function renameFile(request: Request, env: Env, fileId: string): Promise<Response> {
	const row = await findFile(env, fileId);
	if (!row) throw new HttpError(404, 'FILE_NOT_FOUND', '文件不存在');

	const body = await readJson<{ name?: unknown }>(request);
	const name = sanitizeFileName(requireName(body.name));
	if (name === row.name) return json({ file: toFile(row) });

	const now = Date.now();
	await env.DB.prepare('UPDATE files SET name = ?, updated_at = ? WHERE id = ?').bind(name, now, fileId).run();
	await touchGroup(env, row.group_id);

	return json({ file: toFile({ ...row, name, updated_at: now }) });
}

/** DELETE /api/files/:id */
export async function deleteFile(env: Env, fileId: string): Promise<Response> {
	const row = await findFile(env, fileId);
	if (!row) throw new HttpError(404, 'FILE_NOT_FOUND', '文件不存在');

	// 先删库再删 R2：R2 删除失败只会留下孤儿对象，不会出现「有记录没内容」的坏链接
	await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();
	try {
		await env.BUCKET.delete(row.r2_key);
	} catch (err) {
		console.error('删除 R2 对象失败:', row.r2_key, err);
	}
	await touchGroup(env, row.group_id);

	return new Response(null, { status: 204 });
}

function contentDisposition(name: string, inline: boolean): string {
	const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
	const encoded = encodeURIComponent(name).replace(/'/g, '%27');
	return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * GET /api/file/:uuid/:filename —— 公开下载，不需要登录
 * 支持 Range（视频拖动、断点续传）；?inline=1 让浏览器直接预览而不是下载
 */
export async function downloadFile(request: Request, env: Env, url: URL, fileId: string): Promise<Response> {
	const row = await env.DB.prepare('SELECT id, name, r2_key, content_type FROM files WHERE id = ?')
		.bind(fileId)
		.first<Pick<FileRow, 'id' | 'name' | 'r2_key' | 'content_type'>>();
	if (!row) return new Response('文件不存在', { status: 404 });

	const hasRange = request.headers.has('Range');
	const object = await env.BUCKET.get(row.r2_key, hasRange ? { range: request.headers } : undefined);
	if (!object) return new Response('文件不存在', { status: 404 });

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set('Content-Type', row.content_type || headers.get('Content-Type') || 'application/octet-stream');
	headers.set('ETag', object.httpEtag);
	headers.set('Accept-Ranges', 'bytes');
	headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
	headers.set('Content-Disposition', contentDisposition(row.name, url.searchParams.get('inline') === '1'));

	// 200 / 206 必须按「请求有没有带 Range」来判断。
	// 不能用 object.range 判断：这版运行时即使没请求 Range，R2 返回的 R2ObjectBody
	// 也会把 range 填成整个对象（offset 0、length = size），拿它当开关会让所有下载都变成 206。
	const range = hasRange ? object.range : undefined;
	if (!range) return new Response(object.body, { status: 200, headers });

	let start = 0;
	let length = object.size;
	if ('offset' in range && typeof range.offset === 'number') start = range.offset;
	if ('suffix' in range && typeof range.suffix === 'number') start = Math.max(object.size - range.suffix, 0);
	if ('length' in range && typeof range.length === 'number') length = range.length;

	headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
	return new Response(object.body, { status: 206, headers });
}

import { requireAuth } from './lib/auth';
import { HttpError, errorResponse } from './lib/http';
import { login, me } from './routes/auth';
import { createGroup, deleteGroup, listGroups, renameGroup } from './routes/groups';
import { deleteFile, downloadFile, listFiles, renameFile, uploadFile } from './routes/files';

async function route(request: Request, env: Env, url: URL): Promise<Response | null> {
	const segments = url.pathname.split('/').filter(Boolean);
	const method = request.method;

	// 公开下载直链：/api/file/{uuid}/{文件名}
	if (segments[0] === 'api' && segments[1] === 'file') {
		if (segments.length < 4) throw new HttpError(400, 'INVALID_PATH', '下载路径应为 /api/file/{uuid}/{文件名}');
		if (method !== 'GET' && method !== 'HEAD') {
			throw new HttpError(405, 'METHOD_NOT_ALLOWED', '下载链接只支持 GET');
		}
		return downloadFile(request, env, url, segments[2]);
	}

	if (segments[0] !== 'api') return null;

	const [, resource, id, sub] = segments;

	// 公开接口
	if (resource === 'auth') {
		if (id === 'login' && method === 'POST') return login(request, env);
		if (id === 'me' && method === 'GET') return me(request, env);
		throw new HttpError(404, 'NOT_FOUND', '接口不存在');
	}

	// 以下全部需要登录
	await requireAuth(request, env);

	if (resource === 'groups') {
		if (segments.length === 2) {
			if (method === 'GET') return listGroups(env);
			if (method === 'POST') return createGroup(request, env);
			throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的请求方法');
		}
		if (segments.length === 3) {
			if (method === 'PATCH') return renameGroup(request, env, id);
			if (method === 'DELETE') return deleteGroup(env, id);
			throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的请求方法');
		}
		if (segments.length === 4 && sub === 'files') {
			if (method === 'GET') return listFiles(env, id);
			if (method === 'POST') return uploadFile(request, env, url, id);
			throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的请求方法');
		}
		return null;
	}

	if (resource === 'files' && segments.length === 3) {
		if (method === 'PATCH') return renameFile(request, env, id);
		if (method === 'DELETE') return deleteFile(env, id);
		throw new HttpError(405, 'METHOD_NOT_ALLOWED', '不支持的请求方法');
	}

	return null;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		try {
			const response = await route(request, env, new URL(request.url));
			if (response) return response;
			return new Response('Not Found', { status: 404 });
		} catch (err) {
			return errorResponse(err);
		}
	},
} satisfies ExportedHandler<Env>;

export interface Group {
	id: string;
	name: string;
	fileCount: number;
	totalSize: number;
	createdAt: number;
	updatedAt: number;
}

export interface FileItem {
	id: string;
	groupId: string;
	name: string;
	size: number;
	contentType: string | null;
	/** 后端返回的公开下载直链 */
	url: string;
	createdAt: number;
	updatedAt: number;
}

const TOKEN_KEY = 'cf-file-keep.token';

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
	}
}

let token: string | null = localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
	return token;
}

export function setToken(next: string | null): void {
	token = next;
	if (next) localStorage.setItem(TOKEN_KEY, next);
	else localStorage.removeItem(TOKEN_KEY);
}

function parseError(payload: unknown, fallback: string, status: number): ApiError {
	const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
	return new ApiError(status, error?.code ?? 'UNKNOWN', error?.message ?? fallback);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (token) headers.set('Authorization', `Bearer ${token}`);
	if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');

	const response = await fetch(path, { ...init, headers });
	if (response.status === 204) return undefined as T;

	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		// 非 JSON 响应（例如网关错误页）按状态码处理
	}

	if (!response.ok) throw parseError(payload, `请求失败（${response.status}）`, response.status);
	return payload as T;
}

export function login(username: string, password: string) {
	return request<{ token: string; username: string; expiresAt: number }>('/api/auth/login', {
		method: 'POST',
		body: JSON.stringify({ username, password }),
	}).then((data) => {
		setToken(data.token);
		return data;
	});
}

export function me() {
	return request<{ username: string; expiresAt: number }>('/api/auth/me');
}

export function listGroups() {
	return request<{ groups: Group[] }>('/api/groups');
}

export function createGroup(name: string) {
	return request<{ group: Group }>('/api/groups', { method: 'POST', body: JSON.stringify({ name }) });
}

export function renameGroup(id: string, name: string) {
	return request<{ group: Group }>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function deleteGroup(id: string) {
	return request<void>(`/api/groups/${id}`, { method: 'DELETE' });
}

export function listFiles(groupId: string) {
	return request<{ files: FileItem[] }>(`/api/groups/${groupId}/files`);
}

export function renameFile(id: string, name: string) {
	return request<{ file: FileItem }>(`/api/files/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function deleteFile(id: string) {
	return request<void>(`/api/files/${id}`, { method: 'DELETE' });
}

/**
 * 用 XHR 而不是 fetch，因为只有 XHR 能拿到上传进度。
 * 走原始 body 直传（?name=），Worker 端把 request.body 直接流给 R2，不经过 multipart 解析。
 */
export function uploadFile(groupId: string, file: File, onProgress: (ratio: number) => void): Promise<FileItem> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `/api/groups/${groupId}/files?name=${encodeURIComponent(file.name)}`);
		if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
		xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) onProgress(event.loaded / event.total);
		};
		xhr.onload = () => {
			let payload: unknown = null;
			try {
				payload = JSON.parse(xhr.responseText);
			} catch {
				// ignore
			}
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve((payload as { file: FileItem }).file);
				return;
			}
			reject(parseError(payload, `上传失败（${xhr.status}）`, xhr.status));
		};
		xhr.onerror = () => reject(new ApiError(0, 'NETWORK', '网络错误，上传失败'));
		xhr.onabort = () => reject(new ApiError(0, 'ABORTED', '上传已取消'));

		xhr.send(file);
	});
}

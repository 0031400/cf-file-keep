export type FileKind = 'image' | 'text' | 'pdf' | 'video' | 'audio' | 'archive' | 'other';

const TEXT_EXT = new Set([
	'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'log', 'yaml', 'yml', 'xml',
	'html', 'htm', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'go', 'rs', 'java',
	'c', 'h', 'cpp', 'sh', 'sql', 'toml', 'ini', 'conf', 'env',
]);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);
const ARCHIVE_EXT = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);

export function extOf(name: string): string {
	const index = name.lastIndexOf('.');
	return index > 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function kindOf(file: { name: string; contentType: string | null }): FileKind {
	const ext = extOf(file.name);
	const type = file.contentType ?? '';

	if (type.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
	if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
	if (type.startsWith('video/') || VIDEO_EXT.has(ext)) return 'video';
	if (type.startsWith('audio/') || AUDIO_EXT.has(ext)) return 'audio';
	if (TEXT_EXT.has(ext) || type.startsWith('text/') || type === 'application/json') return 'text';
	if (ARCHIVE_EXT.has(ext)) return 'archive';
	return 'other';
}

/** 只有这几种能内联预览 */
export function canPreview(file: { name: string; contentType: string | null }): boolean {
	return kindOf(file) !== 'other' && kindOf(file) !== 'archive';
}

export function formatBytes(bytes: number): string {
	if (!bytes) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	const value = bytes / 1024 ** index;
	const text = index === 0 || value >= 100 ? String(Math.round(value)) : value.toFixed(1);
	return `${text} ${units[index]}`;
}

export function formatDateTime(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function badgeText(name: string): string {
	return (extOf(name) || 'file').slice(0, 4).toUpperCase();
}

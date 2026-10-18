import { useEffect, useState } from 'react';
import type { FileItem } from '../api';
import { formatBytes, kindOf } from '../utils';
import { CloseIcon, DownloadIcon } from './Icons';

const TEXT_PREVIEW_BYTES = 200_000;

interface PreviewModalProps {
	file: FileItem;
	onClose: () => void;
}

export default function PreviewModal({ file, onClose }: PreviewModalProps) {
	const kind = kindOf(file);
	const inlineUrl = `${file.url}?inline=1`;
	const [text, setText] = useState<string | null>(null);
	const [truncated, setTruncated] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [onClose]);

	useEffect(() => {
		if (kind !== 'text') return;

		const controller = new AbortController();
		setText(null);
		setFailed(false);
		setTruncated(false);

		// 下载直链支持 Range，文本只取前 200KB，避免大日志把浏览器卡死
		fetch(file.url, { headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` }, signal: controller.signal })
			.then((response) => {
				if (!response.ok && response.status !== 206) throw new Error(String(response.status));
				// 小文件也会返回 206（整份），只有真的超过上限才算截断
				setTruncated(response.status === 206 && file.size > TEXT_PREVIEW_BYTES);
				return response.text();
			})
			.then((content) => setText(content))
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true);
			});

		return () => controller.abort();
	}, [file.url, file.size, kind]);

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
				<div className="modal-header">
					<div className="modal-title" title={file.name}>
						{file.name}
					</div>
					<span className="modal-meta">{formatBytes(file.size)}</span>
					<a className="icon-btn" href={file.url} download={file.name} title="下载">
						<DownloadIcon />
					</a>
					<button className="icon-btn" onClick={onClose} title="关闭（Esc）">
						<CloseIcon />
					</button>
				</div>

				<div className="modal-body">
					{kind === 'image' && <img src={inlineUrl} alt={file.name} />}
					{kind === 'video' && <video src={inlineUrl} controls autoPlay />}
					{kind === 'audio' && <audio src={inlineUrl} controls autoPlay />}
					{kind === 'pdf' && <iframe src={inlineUrl} title={file.name} />}
					{kind === 'text' && (
						failed
							? <div className="modal-fallback">无法读取文本内容，<a href={file.url}>点击下载</a></div>
							: text === null
								? <div className="modal-fallback">加载中…</div>
								: (
									<>
										{truncated && <div className="preview-tip">文件较大，仅预览前 200KB</div>}
										<pre className="preview-text">{text}</pre>
									</>
								)
					)}
				</div>
			</div>
		</div>
	);
}

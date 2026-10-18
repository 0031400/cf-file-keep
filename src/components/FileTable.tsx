import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FileItem } from '../api';
import { badgeText, canPreview, formatBytes, formatDateTime, kindOf } from '../utils';
import { DownloadIcon, EyeIcon, PencilIcon, TrashIcon } from './Icons';

interface FileTableProps {
	files: FileItem[];
	onRename: (id: string, name: string) => Promise<boolean>;
	onDelete: (file: FileItem) => void;
	onPreview: (file: FileItem) => void;
}

export default function FileTable({ files, onRename, onDelete, onPreview }: FileTableProps) {
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [pending, setPending] = useState(false);

	function startEdit(file: FileItem) {
		setEditingId(file.id);
		setEditName(file.name);
	}

	async function submitRename(event: FormEvent) {
		event.preventDefault();
		const id = editingId;
		const name = editName.trim();
		if (!id) return;
		if (!name) {
			setEditingId(null);
			return;
		}
		setPending(true);
		const ok = await onRename(id, name);
		setPending(false);
		if (ok) setEditingId(null);
	}

	return (
		<div className="table-wrap">
			<table className="file-table">
				<thead>
					<tr>
						<th>文件名</th>
						<th className="col-size">大小</th>
						<th className="col-time">上传时间</th>
						<th className="col-actions">操作</th>
					</tr>
				</thead>
				<tbody>
					{files.map((file) => (
						<tr key={file.id}>
							<td>
								<div className="file-cell">
									<span className={`file-badge ${kindOf(file)}`}>{badgeText(file.name)}</span>
									{editingId === file.id ? (
										<form className="inline-form grow" onSubmit={submitRename}>
											<input
												className="input"
												autoFocus
												value={editName}
												disabled={pending}
												onChange={(event) => setEditName(event.target.value)}
												onBlur={() => {
													if (!pending) setEditingId(null);
												}}
												onKeyDown={(event) => {
													if (event.key === 'Escape') setEditingId(null);
												}}
											/>
										</form>
									) : (
										<button
											className="file-name"
											title={file.name}
											onClick={() => {
												if (canPreview(file)) onPreview(file);
											}}
										>
											{file.name}
										</button>
									)}
								</div>
							</td>
							<td className="col-size muted-cell">{formatBytes(file.size)}</td>
							<td className="col-time muted-cell">{formatDateTime(file.createdAt)}</td>
							<td className="col-actions">
								<div className="row-actions">
									{canPreview(file) && (
										<button className="icon-btn" title="预览" onClick={() => onPreview(file)}>
											<EyeIcon />
										</button>
									)}
									<a className="icon-btn" title="下载" href={file.url} download={file.name}>
										<DownloadIcon />
									</a>
									<button className="icon-btn" title="重命名" onClick={() => startEdit(file)}>
										<PencilIcon />
									</button>
									<button
										className="icon-btn danger"
										title="删除"
										onClick={() => {
											if (window.confirm(`确定删除「${file.name}」？`)) onDelete(file);
										}}
									>
										<TrashIcon />
									</button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Group } from '../api';
import { formatBytes } from '../utils';
import { FolderIcon, LogOutIcon, PencilIcon, PlusIcon, TrashIcon } from './Icons';

interface SidebarProps {
	groups: Group[];
	activeId: string | null;
	username: string;
	onSelect: (id: string) => void;
	onCreate: (name: string) => Promise<boolean>;
	onRename: (id: string, name: string) => Promise<boolean>;
	onDelete: (id: string) => Promise<boolean>;
	onLogout: () => void;
}

export default function Sidebar({ groups, activeId, username, onSelect, onCreate, onRename, onDelete, onLogout }: SidebarProps) {
	const [creating, setCreating] = useState(false);
	const [newName, setNewName] = useState('');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [pending, setPending] = useState(false);

	async function submitCreate(event: FormEvent) {
		event.preventDefault();
		const name = newName.trim();
		if (!name) {
			setCreating(false);
			return;
		}
		setPending(true);
		const ok = await onCreate(name);
		setPending(false);
		if (ok) {
			setNewName('');
			setCreating(false);
		}
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

	function startRename(group: Group) {
		setCreating(false);
		setEditingId(group.id);
		setEditName(group.name);
	}

	async function confirmDelete(group: Group) {
		const message = group.fileCount > 0
			? `「${group.name}」里还有 ${group.fileCount} 个文件，需要先清空才能删除。`
			: `确定删除分组「${group.name}」？`;
		if (!window.confirm(message)) return;
		await onDelete(group.id);
	}

	return (
		<aside className="sidebar">
			<div className="brand">
				<span className="brand-dot" />
				<span>文件柜</span>
			</div>

			<div className="sidebar-section">
				<div className="sidebar-title">
					<span>分组</span>
					<button
						className="icon-btn"
						title="新建分组"
						onClick={() => {
							setEditingId(null);
							setCreating(true);
							setNewName('');
						}}
					>
						<PlusIcon />
					</button>
				</div>

				{creating && (
					<form className="inline-form" onSubmit={submitCreate}>
						<input
							className="input"
							autoFocus
							placeholder="分组名称，回车保存"
							value={newName}
							disabled={pending}
							onChange={(event) => setNewName(event.target.value)}
							onBlur={() => {
								if (!pending) setCreating(false);
							}}
							onKeyDown={(event) => {
								if (event.key === 'Escape') setCreating(false);
							}}
						/>
					</form>
				)}

				<ul className="group-list">
					{groups.length === 0 && !creating && <li className="group-empty">还没有分组</li>}
					{groups.map((group) => (
						<li key={group.id} className={group.id === activeId ? 'group active' : 'group'}>
							{editingId === group.id ? (
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
								<button className="group-main" onClick={() => onSelect(group.id)} title={`${group.name} · ${formatBytes(group.totalSize)}`}>
									<FolderIcon />
									<span className="group-name">{group.name}</span>
									<span className="group-count">{group.fileCount}</span>
								</button>
							)}

							{editingId !== group.id && (
								<div className="group-actions">
									<button className="icon-btn" title="重命名分组" onClick={() => startRename(group)}>
										<PencilIcon />
									</button>
									<button className="icon-btn danger" title="删除分组" onClick={() => confirmDelete(group)}>
										<TrashIcon />
									</button>
								</div>
							)}
						</li>
					))}
				</ul>
			</div>

			<div className="sidebar-footer">
				<span className="user">{username}</span>
				<button className="icon-btn" title="退出登录" onClick={onLogout}>
					<LogOutIcon />
				</button>
			</div>
		</aside>
	);
}

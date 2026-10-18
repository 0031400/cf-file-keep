import { useCallback, useEffect, useRef, useState } from 'react';
import './App.css';
import {
	ApiError,
	createGroup,
	deleteFile,
	deleteGroup,
	getToken,
	listFiles,
	listGroups,
	login,
	me,
	renameFile,
	renameGroup,
	setToken,
	uploadFile,
	type FileItem,
	type Group,
} from './api';
import FileTable from './components/FileTable';
import { UploadIcon } from './components/Icons';
import LoginPage from './components/LoginPage';
import PreviewModal from './components/PreviewModal';
import Sidebar from './components/Sidebar';
import { formatBytes } from './utils';

interface UploadTask {
	id: string;
	name: string;
	size: number;
	progress: number;
	status: 'pending' | 'uploading' | 'done' | 'error';
	error?: string;
}

type Toast = { text: string; kind: 'info' | 'error' };

export default function App() {
	const [status, setStatus] = useState<'checking' | 'login' | 'ready'>('checking');
	const [username, setUsername] = useState('');
	const [groups, setGroups] = useState<Group[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);
	const [files, setFiles] = useState<FileItem[]>([]);
	const [loadingFiles, setLoadingFiles] = useState(false);
	const [uploads, setUploads] = useState<UploadTask[]>([]);
	const [toast, setToast] = useState<Toast | null>(null);
	const [preview, setPreview] = useState<FileItem | null>(null);
	const [dragging, setDragging] = useState(false);

	const activeIdRef = useRef<string | null>(null);
	const toastTimer = useRef<number | undefined>(undefined);
	const dragDepth = useRef(0);
	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const notify = useCallback((text: string, kind: Toast['kind'] = 'info') => {
		setToast({ text, kind });
		window.clearTimeout(toastTimer.current);
		toastTimer.current = window.setTimeout(() => setToast(null), 3200);
	}, []);

	const handleError = useCallback((err: unknown) => {
		if (err instanceof ApiError && err.status === 401) {
			setToken(null);
			activeIdRef.current = null;
			setActiveId(null);
			setGroups([]);
			setFiles([]);
			setUsername('');
			setStatus('login');
			return;
		}
		notify(err instanceof Error ? err.message : '操作失败', 'error');
	}, [notify]);

	const refreshGroups = useCallback(async (): Promise<Group[]> => {
		const data = await listGroups();
		setGroups(data.groups);
		return data.groups;
	}, []);

	const refreshFiles = useCallback(async (groupId: string): Promise<FileItem[]> => {
		const data = await listFiles(groupId);
		if (activeIdRef.current === groupId) setFiles(data.files);
		return data.files;
	}, []);

	const selectGroup = useCallback(async (groupId: string) => {
		activeIdRef.current = groupId;
		setActiveId(groupId);
		setLoadingFiles(true);
		try {
			await refreshFiles(groupId);
		} catch (err) {
			handleError(err);
		} finally {
			setLoadingFiles(false);
		}
	}, [refreshFiles, handleError]);

	// 启动时用已存的 token 换用户信息
	useEffect(() => {
		let cancelled = false;

		async function bootstrap() {
			if (!getToken()) {
				setStatus('login');
				return;
			}
			try {
				const profile = await me();
				const list = await listGroups();
				if (cancelled) return;
				setUsername(profile.username);
				setGroups(list.groups);
				setStatus('ready');
				const first = list.groups[0];
				if (first) {
					activeIdRef.current = first.id;
					setActiveId(first.id);
					await refreshFiles(first.id);
				}
			} catch {
				if (cancelled) return;
				setToken(null);
				setStatus('login');
			}
		}

		void bootstrap();
		return () => {
			cancelled = true;
		};
	}, [refreshFiles]);

	const handleLogin = useCallback(async (name: string, password: string) => {
		const data = await login(name, password);
		setUsername(data.username);
		const list = await listGroups();
		setGroups(list.groups);
		setStatus('ready');
		const first = list.groups[0];
		if (first) {
			await selectGroup(first.id);
		} else {
			activeIdRef.current = null;
			setActiveId(null);
			setFiles([]);
		}
	}, [selectGroup]);

	const handleLogout = useCallback(() => {
		setToken(null);
		activeIdRef.current = null;
		setActiveId(null);
		setGroups([]);
		setFiles([]);
		setUsername('');
		setPreview(null);
		setUploads([]);
		setStatus('login');
	}, []);

	const handleCreateGroup = useCallback(async (name: string): Promise<boolean> => {
		try {
			const { group } = await createGroup(name);
			await refreshGroups();
			await selectGroup(group.id);
			notify(`已创建分组「${group.name}」`);
			return true;
		} catch (err) {
			handleError(err);
			return false;
		}
	}, [refreshGroups, selectGroup, notify, handleError]);

	const handleRenameGroup = useCallback(async (id: string, name: string): Promise<boolean> => {
		try {
			await renameGroup(id, name);
			await refreshGroups();
			return true;
		} catch (err) {
			handleError(err);
			return false;
		}
	}, [refreshGroups, handleError]);

	const handleDeleteGroup = useCallback(async (id: string): Promise<boolean> => {
		try {
			await deleteGroup(id);
			const list = await refreshGroups();
			if (activeIdRef.current === id) {
				const next = list[0];
				if (next) {
					await selectGroup(next.id);
				} else {
					activeIdRef.current = null;
					setActiveId(null);
					setFiles([]);
				}
			}
			notify('分组已删除');
			return true;
		} catch (err) {
			handleError(err);
			return false;
		}
	}, [refreshGroups, selectGroup, notify, handleError]);

	const handleRenameFile = useCallback(async (id: string, name: string): Promise<boolean> => {
		try {
			const { file } = await renameFile(id, name);
			setFiles((prev) => prev.map((item) => (item.id === id ? file : item)));
			return true;
		} catch (err) {
			handleError(err);
			return false;
		}
	}, [handleError]);

	const handleDeleteFile = useCallback(async (file: FileItem) => {
		try {
			await deleteFile(file.id);
			setFiles((prev) => prev.filter((item) => item.id !== file.id));
			notify('文件已删除');
			void refreshGroups().catch(() => {});
		} catch (err) {
			handleError(err);
		}
	}, [notify, refreshGroups, handleError]);

	const handleUpload = useCallback(async (incoming: File[]) => {
		const groupId = activeIdRef.current;
		if (!groupId) {
			notify('请先选择一个分组', 'error');
			return;
		}
		if (incoming.length === 0) return;

		const tasks: UploadTask[] = incoming.map((file) => ({
			id: crypto.randomUUID(),
			name: file.name,
			size: file.size,
			progress: 0,
			status: 'pending',
		}));
		setUploads((prev) => [...prev, ...tasks]);

		// 串行上传，避免同时占用带宽又看不清进度
		for (let index = 0; index < incoming.length; index++) {
			const task = tasks[index];
			const file = incoming[index];
			setUploads((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: 'uploading' } : item)));

			try {
				await uploadFile(groupId, file, (ratio) => {
					setUploads((prev) => prev.map((item) => (item.id === task.id ? { ...item, progress: ratio } : item)));
				});
				setUploads((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: 'done', progress: 1 } : item)));
			} catch (err) {
				if (err instanceof ApiError && err.status === 401) {
					handleError(err);
					return;
				}
				const message = err instanceof Error ? err.message : '上传失败';
				setUploads((prev) => prev.map((item) => (item.id === task.id ? { ...item, status: 'error', error: message } : item)));
			}
		}

		void refreshFiles(groupId).catch(() => {});
		void refreshGroups().catch(() => {});
		window.setTimeout(() => {
			setUploads((prev) => prev.filter((item) => item.status !== 'done'));
		}, 2500);
	}, [notify, refreshFiles, refreshGroups, handleError]);

	const activeGroup = groups.find((group) => group.id === activeId) ?? null;

	if (status === 'checking') {
		return <div className="splash">正在加载…</div>;
	}

	if (status === 'login') {
		return <LoginPage onSubmit={handleLogin} />;
	}

	return (
		<div className="app">
			<Sidebar
				groups={groups}
				activeId={activeId}
				username={username}
				onSelect={(id) => void selectGroup(id)}
				onCreate={handleCreateGroup}
				onRename={handleRenameGroup}
				onDelete={handleDeleteGroup}
				onLogout={handleLogout}
			/>

			<main
				className="main"
				onDragEnter={(event) => {
					if (!event.dataTransfer.types.includes('Files')) return;
					event.preventDefault();
					dragDepth.current += 1;
					setDragging(true);
				}}
				onDragOver={(event) => {
					if (!event.dataTransfer.types.includes('Files')) return;
					event.preventDefault();
				}}
				onDragLeave={() => {
					dragDepth.current -= 1;
					if (dragDepth.current <= 0) {
						dragDepth.current = 0;
						setDragging(false);
					}
				}}
				onDrop={(event) => {
					event.preventDefault();
					dragDepth.current = 0;
					setDragging(false);
					void handleUpload(Array.from(event.dataTransfer.files));
				}}
			>
				{activeGroup ? (
					<>
						<header className="main-header">
							<div>
								<h1>{activeGroup.name}</h1>
								<p className="muted">{activeGroup.fileCount} 个文件 · {formatBytes(activeGroup.totalSize)}</p>
							</div>
							<button className="btn primary" onClick={() => fileInputRef.current?.click()}>
								<UploadIcon />
								上传文件
							</button>
						</header>

						<div className="main-body">
							{loadingFiles ? (
								<div className="empty">加载中…</div>
							) : files.length === 0 ? (
								<div className="empty">
									<div className="empty-title">这个分组还是空的</div>
									<p>点右上角上传，或者把文件拖进来</p>
								</div>
							) : (
								<FileTable
									files={files}
									onRename={handleRenameFile}
									onDelete={(file) => void handleDeleteFile(file)}
									onPreview={setPreview}
								/>
							)}
						</div>
					</>
				) : (
					<div className="empty big">
						<div className="empty-title">还没有文件分组</div>
						<p>在左侧点「+」新建一个分组，然后往里面传文件</p>
					</div>
				)}

				{dragging && <div className="drop-overlay">松开即可上传{activeGroup ? `到「${activeGroup.name}」` : ''}</div>}
			</main>

			<input
				ref={fileInputRef}
				type="file"
				multiple
				hidden
				onChange={(event) => {
					const picked = Array.from(event.target.files ?? []);
					event.target.value = '';
					void handleUpload(picked);
				}}
			/>

			{uploads.length > 0 && (
				<div className="upload-panel">
					<div className="upload-panel-title">上传队列</div>
					{uploads.map((task) => (
						<div key={task.id} className={`upload-item ${task.status}`}>
							<div className="upload-head">
								<span className="upload-name" title={task.name}>{task.name}</span>
								<span className="upload-status">{statusText(task)}</span>
							</div>
							<div className="upload-bar">
								<span style={{ width: `${Math.round(task.progress * 100)}%` }} />
							</div>
							{task.error && <div className="upload-error">{task.error}</div>}
						</div>
					))}
				</div>
			)}

			{toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}

			{preview && <PreviewModal key={preview.id} file={preview} onClose={() => setPreview(null)} />}
		</div>
	);
}

function statusText(task: UploadTask): string {
	if (task.status === 'pending') return '等待中';
	if (task.status === 'uploading') return `${Math.round(task.progress * 100)}%`;
	if (task.status === 'done') return '完成';
	return '失败';
}

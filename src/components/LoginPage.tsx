import { useState } from 'react';
import type { FormEvent } from 'react';

interface LoginPageProps {
	onSubmit: (username: string, password: string) => Promise<void>;
}

export default function LoginPage({ onSubmit }: LoginPageProps) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (submitting) return;
		setSubmitting(true);
		setError(null);
		try {
			await onSubmit(username.trim(), password);
		} catch (err) {
			setError(err instanceof Error ? err.message : '登录失败');
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="login-page">
			<form className="login-card" onSubmit={submit}>
				<div className="login-brand">
					<span className="brand-dot" />
					<span>文件柜</span>
				</div>
				<p className="hint">登录后管理你的文件分组</p>

				<div className="field">
					<label htmlFor="username">用户名</label>
					<input
						id="username"
						className="input"
						autoComplete="username"
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						autoFocus
					/>
				</div>

				<div className="field">
					<label htmlFor="password">密码</label>
					<input
						id="password"
						className="input"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(event) => setPassword(event.target.value)}
					/>
				</div>

				{error && <div className="form-error">{error}</div>}

				<button className="btn primary block" type="submit" disabled={submitting || !username || !password}>
					{submitting ? '登录中…' : '登录'}
				</button>
			</form>
		</div>
	);
}

-- 文件组：靠 UUID 区分，名称允许重复
CREATE TABLE IF NOT EXISTS file_groups (
	id         TEXT PRIMARY KEY,
	name       TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);

-- 文件：靠 UUID 区分，同组内文件名允许重复
CREATE TABLE IF NOT EXISTS files (
	id           TEXT PRIMARY KEY,
	group_id     TEXT NOT NULL REFERENCES file_groups (id) ON DELETE CASCADE,
	name         TEXT NOT NULL,
	size         INTEGER NOT NULL DEFAULT 0,
	content_type TEXT,
	r2_key       TEXT NOT NULL,
	created_at   INTEGER NOT NULL,
	updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_files_group_id ON files (group_id, created_at);

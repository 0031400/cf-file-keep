import { HttpError, json, readJson, requireName } from '../lib/http';

interface GroupRow {
	id: string;
	name: string;
	created_at: number;
	updated_at: number;
	file_count: number;
	total_size: number;
}

function toGroup(row: GroupRow) {
	return {
		id: row.id,
		name: row.name,
		fileCount: row.file_count ?? 0,
		totalSize: row.total_size ?? 0,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const GROUP_AGG = `
	SELECT g.id, g.name, g.created_at, g.updated_at,
	       COUNT(f.id) AS file_count,
	       COALESCE(SUM(f.size), 0) AS total_size
	  FROM file_groups g
	  LEFT JOIN files f ON f.group_id = g.id
`;

async function findGroup(env: Env, id: string) {
	const row = await env.DB.prepare(`${GROUP_AGG} WHERE g.id = ? GROUP BY g.id`).bind(id).first<GroupRow>();
	return row ? toGroup(row) : null;
}

/** GET /api/groups */
export async function listGroups(env: Env): Promise<Response> {
	const { results } = await env.DB.prepare(`${GROUP_AGG} GROUP BY g.id ORDER BY g.created_at DESC`).all<GroupRow>();
	return json({ groups: (results ?? []).map(toGroup) });
}

/** POST /api/groups { name } */
export async function createGroup(request: Request, env: Env): Promise<Response> {
	const body = await readJson<{ name?: unknown }>(request);
	const name = requireName(body.name);

	const id = crypto.randomUUID();
	const now = Date.now();
	await env.DB.prepare('INSERT INTO file_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
		.bind(id, name, now, now)
		.run();

	return json({ group: { id, name, fileCount: 0, totalSize: 0, createdAt: now, updatedAt: now } }, { status: 201 });
}

/** PATCH /api/groups/:id { name } */
export async function renameGroup(request: Request, env: Env, groupId: string): Promise<Response> {
	const body = await readJson<{ name?: unknown }>(request);
	const name = requireName(body.name);

	const current = await findGroup(env, groupId);
	if (!current) throw new HttpError(404, 'GROUP_NOT_FOUND', '文件组不存在');
	if (current.name === name) return json({ group: current });

	await env.DB.prepare('UPDATE file_groups SET name = ?, updated_at = ? WHERE id = ?')
		.bind(name, Date.now(), groupId)
		.run();

	return json({ group: await findGroup(env, groupId) });
}

/** DELETE /api/groups/:id —— 只允许删空组 */
export async function deleteGroup(env: Env, groupId: string): Promise<Response> {
	const group = await env.DB.prepare('SELECT id FROM file_groups WHERE id = ?').bind(groupId).first();
	if (!group) throw new HttpError(404, 'GROUP_NOT_FOUND', '文件组不存在');

	const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM files WHERE group_id = ?')
		.bind(groupId)
		.first<{ count: number }>();
	if ((countRow?.count ?? 0) > 0) {
		throw new HttpError(409, 'GROUP_NOT_EMPTY', '文件组内还有文件，请先删除文件');
	}

	await env.DB.prepare('DELETE FROM file_groups WHERE id = ?').bind(groupId).run();
	return new Response(null, { status: 204 });
}

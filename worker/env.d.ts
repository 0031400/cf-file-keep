// 这些绑定来自 wrangler.jsonc 与 secrets。
// worker-configuration.d.ts 是 `wrangler types` 生成的，会被覆盖，所以补一份自己的声明（接口会自动合并）。
interface Env {
	DB: D1Database;
	BUCKET: R2Bucket;
	AUTH_USERNAME: string;
	AUTH_PASSWORD: string;
	JWT_SECRET: string;
}

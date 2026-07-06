import { type Generated, Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { DATABASE_URL } from "./utility/configuration.js";

interface Database {
	guilds: GuildsTable;
}

interface GuildsTable {
	guild_id: string;
	attachment_spam: Generated<boolean>;
}

export const database = new Kysely<Database>({
	dialect: new PostgresDialect({
		pool: new Pool({ connectionString: DATABASE_URL }),
	}),
});

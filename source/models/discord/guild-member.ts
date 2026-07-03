import type { APIUser, Snowflake } from "@discordjs/core";

export interface GuildMemberData {
	roles: readonly Snowflake[];
	user: Pick<APIUser, "id">;
}

export class GuildMember {
	public readonly user: Pick<APIUser, "id">;

	public readonly roles: Set<Snowflake>;

	public constructor(data: GuildMemberData) {
		this.user = data.user;
		this.roles = new Set(data.roles);
	}
}

import type { APIRole, Snowflake } from "@discordjs/core";

export class Role {
	public readonly id: Snowflake;

	public permissions!: bigint;

	public constructor(data: Pick<APIRole, "id" | "permissions">) {
		this.id = data.id;
		this.patch(data);
	}

	public patch(data: Pick<APIRole, "permissions">) {
		this.permissions = BigInt(data.permissions);
	}
}

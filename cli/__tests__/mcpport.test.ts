// MCP on one port for every project: the first dev server has it, a second
// leaves it and is told whose it is, and the same project restarting gets it
// back.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { toJson } from "dab-core";
import { afterEach, beforeEach, expect, test } from "vitest";

import { closeMcp, listenMcp } from "../src/mcpport";
import { Store } from "../src/store";

const roots: string[] = [];
const servers: Server[] = [];

async function folder(): Promise<Store> {
  const root = await mkdtemp(path.join(tmpdir(), "dab-mcpport-"));
  roots.push(root);
  const sign = { name: "sign", w: 1, h: 1, palette: { A: "#ff0000" }, frames: [["A"]] };
  await writeFile(path.join(root, "sign.json"), toJson(sign));
  return Store.open(root);
}

/** A port nothing has: listen on 0, note it, let it go. */
async function freePort(store: Store): Promise<number> {
  const probe = await listenMcp(store, 0);
  const port = (probe.server!.address() as AddressInfo).port;
  closeMcp(probe.server!);
  await new Promise((r) => setTimeout(r, 50));
  return port;
}

beforeEach(() => {
  roots.length = 0;
  servers.length = 0;
});
afterEach(async () => {
  for (const s of servers) closeMcp(s);
  for (const r of roots) await rm(r, { recursive: true, force: true });
});

test("the first project has the port: MCP at /mcp, and /status says which folder", async () => {
  const store = await folder();
  const port = await freePort(store);
  const got = await listenMcp(store, port);
  servers.push(got.server!);
  expect(got).toMatchObject({ url: `http://localhost:${port}/mcp` });

  const status = (await (await fetch(`http://127.0.0.1:${port}/status`)).json()) as object;
  expect(status).toEqual({ dab: true, root: store.root });

  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  const listed = await client.callTool({ name: "list_sprites", arguments: {} });
  expect(JSON.stringify(listed.content)).toContain("sign.json");
  await client.close();
});

test("a second project leaves the port to the first, and is told whose it is", async () => {
  const first = await folder();
  const second = await folder();
  const port = await freePort(first);
  const got = await listenMcp(first, port);
  servers.push(got.server!);
  expect(await listenMcp(second, port)).toEqual({ server: null, holder: first.root });
});

test("the same project restarting waits for its old self to let go", async () => {
  const store = await folder();
  const port = await freePort(store);
  const old = await listenMcp(store, port);
  // Vite restarts: the old server closes a moment after the new one asks.
  setTimeout(() => closeMcp(old.server!), 300);
  const again = await listenMcp(store, port);
  expect(again.server).not.toBeNull();
  servers.push(again.server!);
});

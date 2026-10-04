import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { toJson } from "dab-core";
import { afterEach, beforeEach, expect, test } from "vitest";

import { mcpHttp } from "../src/mcphttp";
import { Store } from "../src/store";

let root: string;
let server: Server;
let url: URL;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dab-mcphttp-"));
  const sign = { name: "sign", w: 2, h: 1, palette: { A: "#ff0000" }, frames: [["A."]] };
  await writeFile(path.join(root, "sign.json"), toJson(sign));
  server = createServer(mcpHttp(await Store.open(root)));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
});

test("the tools answer over HTTP, and write through the same store", async () => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(url));
  const names = (await client.listTools()).tools.map((t) => t.name);
  expect(names).toContain("set_pixels");

  const text = (r: Awaited<ReturnType<Client["callTool"]>>) =>
    (r.content as { type: string; text?: string }[]).map((c) => c.text ?? "").join("\n");
  const read = text(await client.callTool({ name: "read_sprite", arguments: { file: "sign" } }));
  const version = /version ([0-9a-f]{12})/.exec(read)![1];
  await client.callTool({
    name: "set_pixels",
    arguments: { file: "sign", version, frame: 0, pixels: [[1, 0, "A"]] },
  });
  expect(await readFile(path.join(root, "sign.json"), "utf8")).toContain('"AA"');
  await client.close();
});

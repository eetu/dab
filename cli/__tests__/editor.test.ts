import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, expect, test } from "vitest";

import { serveEditor } from "../src/editor";

let server: Server;
let base: string;

beforeAll(async () => {
  // The editor in a folder of its own, beside a file it must not hand out.
  const top = await mkdtemp(path.join(tmpdir(), "dab-editor-"));
  const dir = path.join(top, "editor");
  await mkdir(path.join(dir, "assets"), { recursive: true });
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>dab</title>");
  await writeFile(path.join(dir, "assets", "app.js"), "export {};");
  await writeFile(path.join(top, "secret.txt"), "not yours");
  server = createServer(serveEditor(dir));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise((done) => server.close(done)));

test("serves the built editor's files with their types", async () => {
  const js = await fetch(`${base}/assets/app.js`);
  expect(js.headers.get("content-type")).toBe("text/javascript");
  expect(await js.text()).toBe("export {};");
  const page = await fetch(`${base}/`);
  expect(page.headers.get("content-type")).toContain("text/html");
});

test("a path that is not a file is the app's to route: index.html", async () => {
  const deep = await fetch(`${base}/some/route`);
  expect(await deep.text()).toContain("<title>dab</title>");
});

test("nothing outside the editor's folder is reachable", async () => {
  const out = await fetch(`${base}/..%2Fsecret.txt`);
  expect(out.status).toBe(403);
});

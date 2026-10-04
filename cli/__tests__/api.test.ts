import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import { type SpriteFile, toJson } from "dab-core";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { filesApi } from "../src/api";
import { Store, versionOf } from "../src/store";

let root: string;
let server: Server;
let base: string;

const sign = (row: string): SpriteFile => ({
  name: "sign",
  w: 2,
  h: 1,
  palette: { A: "#ff0000", B: "#0000ff" },
  frames: [[row]],
});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dab-api-"));
  await writeFile(path.join(root, "sign.json"), toJson(sign("AB")));
  await writeFile(path.join(root, "broken.json"), "{}");
  await mkdir(path.join(root, "deeper"));
  await writeFile(path.join(root, "deeper", "x.json"), toJson({ ...sign("AA"), name: "x" }));
  server = createServer(filesApi(await Store.open(root)));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  // A change feed holds its connection open; close it with the server.
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await rm(root, { recursive: true, force: true });
});

const put = (file: string, sprite: SpriteFile, headers: Record<string, string>) =>
  fetch(`${base}/files/${file}`, { method: "PUT", body: toJson(sprite), headers });

describe("the files API", () => {
  test("lists the folder itself, each sprite with its version, and what did not load", async () => {
    const res = await fetch(`${base}/files`);
    const body = await res.json();
    expect(body.entries.map((e: { file: string }) => e.file)).toEqual(["sign.json"]);
    expect(body.entries[0].version).toBe(versionOf(toJson(sign("AB"))));
    expect(body.root).toBe(await realpath(root));
    expect(body.problems[0].file).toBe("broken.json");
    expect(body.problems[0].errors.length).toBeGreaterThan(0);
  });

  test("a write quoting the version on disk lands; a stale one is 412 with the version now", async () => {
    const v = (await (await fetch(`${base}/files/sign.json`)).headers.get("etag"))!;
    const ok = await put("sign.json", sign("BB"), { "if-match": v });
    expect(ok.status).toBe(200);
    const { version } = await ok.json();
    expect(await readFile(path.join(root, "sign.json"), "utf8")).toBe(toJson(sign("BB")));

    const stale = await put("sign.json", sign("AA"), { "if-match": v });
    expect(stale.status).toBe(412);
    expect((await stale.json()).version).toBe(version);
    expect(await readFile(path.join(root, "sign.json"), "utf8")).toBe(toJson(sign("BB")));
  });

  test("a new file says so, and does not land on one that exists", async () => {
    const made = await put("new.json", { ...sign("AB"), name: "new" }, { "if-none-match": "*" });
    expect(made.status).toBe(200);
    const again = await put("new.json", { ...sign("BB"), name: "new" }, { "if-none-match": "*" });
    expect(again.status).toBe(412);
    expect((await put("sign.json", sign("BB"), {})).status).toBe(400);
  });

  test("refuses invalid sprites, paths out of the folder, and deletes of a changed file", async () => {
    const v = versionOf(toJson(sign("AB")));
    const bad = await put("sign.json", { ...sign("AB"), frames: [["AZ"]] }, { "if-match": v });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error).toContain("Z");
    expect((await put("..%2Fout.json", sign("AB"), { "if-none-match": "*" })).status).toBe(403);

    const stale = await fetch(`${base}/files/sign.json`, {
      method: "DELETE",
      headers: { "if-match": "000000000000" },
    });
    expect(stale.status).toBe(412);
    const gone = await fetch(`${base}/files/sign.json`, {
      method: "DELETE",
      headers: { "if-match": v },
    });
    expect(gone.status).toBe(204);
    expect((await fetch(`${base}/files/sign.json`)).status).toBe(404);
  });

  test("answers only a request addressed to this machine", async () => {
    const status = await new Promise<number>((done) => {
      const port = (server.address() as AddressInfo).port;
      request(
        { host: "127.0.0.1", port, path: "/files", headers: { host: "evil.example" } },
        (r) => {
          r.resume();
          done(r.statusCode!);
        },
      ).end();
    });
    expect(status).toBe(403);
  });

  test("announces each change to a sprite, with its version — whoever wrote it", async () => {
    const quit = new AbortController();
    const res = await fetch(`${base}/events`, { signal: quit.signal });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let heard = "";
    /** Read the feed until `want` has been said. */
    const until = async (want: string) => {
      while (!heard.includes(want)) heard += (await reader.read()).value ?? "";
    };
    await until(": dab");

    // Someone else — the model, another editor — writes the file.
    const theirs = toJson(sign("BB"));
    await writeFile(path.join(root, "sign.json"), theirs);
    await until(versionOf(theirs));
    expect(heard).toContain(`"file":"sign.json","version":"${versionOf(theirs)}"`);

    // A write through the API is announced the same way, and a removal as null.
    const ours = toJson(sign("AA"));
    await put("sign.json", sign("AA"), { "if-match": versionOf(theirs) });
    await until(versionOf(ours));
    await fetch(`${base}/files/sign.json`, {
      method: "DELETE",
      headers: { "if-match": versionOf(ours) },
    });
    await until('"version":null');
    quit.abort();
  });
});

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

import app from "./app";

describe("security headers", () => {
  let server: Server;
  let base: string;

  before(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        base = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  test("GET /healthz emits Helmet security headers", async () => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.ok(res.headers.get("content-security-policy"));
    assert.ok(res.headers.get("strict-transport-security"));
  });
});

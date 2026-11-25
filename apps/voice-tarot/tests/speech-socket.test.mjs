import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import { attachSpeechSocket } from "../server/speech-socket.ts";

test("speech socket uses configured Typecast, rejects other origins and disables preview overrides", async (t) => {
  const config = { TYPECAST_API_KEY: "test-key", TYPECAST_VOICE_ID: "tc_test" };
  const previous = Object.fromEntries(Object.keys(config).map((name) => [name, process.env[name]]));
  Object.assign(process.env, config);
  t.after(() => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const server = createServer();
  attachSpeechSocket(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const host = `127.0.0.1:${server.address().port}`;
  const origin = `http://${host}`;
  const client = new WebSocket(`ws://${host}/speech`, { origin });
  t.after(() => {
    client.terminate();
    return new Promise((resolve) => server.close(resolve));
  });
  const [message] = await once(client, "message");
  assert.deepEqual(JSON.parse(message), { type: "ready", sampleRate: 32000 });
  client.close();
  await once(client, "close");

  for (const [path, requestOrigin] of [
    ["/speech", "https://foreign.example"],
    ["/speech?settings=%7B%7D", origin],
  ]) {
    const rejected = new WebSocket(`ws://${host}${path}`, { origin: requestOrigin });
    rejected.on("error", () => {});
    const [, response] = await once(rejected, "unexpected-response");
    assert.equal(response.statusCode, 403);
    response.resume();
    rejected.terminate();
  }
});

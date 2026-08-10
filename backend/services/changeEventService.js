import { randomUUID } from "node:crypto";

const clients = new Set();
let changeVersion = Date.now();

export function publishDataChange({ actor, method, path }) {
  changeVersion += 1;
  const event = {
    id: randomUUID(),
    actor: actor ? { id: actor.id, role: actor.role } : null,
    method,
    path,
    occurredAt: new Date().toISOString(),
    version: changeVersion,
  };

  const publicEvent = {
    id: event.id,
    occurredAt: event.occurredAt,
    version: event.version,
  };
  const message = `id: ${event.id}\nevent: data-change\ndata: ${JSON.stringify(publicEvent)}\n\n`;
  for (const client of clients) client.write(message);
}

export function streamDataChanges(req, res) {
  res.status(200);
  res.set({
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true, version: changeVersion })}\n\n`);

  clients.add(res);
  const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
  });
}

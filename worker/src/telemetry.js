export const logger = {
  info(msg, fields = {}) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), level: "info", msg, ...fields }));
  },
  warn(msg, fields = {}) {
    console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", msg, ...fields }));
  },
  error(msg, fields = {}) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), level: "error", msg, ...fields }));
  },
};

export async function withSpan(name, attrs, fn) {
  const start = Date.now();
  const data = { ...attrs };
  const events = [];
  let status = "ok";
  const span = {
    setAttribute(key, value) {
      data[key] = value;
    },
    setAttributes(obj) {
      Object.assign(data, obj);
    },
    addEvent(eventName, eventAttrs = {}) {
      events.push({ name: eventName, at_ms: Date.now() - start, ...eventAttrs });
    },
    setStatus(next) {
      status = next;
    },
    recordException(err) {
      status = "error";
      data.error_type = err?.name || "Error";
      data.error_message = String(err?.message || err).slice(0, 300);
    },
  };
  try {
    return await fn(span);
  } catch (err) {
    span.recordException(err);
    throw err;
  } finally {
    const payload = {
      ts: new Date().toISOString(),
      type: "span",
      span: name,
      status,
      duration_ms: Date.now() - start,
      ...data,
    };
    if (events.length) payload.events = events;
    console.log(JSON.stringify(payload));
  }
}

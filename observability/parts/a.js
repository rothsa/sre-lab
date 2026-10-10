// Chapters 1-4: signals, OpenTelemetry Collector, Prometheus scraping and storage, PromQL.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`: ../../drawn/README.md).
export const CHAPTERS = [
  {
    id: "three-signals",
    n: 1,
    title: "Metrics, logs and traces: what each is for",
    question: "Metrics, logs and traces all describe the same requests. What does each one cost, what questions does it answer, and how do you jump from one to the other during an incident?",
    view: [920, 480],
    nodes: [
      { id: "app", label: "Service", sub: "handles a request", kind: "pod", x: 380, y: 20, w: 160, h: 50 },
      { id: "metrics", label: "Metrics", sub: "counters, histograms", x: 90, y: 140, w: 170, h: 50 },
      { id: "traces", label: "Traces", sub: "spans per request", x: 375, y: 140, w: 170, h: 50 },
      { id: "logs", label: "Logs", sub: "one record per event", x: 660, y: 140, w: 170, h: 50 },
      { id: "mstore", label: "Metrics TSDB", sub: "Prometheus, Mimir", kind: "store", x: 90, y: 270, w: 170, h: 56 },
      { id: "tstore", label: "Trace store", sub: "Tempo, Jaeger", kind: "store", x: 375, y: 270, w: 170, h: 56 },
      { id: "lstore", label: "Log store", sub: "Loki, Elasticsearch", kind: "store", x: 660, y: 270, w: 170, h: 56 },
      { id: "grafana", label: "Grafana", sub: "query + correlate", kind: "actor", x: 380, y: 410, w: 160, h: 50 },
      { id: "newsig", label: "Newer signals", sub: "profiles, events:\nstill in development", kind: "note", x: 700, y: 400, w: 200, h: 60 },
    ],
    edges: [
      { id: "e-m", from: "app", to: "metrics", label: "observes" },
      { id: "e-t", from: "app", to: "traces", label: "starts spans", labelAt: [512, 108] },
      { id: "e-l", from: "app", to: "logs", label: "writes lines" },
      { id: "e-ms", from: "metrics", to: "mstore", label: "stored" },
      { id: "e-ts", from: "traces", to: "tstore", label: "sampled" },
      { id: "e-ls", from: "logs", to: "lstore", label: "shipped" },
      { id: "e-ex", from: "mstore", to: "tstore", label: "exemplar" },
      { id: "e-tid", from: "lstore", to: "tstore", label: "trace_id" },
      { id: "e-qm", from: "grafana", to: "mstore", label: "PromQL" },
      { id: "e-qt", from: "grafana", to: "tstore", label: "TraceQL" },
      { id: "e-ql", from: "grafana", to: "lstore", label: "LogQL" },
    ],
    steps: [
      { text: "One service, three kinds of telemetry, three stores, one UI. Each signal trades detail for cost differently. Press Next to follow a request through all three, then use them together." },
      { text: "A request arrives. While handling it, the service bumps a counter, records its latency in a histogram, opens a span, and may write a log line. Same request, three very different records.", on: ["app"] },
      { text: "Metrics aggregate in the process: the counter just goes up by one and the histogram bucket count goes up by one. Storage cost depends on the number of series (each unique label combination), not on how many requests you serve.", on: ["app", "metrics", "mstore"], flow: ["e-m", "e-ms"] },
      { text: "That makes metrics cheap to keep and fast to query over long ranges, so they drive dashboards and alerts. The price: no single request survives aggregation, and unbounded label values such as user IDs explode the series count.", on: ["mstore", "grafana"], flow: ["e-qm"] },
      { text: "Logs keep one record per event, so their cost grows with traffic and verbosity. Loki indexes only stream labels and keeps the compressed lines in object storage; the text itself is filtered at query time.", on: ["app", "logs", "lstore"], flow: ["e-l", "e-ls"] },
      { text: "Traces record the request's path as spans that share one trace ID, propagated across service calls. They answer where the time went in one request. Volume is per span, so busy systems sample.", on: ["app", "traces", "tstore"], flow: ["e-t", "e-ts"] },
      { text: "Logs to traces: an OpenTelemetry log record has `TraceId` and `SpanId` fields, filled automatically from the active span. In Grafana, a derived field pulls the `traceID` out of a Loki line and links to the trace.", on: ["lstore", "tstore"], flow: ["e-tid"] },
      { text: "Metrics to traces: an exemplar attaches the trace ID of one representative request to a metric sample. Grafana draws exemplars as stars on a Prometheus graph; clicking one opens that trace.", on: ["mstore", "tstore"], flow: ["e-ex"] },
      { text: "The incident loop: an alert fires on a metric, an exemplar on the latency spike opens a slow trace, and the trace ID finds that request's log lines. Metrics say something is wrong, traces say where, logs say why.", on: ["grafana", "mstore", "tstore", "lstore"], flow: ["e-qm", "e-ex", "e-tid"] },
      { text: "OpenTelemetry supports traces, metrics and logs, plus baggage for context. Profiles (resource use at code level) and events (a kind of log) are still in development, so treat them as emerging.", on: ["newsig"] },
    ],
    say30: "Metrics are numbers aggregated in the process, so they cost per series rather than per request. They are cheap to keep for months and ideal for dashboards and alerts, but they lose individual requests. Logs keep every event, so cost grows with traffic, and they answer why one thing happened. Traces follow one request across services as spans sharing a trace ID, and show where the time went; at volume you sample them. The power is in linking them: exemplars put a trace ID on a metric sample, and logs carry the trace and span IDs. So an alert on a latency metric jumps to a slow trace and then to that request's logs.",
    gotchas: [
      "Metric cost is driven by cardinality, not traffic. A label holding user IDs or email addresses creates a new series per value; put that detail in logs or span attributes instead.",
      "Logs and traces are only linked if the trace context is actually there: an uninstrumented hop or a logger not wired to the SDK breaks the chain.",
      "Exemplars point to one representative trace, not all of them. If that trace was dropped by sampling, the link leads nowhere.",
      "Loki is not a full-text index. Queries narrowed only by text, not by labels, scan a lot of chunks.",
    ],
    atScale: [
      "Telemetry grows faster than traffic: each new service adds spans to every request it touches and its own log lines, so cost scales with traffic times call depth. Teams set a budget per signal and per team.",
      "Logs dominate the bill at thousands of requests per second. Per-request debug or access logs get dropped or sampled in the Collector pipeline, and counts that are only ever graphed become metrics.",
      "OpenTelemetry suggests trace sampling is worth considering from roughly 1,000 traces per second. Head sampling caps volume cheaply; tail sampling keeps errors and slow traces but needs its own stateful tier.",
      "One label with unbounded values (user, request or session ID) multiplies series count and can take down the metrics backend. Cardinality limits and pre-ingest relabeling are standard guardrails.",
      "Pick the signal per question: how many and how fast (metrics, long retention), what happened to this request (traces, sampled), exactly why (logs, short retention). Keeping everything everywhere is what makes the bill explode.",
    ],
    agentic: [
      "Assistants now turn plain questions into queries: Grafana Assistant handles querying and dashboards in conversation, New Relic AI helps build NRQL, and Honeycomb's Canvas works from your schema plus sample telemetry values (none of these pages states a preview or GA label). Choosing the right signal for the question is still your call, so read the generated PromQL, LogQL or NRQL before trusting the chart: a plausible query on the wrong signal or label is the new silent error.",
      "LLM calls and agent runs are now a workload you observe with the same three signals. OpenTelemetry's GenAI conventions (Development status, not stable) define token-usage counters, duration histograms, and spans per model call and per tool call; prompt and response content on those spans is Opt-In because it likely holds user data, so treat it like request bodies, never like metric labels.",
      "Investigation agents walk the same loop of metric, exemplar, trace and logs, so the `TraceId` on your log records and exemplars on your histograms decide how far they get. Mid-incident they gather evidence read-only and a human decides; ask for the exact queries and links behind a conclusion, or treat it as a hypothesis (see Agentic Engineering, Drawn).",
    ],
    quiz: [
      { q: "Why is a request rate metric cheap at 100,000 requests per second while access logs are not?", a: "The counter is aggregated in the process: one series per label combination, sampled at each scrape, however many requests arrive. Access logs write one record per request, so cost grows with traffic." },
      { q: "What is an exemplar?", a: "A trace ID (and labels) attached to a single metric sample, pointing at one representative request. Grafana shows it as a star on a Prometheus graph that links to the trace." },
      { q: "How does a log line get linked to a trace?", a: "The OpenTelemetry log record carries `TraceId` and `SpanId`, filled from the active span when the SDK or auto-instrumentation is in place. The log UI then extracts the trace ID and links to the trace store." },
    ],
    incidents: [],
    sources: [
      { title: "OpenTelemetry: Signals", url: "https://opentelemetry.io/docs/concepts/signals/" },
      { title: "OpenTelemetry: Logs", url: "https://opentelemetry.io/docs/concepts/signals/logs/" },
      { title: "OpenTelemetry: Metrics", url: "https://opentelemetry.io/docs/concepts/signals/metrics/" },
      { title: "OpenTelemetry: Sampling", url: "https://opentelemetry.io/docs/concepts/sampling/" },
      { title: "Prometheus: Metric and label naming", url: "https://prometheus.io/docs/practices/naming/" },
      { title: "Grafana: Introduction to exemplars", url: "https://grafana.com/docs/grafana/latest/fundamentals/exemplars/" },
      { title: "Grafana Loki overview", url: "https://grafana.com/docs/loki/latest/get-started/overview/" },
      { title: "OpenTelemetry GenAI semantic conventions (Development)", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/README.md" },
      { title: "OpenTelemetry GenAI spans", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md" },
      { title: "Grafana Assistant overview", url: "https://grafana.com/docs/grafana-cloud/machine-learning/assistant/" },
      { title: "New Relic AI", url: "https://docs.newrelic.com/docs/agentic-ai/new-relic-ai/" },
      { title: "Honeycomb: AI policies (Honeycomb Intelligence)", url: "https://docs.honeycomb.io/security-compliance/honeycomb-intelligence" },
    ],
  },

  {
    id: "otel-collector",
    n: 2,
    title: "OpenTelemetry: SDK to Collector to backend",
    question: "Walk me through how a span gets from application code to a tracing backend with OpenTelemetry. What does the Collector do, and where do you lose data?",
    view: [940, 600],
    groups: [
      { id: "g-node", label: "Node (agent)", x: 10, y: 20, w: 310, h: 110 },
      { id: "g-gw", label: "Gateway Collector: traces pipeline", x: 10, y: 170, w: 920, h: 230 },
      { id: "g-t2", label: "Tier 2: tail sampling", x: 540, y: 425, w: 170, h: 165 },
    ],
    nodes: [
      { id: "app", label: "Service", sub: "OTel SDK + API", kind: "pod", x: 25, y: 55, w: 130, h: 56 },
      { id: "agent", label: "Agent Collector", sub: "DaemonSet", x: 180, y: 55, w: 125, h: 56 },
      { id: "recv", label: "otlp receiver", sub: ":4317 gRPC :4318 HTTP", x: 25, y: 215, w: 150, h: 56 },
      { id: "mem", label: "memory_limiter", sub: "refuse when full", x: 205, y: 215, w: 140, h: 56 },
      { id: "k8s", label: "k8sattributes", sub: "add pod, namespace", x: 375, y: 215, w: 140, h: 56 },
      { id: "attr", label: "attributes", sub: "redact, rename", x: 545, y: 215, w: 130, h: 56 },
      { id: "batch", label: "batch", sub: "group for export", x: 705, y: 215, w: 120, h: 56 },
      { id: "expo", label: "otlp exporter", sub: "copy to 2nd backend", x: 500, y: 330, w: 150, h: 56 },
      { id: "explb", label: "loadbalancing", sub: "routing_key traceID", x: 690, y: 330, w: 150, h: 56 },
      { id: "s1", label: "Collector A", sub: "tail_sampling", x: 560, y: 440, w: 130, h: 56 },
      { id: "s2", label: "Collector B", sub: "tail_sampling", x: 560, y: 520, w: 130, h: 56 },
      { id: "tback", label: "Trace backend", sub: "sampled traces", kind: "store", x: 780, y: 480, w: 140, h: 56 },
      { id: "vback", label: "Vendor backend", sub: "full copy", kind: "store", x: 300, y: 480, w: 140, h: 56 },
    ],
    edges: [
      { id: "e-sdk", from: "app", to: "agent" },
      { id: "e-ag", from: "agent", to: "recv", label: "OTLP" },
      { id: "e-p1", from: "recv", to: "mem" },
      { id: "e-p2", from: "mem", to: "k8s" },
      { id: "e-p3", from: "k8s", to: "attr" },
      { id: "e-p4", from: "attr", to: "batch" },
      { id: "e-refuse", from: "mem", to: "recv", label: "error: retry", via: [[275, 300], [100, 300]], dashed: true },
      { id: "e-fo1", from: "batch", to: "expo", label: "fan-out" },
      { id: "e-fo2", from: "batch", to: "explb" },
      { id: "e-v", from: "expo", to: "vback", label: "exports" },
      { id: "e-lb1", from: "explb", to: "s1", label: "trace X spans" , labelPos: 0.45 },
      { id: "e-lb2", from: "explb", to: "s2", via: [[730, 548]], label: "trace Y", labelAt: [747, 525] },
      { id: "e-s1", from: "s1", to: "tback", label: "keeps" },
      { id: "e-s2", from: "s2", to: "tback" },
    ],
    steps: [
      { text: "The full path of a span: SDK, agent Collector on the node, gateway Collector pipeline, then a tail-sampling tier and backends. Press Next to follow one span." },
      { text: "Instrumentation. Zero-code (auto) instrumentation hooks libraries and frameworks without code changes; code-based instrumentation uses the API for your own spans and attributes. Both can run together. The SDK batches and exports over OTLP: gRPC on 4317, HTTP on 4318.", on: ["app"], flow: ["e-sdk"] },
      { text: "The agent Collector runs on every node, often as a DaemonSet. Apps send to a local address, so they stay simple. It can also tail log files with the `filelog` receiver, then forwards everything to the gateway.", on: ["app", "agent"], flow: ["e-sdk", "e-ag"] },
      { text: "The gateway is a standalone Collector service, typically one per cluster or region. A pipeline handles one signal type. Its receiver listens on a port; one receiver can feed several pipelines.", on: ["agent", "recv"], flow: ["e-ag"] },
      { text: "`memory_limiter` goes first. Above its soft limit it refuses data with a retryable error, which travels back through the receiver so the sender retries. Above the hard limit it also forces garbage collection.", on: ["recv", "mem"], flow: ["e-p1", "e-refuse"] },
      { text: "Processors run in the listed order. `k8sattributes` adds pod and namespace metadata. It must run before batching, because batching clears the request context it relies on.", on: ["mem", "k8s"], flow: ["e-p2"] },
      { text: "`attributes` (or `transform`) deletes, hashes or renames keys: drop personal data and high-cardinality attributes here, before anything is exported. Sampling and filtering processors would also sit early.", on: ["k8s", "attr"], flow: ["e-p3"] },
      { text: "`batch` groups data for efficient export and goes after filtering and enrichment. Newer setups prefer batching in the exporter's sending queue where available.", on: ["attr", "batch"], flow: ["e-p4"] },
      { text: "Fan-out: every exporter in the pipeline gets its own copy. Propagation is synchronous, so a blocked pipeline can stall a receiver it shares with other pipelines.", on: ["batch", "expo", "explb", "vback"], flow: ["e-fo1", "e-fo2", "e-v"] },
      { text: "The `loadbalancing` exporter hashes the trace ID, so every span of trace X lands on Collector A, even spans from different services and nodes. A `dns` or `k8s` resolver discovers the tier-2 pods.", on: ["explb", "s1", "s2"], flow: ["e-lb1", "e-lb2"] },
      { text: "`tail_sampling` holds spans in memory for `decision_wait` (default 30s), then applies policies: keep errors, keep slow traces, keep a small percentage of the rest. Only kept traces reach the backend.", on: ["s1", "s2", "tback"], flow: ["e-s1", "e-s2"] },
      { text: "Where data is lost: each exporter queues in memory and retries for up to 5 minutes by default. A Collector crash loses the in-memory queue, a full queue drops new data, and a longer backend outage expires old data. A `file_storage` persistent queue survives restarts.", on: ["expo", "explb", "tback", "vback"] },
    ],
    say30: "The app uses the OpenTelemetry API, either through auto-instrumentation or manual spans, and the SDK batches and exports OTLP. Usually it goes to an agent Collector on the node, then to a gateway Collector. A Collector pipeline is receivers, an ordered list of processors, and exporters. `memory_limiter` goes first so it can push back on senders, then enrichment like `k8sattributes`, then redaction and filtering, then `batch`. Every exporter gets a copy. For tail sampling, the gateway's `loadbalancing` exporter routes by trace ID so one Collector sees the whole trace. Data loss happens at the queues: in-memory exporter queues die with the process, full queues drop, and long outages exceed the retry window.",
    gotchas: [
      "Processor order is the order you list them. `memory_limiter` after `batch` cannot protect the batch buffer, and `k8sattributes` after `batch` loses the connection context it needs.",
      "Backpressure only works if the upstream retries. `memory_limiter` returns a retryable error; a sender that does not retry loses that data for good.",
      "Tail sampling needs all spans of a trace on one Collector. Plain round-robin load balancing in front of tail samplers silently produces partial traces and wrong decisions.",
      "OTLP delivery is guaranteed per hop only, and retries after reconnects can create duplicates.",
    ],
    atScale: [
      "The Collector becomes a fleet you operate: agents on every node, gateways per cluster or region, a sampling tier. Each needs its own dashboards; the loadbalancing exporter exposes `otelcol_loadbalancer_num_backends` and backend latency.",
      "Memory is the first limit. Under a burst, `memory_limiter` refuses data and senders back off; if the sender ignores the error or its own buffer fills, data is dropped at the edge. Size `limit_mib` below the container limit so the limiter acts before the OOM killer.",
      "Scaling the tail-sampling tier moves about R/N trace routes when a backend is added or removed, so traces in flight can be split across Collectors. Scale it deliberately, not on every CPU blip.",
      "Tail samplers hold every span for `decision_wait`. `num_traces` (default 50,000) is a circular buffer, so at high trace rates old traces are evicted before their decision; raise it with memory, or head-sample first.",
      "When the gateway falls over, everything behind it backs up: agent queues fill and start dropping. Run several gateway replicas behind a load balancer and use persistent queues where loss matters.",
      "Several gateways writing the same metric stream break the single-writer rule and cause out-of-order or duplicate samples in Prometheus-style backends. Add unique resource identity with `k8sattributes` or `resourcedetection`.",
    ],
    agentic: [
      "Agent and LLM telemetry rides the same SDK-to-Collector path. The GenAI conventions keep `gen_ai.input.messages`, `gen_ai.output.messages` and `gen_ai.tool.call.arguments` Opt-In because they can carry user data; if a team turns capture on, the gateway's `attributes` or `transform` processor is where you delete or hash them before any exporter ships a copy to a vendor.",
      "Each agent step can be a span: an `invoke_agent` span, one per model call and an `execute_tool` span per tool call, so one task sends a burst of spans through `memory_limiter` and the exporter queues. Some backends bill per LLM span (Datadog LLM Observability meters LLM spans ingested), so size both the pipeline and the budget for agent loops, not single requests.",
      "Agents draft Collector configs quickly, and a config that loads is not a correct one. Check processor order by hand (`memory_limiter` first, `k8sattributes` before `batch`) and that redaction exists in every pipeline that exports, because a misordered limiter fails only under load and a missing redaction shows up only in an audit.",
    ],
    quiz: [
      { q: "Why must `memory_limiter` be the first processor?", a: "So it can refuse data before anything downstream buffers it. The refusal is a retryable error that reaches the receiver, which pushes back on the sender instead of the Collector running out of memory." },
      { q: "You run three gateway Collectors behind a round-robin load balancer, each with `tail_sampling`. What goes wrong?", a: "Spans of one trace land on different Collectors, so each sees a partial trace and makes its own decision. Put a first tier with the `loadbalancing` exporter, `routing_key: traceID`, in front of the samplers." },
      { q: "Agent versus gateway: what does each buy you?", a: "An agent per node is simple and local: apps send to localhost and it adds host metadata. A gateway centralizes credentials, sampling and filtering policy, at the cost of another component that can fail, extra latency and resources." },
    ],
    code: [
      { lang: "yaml", label: "Gateway: traces pipeline", src: `receivers:
  otlp:
    protocols:
      grpc: { endpoint: 0.0.0.0:4317 }
      http: { endpoint: 0.0.0.0:4318 }
processors:
  memory_limiter:
    check_interval: 5s
    limit_mib: 4000
    spike_limit_mib: 500
  k8sattributes: {}
  attributes:
    actions:
      - { key: user.email, action: delete }
  batch: {}
exporters:
  otlp/vendor:
    endpoint: vendor.example.com:4317
  loadbalancing:
    routing_key: traceID
    protocol:
      otlp: { tls: { insecure: true } }
    resolver:
      dns: { hostname: samplers-headless }
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, k8sattributes,
                   attributes, batch]
      exporters: [otlp/vendor, loadbalancing]` },
      { lang: "yaml", label: "Tier 2: tail sampling", src: `processors:
  tail_sampling:
    decision_wait: 30s
    num_traces: 50000
    policies:
      - name: errors
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow
        type: latency
        latency: { threshold_ms: 500 }
      - name: baseline
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }` },
    ],
    codeNote: "A sketch, not a drop-in config: hostnames are placeholders and the thresholds are examples. The processor order in `service.pipelines` is the order data flows.",
    incidents: ["stackdriver-2013-cassandra-queue-coupling", "honeycomb-2019-ingest-memory-leak", "railway-2023-metrics-agent-cpu-softlock"],
    sources: [
      { title: "OpenTelemetry Collector: Architecture", url: "https://opentelemetry.io/docs/collector/architecture/" },
      { title: "OpenTelemetry Collector: Configuration", url: "https://opentelemetry.io/docs/collector/configuration/" },
      { title: "Collector deployment: Agent", url: "https://opentelemetry.io/docs/collector/deploy/agent/" },
      { title: "Collector deployment: Gateway", url: "https://opentelemetry.io/docs/collector/deploy/gateway/" },
      { title: "Collector resiliency", url: "https://opentelemetry.io/docs/collector/resiliency/" },
      { title: "OpenTelemetry: Instrumentation", url: "https://opentelemetry.io/docs/concepts/instrumentation/" },
      { title: "OTLP specification", url: "https://opentelemetry.io/docs/specs/otlp/" },
      { title: "Memory limiter processor README", url: "https://github.com/open-telemetry/opentelemetry-collector/blob/main/processor/memorylimiterprocessor/README.md" },
      { title: "Recommended processors", url: "https://github.com/open-telemetry/opentelemetry-collector/blob/main/processor/README.md" },
      { title: "Load-balancing exporter README", url: "https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/loadbalancingexporter/README.md" },
      { title: "Tail sampling processor README", url: "https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/tailsamplingprocessor/README.md" },
      { title: "OpenTelemetry GenAI spans", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md" },
      { title: "OpenTelemetry GenAI agent spans", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md" },
      { title: "Datadog LLM Observability", url: "https://docs.datadoghq.com/llm_observability/" },
    ],
  },

  {
    id: "prometheus-scrape",
    n: 3,
    title: "Prometheus: discovery, scrape and storage",
    question: "How does Prometheus find what to scrape in Kubernetes, what happens on each scrape, and where do the samples live afterwards?",
    view: [960, 500],
    groups: [
      { id: "g-prom", label: "Prometheus server", x: 170, y: 30, w: 600, h: 340 },
    ],
    nodes: [
      { id: "kapi", label: "Kubernetes API", sub: "pods, slices", x: 10, y: 70, w: 130, h: 56 },
      { id: "sd", label: "Discovery", sub: "kubernetes_sd_configs", x: 185, y: 70, w: 150, h: 56 },
      { id: "relabel", label: "Relabel", sub: "relabel_configs", x: 395, y: 70, w: 140, h: 56 },
      { id: "scrape", label: "Scrape loop", sub: "per target", x: 600, y: 70, w: 150, h: 56 },
      { id: "apppod", label: "App pod", sub: "GET /metrics", kind: "pod", x: 810, y: 40, w: 140, h: 56 },
      { id: "slow", label: "Slow exporter", sub: "exceeds timeout", kind: "pod", x: 810, y: 140, w: 140, h: 56 },
      { id: "blocks", label: "Blocks", sub: "2h, compacted", kind: "store", x: 185, y: 190, w: 150, h: 56 },
      { id: "head", label: "Head block", sub: "in memory", x: 395, y: 190, w: 150, h: 56 },
      { id: "wal", label: "WAL", sub: "128MB segments", kind: "store", x: 600, y: 190, w: 150, h: 56 },
      { id: "rwq", label: "remote_write", sub: "shards read WAL", x: 600, y: 290, w: 150, h: 56 },
      { id: "lts", label: "Long-term store", sub: "Mimir, Thanos", kind: "store", x: 600, y: 420, w: 150, h: 56 },
      { id: "global", label: "Global Prometheus", sub: "aggregates only", x: 185, y: 420, w: 160, h: 56 },
    ],
    edges: [
      { id: "e-watch", from: "sd", to: "kapi", label: "watches", labelAt: [165, 62] },
      { id: "e-cand", from: "sd", to: "relabel", label: "targets", labelAt: [365, 62] },
      { id: "e-keep", from: "relabel", to: "scrape", label: "kept", labelAt: [568, 62] },
      { id: "e-s1", from: "scrape", to: "apppod", label: "pulls", labelPos: 0.5 },
      { id: "e-s2", from: "scrape", to: "slow" },
      { id: "e-ingest", from: "scrape", to: "head", label: "appends" },
      { id: "e-wal", from: "head", to: "wal", label: "log, replay", labelAt: [572, 182], bidir: true },
      { id: "e-cut", from: "head", to: "blocks", label: "persists", labelAt: [365, 182] },
      { id: "e-rw", from: "wal", to: "rwq", label: "reads", labelPos: 0.5 },
      { id: "e-post", from: "rwq", to: "lts", label: "HTTP POST" },
      { id: "e-fed", from: "global", to: "head", label: "GET /federate" },
    ],
    steps: [
      { text: "One Prometheus server: discovery and relabeling decide what to scrape, the scrape loop pulls, and the TSDB stores. Remote write and federation move data out. Press Next to follow one scrape." },
      { text: "`kubernetes_sd_configs` watches the Kubernetes API. With `role: pod` each declared container port (or a port-less container) becomes a candidate target; `endpoints`, `endpointslice`, `service`, `node` and `ingress` are the other roles. Each candidate carries `__address__` and `__meta_kubernetes_*` labels.", on: ["kapi", "sd"], flow: ["e-watch"] },
      { text: "`relabel_configs` runs on targets before any scrape: `keep` only opted-in pods, copy namespace and pod name into real labels, rewrite `__address__` or `__metrics_path__`. Labels starting with `__` are then removed, and `instance` defaults to the address.", on: ["sd", "relabel"], flow: ["e-cand"] },
      { text: "The scrape loop pulls each target's `/metrics` every `scrape_interval` (global default 1m, usually set lower). `job` and `instance` labels are attached to every series.", on: ["relabel", "scrape", "apppod"], flow: ["e-keep", "e-s1"] },
      { text: "For every scrape Prometheus also writes `up` (1 if it succeeded, 0 if not), `scrape_duration_seconds` and `scrape_samples_scraped`. An exporter slower than `scrape_timeout` (default 10s, never above the interval) fails the whole scrape: `up` is 0 and no samples land.", on: ["scrape", "slow"], flow: ["e-s2"] },
      { text: "`metric_relabel_configs` runs on the scraped samples as the last step, for example to drop expensive series. Then samples are appended to the in-memory head block. If `sample_limit` is exceeded, the entire scrape fails.", on: ["scrape", "head"], flow: ["e-ingest"] },
      { text: "Every append is also written to the write-ahead log in 128MB segments. After a crash or restart, Prometheus replays the WAL to rebuild the head.", on: ["head", "wal"], flow: ["e-wal"] },
      { text: "Head data is cut into two-hour blocks on disk, which are compacted into larger blocks in the background. Retention defaults to 15 days unless `--storage.tsdb.retention.time` or `.size` says otherwise. Local storage is not replicated.", on: ["head", "blocks"], flow: ["e-cut"] },
      { text: "`remote_write` tails the WAL. Shards batch samples and POST them to long-term storage such as Mimir or Thanos, retrying with backoff. If the endpoint is down for more than about two hours, the WAL is compacted away and unsent samples are lost.", on: ["wal", "rwq", "lts"], flow: ["e-rw", "e-post"] },
      { text: "Federation is the pull alternative: a global Prometheus scrapes `/federate` with `match[]` selectors for current values, usually only aggregated recording-rule series, and sets `honor_labels: true` to keep the source labels.", on: ["global", "head"], flow: ["e-fed"] },
    ],
    say30: "Prometheus discovers targets, for example with `kubernetes_sd_configs` watching pods or EndpointSlices. `relabel_configs` filters and rewrites those targets using the `__meta_` labels. Then it pulls `/metrics` from each target every scrape interval, attaching `job` and `instance` and recording `up`, which is 0 when a scrape fails or times out. Samples go into an in-memory head block, protected by a write-ahead log, and every two hours become an immutable block on local disk with 15 days' retention by default. Local storage isn't replicated, so for long retention and a global view you `remote_write` to something like Mimir or Thanos. It reads from the WAL, so it survives short outages, about two hours.",
    gotchas: [
      "`relabel_configs` acts on targets before the scrape; `metric_relabel_configs` acts on samples after it. Dropping a noisy metric in `relabel_configs` does nothing.",
      "`up == 0` only tells you Prometheus could not scrape. A target missing from discovery has no `up` series at all; alert with `absent()` for things that must exist.",
      "A timeout or `sample_limit` breach drops the whole scrape, not just the slow part, so one heavy exporter leaves gaps in every series it serves.",
      "A Prometheus server is a single node with non-replicated local storage. HA means running two identical servers and deduplicating downstream.",
    ],
    atScale: [
      "One Prometheus has finite memory for the head block, so large estates run one server (often an HA pair) per cluster, or shard targets across servers with a `hashmod` relabel rule. Global queries then need a layer on top.",
      "Federation pulls current values from `/federate` on each scrape and suits aggregated series. Remote write streams every sample from the WAL and is how most long-term stores (Mimir, Thanos receive, vendors) ingest at scale.",
      "Remote write falling behind is the classic symptom of a slow backend: a full shard queue stops WAL reads for all shards. Watch `prometheus_remote_storage_samples_pending` and tune `max_shards`, `capacity` and `max_samples_per_send` (defaults 50, 10000 and 2000).",
      "Slow exporters, often custom ones that query a database on every scrape, hit `scrape_timeout` and turn into `up == 0` gaps. Cache the expensive work in the exporter and serve the last result.",
      "Restarting a busy Prometheus means replaying the WAL, which holds at least the last two hours of samples on busy servers, before the head is back. Large servers take a noticeable time to come back; HA pairs and staggered restarts hide the gap.",
      "Capacity is roughly retention seconds times samples per second times 1-2 bytes per sample. Sample rate is targets times series per target divided by the interval, so halving the interval doubles disk.",
    ],
    agentic: [
      "Agents now read metrics through assistants and MCP servers (Grafana Assistant, for one, queries your data sources under your own permissions), so `job`, `instance` and your metric names become an API that agents consume. Absence is the trap: a target dropped by `relabel_configs` has no `up` series at all, and an agent that finds no data can call the service healthy, so ask which series it actually checked.",
      "LLM workloads add new series: OTel GenAI token counters and duration histograms (Development status, names may still change) reach Prometheus or Mimir through the Collector, so `sample_limit` and `metric_relabel_configs` apply to them like any exporter. The spec asks for `error.type` to be the provider's error code or another low-cardinality identifier; keep `gen_ai.request.model` bounded too, and never put prompt text or conversation IDs in labels.",
      "Ask an agent to size a server or a `remote_write` queue and it will give confident numbers; check them against this chapter's arithmetic (targets times series per target divided by the interval, 1-2 bytes per sample) and against `prometheus_remote_storage_samples_pending`. A model's idea of defaults can be stale, and the fundamentals still decide capacity.",
    ],
    quiz: [
      { q: "A pod is up and serving `/metrics`, but there is no series for it in Prometheus, not even `up`. Where do you look?", a: "Discovery and relabeling. The target was never discovered or a `keep`/`drop` rule in `relabel_configs` removed it. The targets page and service discovery page in the Prometheus UI show discovered labels before and after relabeling." },
      { q: "What does remote write read from, and what happens if the endpoint is down for six hours?", a: "It tails the WAL. Requests are retried without loss for up to about two hours; after that the WAL has been compacted and the unsent samples are lost." },
      { q: "When would you use federation instead of remote write?", a: "To pull a small set of already-aggregated series (for example recording-rule outputs) from many Prometheus servers into a global one. For full-resolution, long-term storage of everything, use remote write." },
    ],
    code: [
      { lang: "yaml", label: "prometheus.yml", src: `global:
  scrape_interval: 30s
  scrape_timeout: 10s
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: "debug_.*"
        action: drop
    sample_limit: 50000
remote_write:
  - url: https://metrics.example.internal/api/v1/push
    queue_config:
      max_shards: 50
      capacity: 10000
      max_samples_per_send: 2000` },
    ],
    codeNote: "The `prometheus.io/scrape` annotation is a common convention, not a built-in: it only works because the `keep` rule checks for it. The queue settings shown are the defaults.",
    incidents: ["grafana-labs-2019-pod-priority-preemption"],
    sources: [
      { title: "Prometheus overview", url: "https://prometheus.io/docs/introduction/overview/" },
      { title: "Prometheus configuration", url: "https://prometheus.io/docs/prometheus/latest/configuration/configuration/" },
      { title: "Jobs and instances", url: "https://prometheus.io/docs/concepts/jobs_instances/" },
      { title: "Prometheus storage", url: "https://prometheus.io/docs/prometheus/latest/storage/" },
      { title: "Remote write tuning", url: "https://prometheus.io/docs/practices/remote_write/" },
      { title: "Federation", url: "https://prometheus.io/docs/prometheus/latest/federation/" },
      { title: "Honeycomb: AI policies (Honeycomb Intelligence)", url: "https://docs.honeycomb.io/security-compliance/honeycomb-intelligence" },
      { title: "OpenTelemetry GenAI metrics", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-metrics.md" },
    ],
  },

  {
    id: "promql-essentials",
    n: 4,
    title: "PromQL you need in an interview",
    question: "Write the query for request rate per job and p99 latency per job. Why `rate()` before `sum`, why `sum by (le)`, and why can't you average p99s?",
    view: [920, 420],
    nodes: [
      { id: "raw", label: "Counter series", sub: "http_requests_total", kind: "store", x: 10, y: 50, w: 170, h: 56 },
      { id: "rate", label: "rate(…[5m])", sub: "per series", x: 230, y: 50, w: 170, h: 56 },
      { id: "sumby", label: "sum by (job)", sub: "then aggregate", x: 450, y: 50, w: 150, h: 56 },
      { id: "rule", label: "Recording rule", sub: "job:http_requests:rate5m", x: 650, y: 50, w: 170, h: 56 },
      { id: "hist", label: "Histogram", sub: "_bucket{le=...}", kind: "store", x: 10, y: 190, w: 170, h: 56 },
      { id: "brate", label: "rate(_bucket[5m])", sub: "per bucket", x: 230, y: 190, w: 170, h: 56 },
      { id: "bsum", label: "sum by (le)", sub: "keep le", x: 450, y: 190, w: 150, h: 56 },
      { id: "hq", label: "histogram_quantile", sub: "0.99, interpolates", x: 650, y: 190, w: 170, h: 56 },
      { id: "podq", label: "Per-pod p99", sub: "summary quantiles", kind: "store", x: 10, y: 330, w: 170, h: 56 },
      { id: "avgq", label: "avg() them?", kind: "q", x: 230, y: 330, w: 170, h: 56 },
      { id: "wrong", label: "Not a p99", sub: "statistically invalid", x: 450, y: 330, w: 150, h: 56 },
      { id: "dash", label: "Dashboards", sub: "and alerts", kind: "actor", x: 650, y: 330, w: 170, h: 56 },
    ],
    edges: [
      { id: "e-r1", from: "raw", to: "rate", label: "selects", labelAt: [205, 44] },
      { id: "e-r2", from: "rate", to: "sumby", label: "rates", labelAt: [425, 44] },
      { id: "e-r3", from: "sumby", to: "rule", label: "records", labelAt: [625, 44] },
      { id: "e-h1", from: "hist", to: "brate", label: "selects", labelAt: [205, 184] },
      { id: "e-h2", from: "brate", to: "bsum", label: "rates", labelAt: [425, 184] },
      { id: "e-h3", from: "bsum", to: "hq", label: "buckets", labelAt: [625, 184] },
      { id: "e-w1", from: "podq", to: "avgq", label: "feeds", labelAt: [205, 324] },
      { id: "e-w2", from: "avgq", to: "wrong", label: "yields", labelAt: [425, 324] },
      { id: "e-h4", from: "hq", to: "dash", label: "p99 series" },
      { id: "e-rd", from: "rule", to: "dash", label: "cheap reads", via: [[870, 78], [870, 358]], labelAt: [870, 150] },
    ],
    steps: [
      { text: "Two correct pipelines (request rate, and p99 from a histogram), one tempting wrong one, and recording rules that make the right ones cheap. Press Next." },
      { text: "A counter only goes up, and resets to 0 when the process restarts. Its raw value means nothing on a graph; what you want is how fast it grows.", on: ["raw"] },
      { text: "`rate(x[5m])` gives the per-second increase per series over the window. It detects resets (a drop in value) and extrapolates to the window edges. `increase()` is the same thing multiplied by the window. Use them on counters only.", on: ["raw", "rate"], flow: ["e-r1"] },
      { text: "Then aggregate: `sum by (job) (rate(...))`. Always rate first, then sum. Summing raw counters across pods first hides each pod's reset, so the restart shows up as a false spike.", on: ["rate", "sumby"], flow: ["e-r2"] },
      { text: "A classic histogram is a set of counters: one `_bucket` series per upper bound `le`, cumulative, plus `_sum` and `_count`. Average latency is `rate(_sum) / rate(_count)`, each summed before dividing.", on: ["hist"] },
      { text: "Same rule as counters: `rate()` each bucket series first, per pod.", on: ["hist", "brate"], flow: ["e-h1"] },
      { text: "Aggregate across pods with `sum by (le)` (add `job` if you want it per job). `le` must survive the aggregation, because `histogram_quantile` needs the buckets.", on: ["brate", "bsum"], flow: ["e-h2"] },
      { text: "`histogram_quantile(0.99, ...)` finds the bucket holding the 99th percentile and interpolates inside it. Accuracy depends on bucket layout, the `+Inf` bucket must exist, and a quantile in the top bucket returns the second-highest bound.", on: ["bsum", "hq"], flow: ["e-h3"] },
      { text: "The trap: summaries compute quantiles inside each pod, and averaging those p99s gives a statistically meaningless number. Summaries cannot be aggregated; histograms can, because you add counts first and compute the quantile last.", on: ["podq", "avgq", "wrong"], flow: ["e-w1", "e-w2"] },
      { text: "Recording rules precompute expensive expressions at each evaluation interval and store the result as a new series, named `level:metric:operations`. A `limit` can cap how many series a rule may produce.", on: ["sumby", "rule"], flow: ["e-r3"] },
      { text: "Dashboards and alerts then read the small recorded series instead of re-running the raw aggregation on every refresh. The p99 query itself can also be recorded.", on: ["rule", "dash", "hq"], flow: ["e-rd", "e-h4"] },
    ],
    say30: "Counters only go up and reset on restart, so you always wrap them in `rate()` over a window, which handles resets, and only then aggregate: `sum by (job) (rate(http_requests_total[5m]))`. For latency you use a histogram: `histogram_quantile(0.99, sum by (job, le) (rate(..._bucket[5m])))`. You keep `le` because the quantile is computed from the summed buckets. That's why histograms aggregate and summaries don't: averaging per-pod p99s is not a p99. Average latency is rate of `_sum` over rate of `_count`. For anything dashboards hit repeatedly, a recording rule precomputes it every evaluation interval, named like `job:http_requests:rate5m`.",
    gotchas: [
      "`rate()` then `sum`, never the reverse. Aggregating counters first hides resets from `rate()`.",
      "Dropping `le` in the aggregation (`sum by (job)` on buckets) silently breaks `histogram_quantile`; it needs one series per bucket boundary.",
      "Do not average ratios or averages either: sum the numerators and denominators separately, then divide.",
      "A histogram p99 is an estimate bounded by bucket edges. With a 300ms and a 450ms bucket, the true p99 can be anywhere in between; the estimate just interpolates linearly, as if observations were spread evenly.",
    ],
    atScale: [
      "High-cardinality queries time out: a `rate()` over a metric with a pod or path label across a whole fleet touches a huge number of series per evaluation. Record the aggregated form once and query that.",
      "With many Prometheus servers or a sharded long-term store, a global query fans out to every shard and is as slow as the slowest one. Pre-aggregating with recording rules at the edge keeps the cross-shard part small.",
      "Classic histograms multiply series: every bucket is its own series per label set. Teams trim bucket counts, drop unused `le` values with `metric_relabel_configs`, or move to native histograms: one series per label set instead of one per bucket, once the client exposes them and `scrape_native_histograms` is enabled.",
      "Dashboards with dozens of panels refreshing every few seconds re-run the same heavy query for every viewer. Recording rules turn that into a cheap read of a precomputed series.",
      "Late-arriving data from remote write can make a rule miss samples; `query_offset` on the rule group delays evaluation so the inputs have landed.",
    ],
    agentic: [
      "Query helpers now draft queries from plain language (New Relic AI builds NRQL; Grafana Assistant drafts queries in conversation). The rules in this chapter are your review checklist for their output: `rate()` before `sum`, `le` kept in `sum by`, no averaged quantiles, because a wrong query still draws a believable line.",
      "Token spend is just another counter: `rate()` of the GenAI input and output token usage counters, then `sum` by the request-model label, gives tokens per second, which the OTel conventions call a proxy for cost. The per-operation token histograms are for p95/p99 outliers only; the spec says not to use them for totals or cost.",
      "Agent-written recording rules get the same gates as human ones: the `level:metric:operations` name, a series `limit`, and a `promtool` test in CI. That catches a generated rule that drops a label or changes meaning before a dashboard or alert quietly starts reading it.",
    ],
    quiz: [
      { q: "Why is `rate(sum(http_requests_total)[5m:])` wrong?", a: "Summing first hides individual counter resets. When one pod restarts, the sum drops and `rate()` reads that as a reset of the whole sum, producing a wrong spike. Take `rate()` per series, then sum." },
      { q: "Write a p95 latency per service from a classic histogram.", a: "`histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_seconds_bucket[5m])))`. Rate per bucket series first, keep `le` in the aggregation, quantile last." },
      { q: "Your three pods report p99 of 100ms, 120ms and 900ms from summaries. What is the service p99?", a: "You can't tell from those numbers. Averaging quantiles is statistically invalid. You need the underlying distribution, which a histogram gives you by summing bucket rates across pods before computing the quantile." },
    ],
    code: [
      { lang: "promql", label: "Queries", src: `# requests/s per job: rate first, then sum
sum by (job) (rate(http_requests_total[5m]))

# p99 latency per job from a classic histogram
histogram_quantile(0.99,
  sum by (job, le) (
    rate(http_request_duration_seconds_bucket[5m])))

# average latency per job
  sum by (job) (rate(http_request_duration_seconds_sum[5m]))
/
  sum by (job) (rate(http_request_duration_seconds_count[5m]))` },
      { lang: "yaml", label: "Recording rules", src: `groups:
  - name: http
    interval: 1m
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))
      - record: job_le:http_request_duration_seconds_bucket:rate5m
        expr: >
          sum by (job, le) (
            rate(http_request_duration_seconds_bucket[5m]))` },
    ],
    codeNote: "With the second rule recorded, the dashboard p99 becomes `histogram_quantile(0.99, job_le:http_request_duration_seconds_bucket:rate5m)`, a cheap query over a few series per job.",
    incidents: [],
    sources: [
      { title: "PromQL functions", url: "https://prometheus.io/docs/prometheus/latest/querying/functions/" },
      { title: "Histograms and summaries", url: "https://prometheus.io/docs/practices/histograms/" },
      { title: "Recording rules (best practices)", url: "https://prometheus.io/docs/practices/rules/" },
      { title: "Defining recording rules", url: "https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/" },
      { title: "Metric and label naming", url: "https://prometheus.io/docs/practices/naming/" },
      { title: "New Relic AI", url: "https://docs.newrelic.com/docs/agentic-ai/new-relic-ai/" },
      { title: "Grafana Assistant overview", url: "https://grafana.com/docs/grafana-cloud/machine-learning/assistant/" },
      { title: "OpenTelemetry GenAI token metrics", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-token-metrics.md" },
    ],
  },
];

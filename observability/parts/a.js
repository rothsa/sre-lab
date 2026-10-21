// Chapters 1-4: signals, OpenTelemetry Collector, Prometheus scraping and storage, PromQL.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`: ../../drawn/README.md).
export const CHAPTERS = [
  {
    id: "three-signals",
    n: 1,
    title: "Telemetry strategy and budget",
    question: "Metrics, logs and traces all describe the same requests at very different costs. Across hundreds of teams, who decides what gets a metric, a log or a trace, and how do you keep the telemetry bill tied to the teams that create it?",
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
      { id: "lim", label: "Limits per team", sub: "series, streams", x: 90, y: 400, w: 170, h: 56 },
      { id: "cost", label: "Cost per team", sub: "by team label", kind: "store", x: 660, y: 400, w: 170, h: 56 },
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
      { id: "e-lim1", from: "lim", to: "mstore" },
      { id: "e-lim2", from: "lim", to: "lstore", dashed: true, via: [[175, 475], [600, 475], [600, 380]] },
      { id: "e-c1", from: "lstore", to: "cost" },
    ],
    steps: [
      { text: "One service, three signals, three stores. At the bottom are two things a fleet needs that one team doesn't: limits per team, and cost reported per team. Press Next." },
      { text: "Metrics aggregate in the process, so cost follows the number of series, each unique label set, not traffic. That makes them cheap to keep for months, which is why they drive dashboards and alerts. One unbounded label, like user ID, multiplies the series.", on: ["app", "metrics", "mstore"], flow: ["e-m", "e-ms"] },
      { text: "Logs cost per event, so they grow with traffic and verbosity. Loki indexes only stream labels and filters the text at query time.", on: ["app", "logs", "lstore"], flow: ["e-l", "e-ls"] },
      { text: "Traces cost per span and grow with call depth. OpenTelemetry suggests sampling is worth considering from about 1,000 traces per second. The fleet default: head sampling in the service template, and a shared tail tier that keeps errors and slow traces.", on: ["app", "traces", "tstore"], flow: ["e-t", "e-ts"] },
      { text: "The signals link up. An exemplar puts a trace ID on a metric sample, and log records carry `TraceId` and `SpanId`. Alert on a metric, open a slow trace, read that request's logs.", on: ["grafana", "mstore", "tstore", "lstore"], flow: ["e-qm", "e-ex", "e-tid"] },
      { text: "The org rule for which signal: counts and rates are metrics, kept long. One request's path is a trace, sampled. The exact error is a log, kept short. Write it on one page with default retention for each, and check every new service against it.", on: ["metrics", "traces", "logs"] },
      { text: "Limits make the rule real. Prometheus `sample_limit` fails the whole scrape when a target exposes too many samples. Loki has per-tenant limits such as `ingestion_rate_mb` and `max_streams_per_user`. Count limit hits per team each week.", on: ["lim", "mstore", "lstore"], flow: ["e-lim1", "e-lim2"] },
      { text: "Make teams tenants, or at least label everything by team. Mimir custom trackers count active series per label matcher, so you can report series per team. Loki's overrides exporter publishes each tenant's limits as metrics. Spend with no owning team should trend to zero.", on: ["lim", "cost", "lstore", "mstore"], flow: ["e-c1"] },
      { text: "Publish the number. Each team sees its series, log GB and spans per month, next to its owners. A team over budget two months running gets a review: drop unused series, sample, cut retention, or raise the budget. Fleet-wide, compare spend growth with traffic growth.", on: ["cost", "lim"] },
    ],
    say30: "Each signal costs differently. Metrics cost per series, so they're cheap to keep and drive alerts. Logs cost per event and grow with traffic. Traces cost per span and get sampled. They link through exemplars and trace IDs on log records. At org scale I write the rule down: counts are metrics, one request's path is a trace, the exact error is a log with short retention. Then I enforce it with limits per team, like Prometheus `sample_limit` and Loki per-tenant limits, and report cost per team using Mimir custom trackers and tenant metrics. Teams over budget get a review. I track how much spend is attributed to an owner, and spend growth against traffic growth.",
    gotchas: [
      "Metric cost is driven by cardinality, not traffic. Put user IDs and emails in logs or span attributes, never in labels.",
      "Logs and traces link only if trace context is there. One uninstrumented hop or a logger not wired to the SDK breaks the chain.",
      "Exemplars point to one trace. If sampling dropped it, the link goes nowhere.",
      "A scrape over `sample_limit` fails whole, so the target goes dark. Alert on scrape failures when you add limits.",
    ],
    agentic: [
      "Assistants now turn plain questions into queries: Grafana Assistant handles querying and dashboards in conversation, New Relic AI helps build NRQL, and Honeycomb's Canvas works from your schema plus sample telemetry values (none of these pages states a preview or GA label). Choosing the right signal is still your call, so read the generated PromQL, LogQL or NRQL before trusting the chart: a plausible query on the wrong signal or label is the new silent error.",
      "LLM calls and agent runs are now a workload with its own telemetry budget. OpenTelemetry's GenAI conventions (Development status, not stable) define token-usage counters, duration histograms, and spans per model call and per tool call; prompt and response content on those spans is Opt-In because it likely holds user data, so the org rule should treat it like request bodies, never like metric labels. Claude Platform traces (beta, October 2026) follow these conventions, so agent spans can sit beside your service traces in the same tools.",
      "Investigation agents walk the same loop of metric, exemplar, trace and logs, so the `TraceId` on your log records and exemplars on your histograms decide how far they get. Mid-incident they gather evidence read-only and a human decides; ask for the exact queries and links behind a conclusion, or treat it as a hypothesis (see Agentic Engineering).",
    ],
    quiz: [
      { q: "Telemetry spend grew 3x this year while traffic grew 30%. Where do you look first?", a: "Cost per team, to see who grew. Then series growth from new labels, log volume per tenant, and spans per request from deeper call graphs. Check how much spend has no owner, since that part nobody is cutting." },
      { q: "A team wants to log every request at debug level in production. What does the org rule say?", a: "Counts and latencies are metrics. The path of a slow or failed request is a sampled trace. Logs are for the exact error, with short retention. If they still need per-request detail, sample it, and it counts against their budget." },
      { q: "How does a log line get linked to a trace?", a: "The OpenTelemetry log record carries `TraceId` and `SpanId`, filled from the active span when the SDK or auto-instrumentation is in place. The log UI then extracts the trace ID and links to the trace store." },
    ],
    incidents: [],
    sources: [
      { title: "Claude: Agent observability on the Claude Platform (Oct 2026)", url: "https://claude.com/resources/articles/agent-observability-on-the-claude-platform" },
      { title: "OpenTelemetry: Signals", url: "https://opentelemetry.io/docs/concepts/signals/" },
      { title: "OpenTelemetry: Logs", url: "https://opentelemetry.io/docs/concepts/signals/logs/" },
      { title: "OpenTelemetry: Metrics", url: "https://opentelemetry.io/docs/concepts/signals/metrics/" },
      { title: "OpenTelemetry: Sampling", url: "https://opentelemetry.io/docs/concepts/sampling/" },
      { title: "Prometheus configuration (scrape limits)", url: "https://prometheus.io/docs/prometheus/latest/configuration/configuration/" },
      { title: "Grafana Mimir: Custom active series trackers", url: "https://grafana.com/docs/mimir/latest/configure/configure-custom-trackers/" },
      { title: "Grafana Loki: Overrides exporter (per-tenant limits)", url: "https://grafana.com/docs/loki/latest/operations/overrides-exporter/" },
      { title: "Prometheus: Metric and label naming", url: "https://prometheus.io/docs/practices/naming/" },
      { title: "Grafana: Introduction to exemplars", url: "https://grafana.com/docs/grafana/latest/fundamentals/exemplars/" },
      { title: "Grafana Loki overview", url: "https://grafana.com/docs/loki/latest/get-started/overview/" },
      { title: "OpenTelemetry GenAI semantic conventions (Development)", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/README.md" },
      { title: "OpenTelemetry GenAI spans", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md" },
      { title: "Grafana Assistant overview", url: "https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/" },
      { title: "New Relic AI", url: "https://docs.newrelic.com/docs/agentic-ai/new-relic-ai/" },
      { title: "Honeycomb: AI policies (Honeycomb Intelligence)", url: "https://docs.honeycomb.io/security-compliance/ai-policies" },
    ],
  },

  {
    id: "otel-collector",
    n: 2,
    title: "Telemetry pipeline as a platform",
    question: "Every team's spans, metrics and logs go through the same OpenTelemetry Collectors. What SLOs does that pipeline need, who carries its pager, and where does it lose data?",
    view: [940, 600],
    groups: [
      { id: "g-node", label: "Node (agent)", x: 10, y: 20, w: 310, h: 110 },
      { id: "g-gw", label: "Gateway Collector: traces pipeline", x: 10, y: 170, w: 920, h: 230 },
      { id: "g-t2", label: "Tier 2: tail sampling", x: 540, y: 425, w: 170, h: 165 },
    ],
    nodes: [
      { id: "app", label: "Service", sub: "OTel SDK + API", kind: "pod", x: 25, y: 55, w: 130, h: 56 },
      { id: "agent", label: "Agent Collector", sub: "DaemonSet", x: 180, y: 55, w: 125, h: 56 },
      { id: "opamp", label: "OpAMP server", sub: "config, versions", x: 380, y: 45, w: 160, h: 56 },
      { id: "slo", label: "Pipeline SLOs", sub: "otelcol_* metrics", kind: "store", x: 590, y: 45, w: 160, h: 56 },
      { id: "oncall", label: "Platform on-call", sub: "owns the pipeline", kind: "actor", x: 790, y: 45, w: 140, h: 56 },
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
      { id: "e-opamp", from: "opamp", to: "agent", label: "config", via: [[460, 150], [300, 150]], labelAt: [380, 145] },
      { id: "e-int", from: "batch", to: "slo", label: "otelcol_*", labelPos: 0.5 },
      { id: "e-oncall", from: "slo", to: "oncall" },
    ],
    steps: [
      { text: "Below: the pipeline every team's telemetry goes through. Top right: what the platform adds once hundreds of teams depend on it, which is SLOs, an owner with a pager, and fleet config control. Press Next." },
      { text: "Apps export OTLP to an agent Collector on their node, gRPC on 4317 or HTTP on 4318. The agent adds host metadata and forwards to a gateway, usually one per cluster or region.", on: ["app", "agent", "recv"], flow: ["e-sdk", "e-ag"] },
      { text: "`memory_limiter` goes first. Over its soft limit it refuses data with a retryable error and the sender backs off. A sender that doesn't retry loses that data.", on: ["recv", "mem"], flow: ["e-p1", "e-refuse"] },
      { text: "Then `k8sattributes` (before batching, which drops the context it needs), redaction in `attributes`, then `batch`. This is where org rules live: strip personal data and high-cardinality attributes once, for everyone.", on: ["mem", "k8s", "attr", "batch"], flow: ["e-p2", "e-p3", "e-p4"] },
      { text: "Each exporter gets its own copy. `loadbalancing` routes by trace ID so one tail sampler sees the whole trace. Scale that sampling tier only behind it, and watch `otelcol_loadbalancer_num_backends`: every change moves trace routes.", on: ["batch", "expo", "explb", "s1", "s2", "tback", "vback"], flow: ["e-fo1", "e-fo2", "e-v", "e-lb1", "e-lb2", "e-s1", "e-s2"] },
      { text: "Data is lost at the queues. In-memory queues die with the process, full queues drop new data, and a backend outage longer than the retry window (5 minutes by default) expires old data.", on: ["expo", "explb", "tback", "vback"] },
      { text: "So give the pipeline SLOs from the Collector's own metrics, per signal and cluster. Delivery is `otelcol_exporter_sent_*` against `otelcol_receiver_accepted_*`. Refusals are `otelcol_receiver_refused_*`. Loss before the queue is `otelcol_exporter_enqueue_failed_*`.", on: ["batch", "slo"], flow: ["e-int"] },
      { text: "Scale before it drops. The Collector docs suggest scaling out at about 60 to 70% queue use. If the queue stays full as you add Collectors, the backend is the bottleneck. Set `limit_mib` below the container's memory limit.", on: ["slo", "expo", "explb"] },
      { text: "The team that runs the pipeline carries its pager, paged on those SLOs. Product teams get a panel that says when missing data is the pipeline's fault. Count the incidents where a product team noticed missing data before the pipeline team did.", on: ["slo", "oncall"], flow: ["e-oncall"] },
      { text: "OpAMP (a beta spec) lets a server push config to agents, see their versions and health, and roll out upgrades. Without it, a config change across thousands of agents is a deploy you can't see. Track the share of agents on the current config and a supported version.", on: ["opamp", "agent"], flow: ["e-opamp"] },
    ],
    say30: "Apps send OTLP to an agent Collector on the node, then to a gateway. The pipeline is receivers, ordered processors and exporters: `memory_limiter` first, enrichment, redaction, then `batch`. Tail sampling needs trace-ID load balancing. Once every team depends on it, I run it as a tier-0 service. It gets SLOs from its own metrics: sent against accepted, refusals, and enqueue failures. The team that runs it carries the pager. It scales out at about 60 to 70% queue use, and checks the backend first if queues stay full. Config and versions are managed for the whole fleet, with OpAMP or GitOps, so one redaction rule applies everywhere.",
    gotchas: [
      "Processor order is the order you list them. `memory_limiter` after `batch` can't protect the buffer, and `k8sattributes` after `batch` loses its context.",
      "Tail sampling needs every span of a trace on one Collector. Round-robin in front of tail samplers silently makes partial traces.",
      "OTLP delivery is guaranteed per hop only, and retries after reconnects can create duplicates.",
      "Telemetry schemas are interfaces. Collector Contrib v0.160.0 lets the hostmetrics process scraper opt in to release-candidate metrics, which rename things (`state` becomes `cpu.mode`). The Collector stays healthy while shared queries break, so test the switch against the fleet's dashboards first.",
    ],
    agentic: [
      "Agent and LLM telemetry rides the same SDK-to-Collector path. The GenAI conventions keep `gen_ai.input.messages`, `gen_ai.output.messages` and `gen_ai.tool.call.arguments` Opt-In because they can carry user data; if a team turns capture on, the gateway's `attributes` or `transform` processor is where the platform deletes or hashes them for every team before any exporter ships a copy to a vendor.",
      "Each agent step can be a span: an `invoke_agent` span, one per model call and an `execute_tool` span per tool call, so one task sends a burst of spans through `memory_limiter` and the exporter queues. Some backends bill per LLM span (Datadog Agent Observability meters LLM spans ingested), so size both the pipeline and the budget for agent loops, not single requests.",
      "Agents draft Collector configs quickly, and a config that loads is not a correct one. Check processor order by hand (`memory_limiter` first, `k8sattributes` before `batch`) and that redaction exists in every pipeline that exports, because a misordered limiter fails only under load and a missing redaction shows up only in an audit. Ship fleet configs through the same review and staged rollout as code.",
    ],
    quiz: [
      { q: "Product teams say traces are missing. How do you tell whether it's the pipeline?", a: "Compare `otelcol_exporter_sent_spans` with `otelcol_receiver_accepted_spans` per gateway, and look for refused and enqueue_failed spans. Then check tail-sampling decisions and the backend. If the pipeline's numbers are clean, the gap is upstream, often a service that isn't instrumented or doesn't retry." },
      { q: "Who should be paged when gateway Collectors drop data, and on what signal?", a: "The team that runs the pipeline, on its SLOs: sustained refusals, enqueue failures, or sent falling behind accepted. Product teams should see a pipeline status panel, not get paged for it." },
      { q: "You run three gateway Collectors behind a round-robin load balancer, each with `tail_sampling`. What goes wrong?", a: "Spans of one trace land on different Collectors, so each sees a partial trace and makes its own decision. Put a first tier with the `loadbalancing` exporter, `routing_key: traceID`, in front of the samplers." },
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
  k8s_attributes: {}
  attributes:
    actions:
      - { key: user.email, action: delete }
  batch: {}
exporters:
  otlp_grpc/vendor:
    endpoint: vendor.example.com:4317
  load_balancing:
    routing_key: traceID
    protocol:
      otlp: { tls: { insecure: true } }
    resolver:
      dns: { hostname: samplers-headless }
service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, k8s_attributes,
                   attributes, batch]
      exporters: [otlp_grpc/vendor, load_balancing]` },
      { lang: "promql", label: "Pipeline SLIs", src: `# share of accepted spans that were exported
  sum(rate(otelcol_exporter_sent_spans[5m]))
/
  sum(rate(otelcol_receiver_accepted_spans[5m]))

# data lost before the queue: should be 0
sum by (exporter) (
  rate(otelcol_exporter_enqueue_failed_spans[5m]))

# queue use: scale out around 0.6-0.7
max by (exporter) (
  otelcol_exporter_queue_size
  / otelcol_exporter_queue_capacity)` },
    ],
    codeNote: "A sketch, not a drop-in config: hostnames are placeholders and the thresholds are examples. The processor order in `service.pipelines` is the order data flows. Recent Collector releases renamed the `otlp` exporter to `otlp_grpc`, `k8sattributes` to `k8s_attributes` and `loadbalancing` to `load_balancing`; the old names still work as deprecated aliases. With two exporters, sent counts each copy, so compare per exporter in practice. Prometheus-scraped names may carry a `_total` suffix.",
    incidents: ["stackdriver-2013-cassandra-queue-coupling", "honeycomb-2019-ingest-memory-leak", "railway-2023-metrics-agent-cpu-softlock"],
    sources: [
      { title: "OpenTelemetry Collector: Internal telemetry", url: "https://opentelemetry.io/docs/collector/internal-telemetry/" },
      { title: "OpenTelemetry Collector: Scaling", url: "https://opentelemetry.io/docs/collector/scaling/" },
      { title: "OpAMP specification", url: "https://opentelemetry.io/docs/specs/opamp/" },
      { title: "OpenTelemetry Collector: Architecture", url: "https://opentelemetry.io/docs/collector/architecture/" },
      { title: "OpenTelemetry: Versioned metrics in hostmetrics, the first release-candidate metrics (13 Oct 2026)", url: "https://opentelemetry.io/blog/2026/hostmetrics-process-scraper-rc/" },
      { title: "OpenTelemetry Collector: Configuration", url: "https://opentelemetry.io/docs/collector/configuration/" },
      { title: "Collector deployment: Agent", url: "https://opentelemetry.io/docs/collector/deploy/agent/" },
      { title: "Collector deployment: Gateway", url: "https://opentelemetry.io/docs/collector/deploy/gateway/" },
      { title: "Collector resiliency", url: "https://opentelemetry.io/docs/collector/resiliency/" },
      { title: "OTLP specification", url: "https://opentelemetry.io/docs/specs/otlp/" },
      { title: "Memory limiter processor README", url: "https://github.com/open-telemetry/opentelemetry-collector/blob/main/processor/memorylimiterprocessor/README.md" },
      { title: "Recommended processors", url: "https://github.com/open-telemetry/opentelemetry-collector/blob/main/processor/README.md" },
      { title: "Load-balancing exporter README", url: "https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/exporter/loadbalancingexporter/README.md" },
      { title: "Tail sampling processor README", url: "https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/processor/tailsamplingprocessor/README.md" },
      { title: "OpenTelemetry GenAI spans", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md" },
      { title: "OpenTelemetry GenAI agent spans", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md" },
      { title: "Datadog Agent Observability", url: "https://docs.datadoghq.com/llm_observability/" },
      { title: "OpenTelemetry Collector contrib CHANGELOG (component renames)", url: "https://github.com/open-telemetry/opentelemetry-collector-contrib/blob/main/CHANGELOG.md" },
    ],
  },

  {
    id: "prometheus-scrape",
    n: 3,
    title: "Prometheus topology: shards, HA and remote write",
    question: "Hundreds of clusters each run Prometheus. How do you shard and pair the servers, get one global view, and prove no targets went missing?",
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
      { id: "peers", label: "Clusters 2..N", sub: "HA pairs, shards", x: 810, y: 300, w: 140, h: 56 },
      { id: "fleet", label: "Fleet SLIs", sub: "coverage, lag", kind: "store", x: 810, y: 420, w: 140, h: 56 },
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
      { id: "e-peer", from: "peers", to: "lts", label: "remote_write" },
      { id: "e-sli", from: "fleet", to: "lts" },
    ],
    steps: [
      { text: "One Prometheus server in detail, inside the box, and the fleet around it: other clusters writing to one long-term store, and the numbers that say the layout works. Press Next to follow one scrape, then the fleet decisions." },
      { text: "`kubernetes_sd_configs` watches the Kubernetes API and turns pods or EndpointSlices into candidate targets with `__meta_kubernetes_*` labels. `relabel_configs` runs before any scrape: `keep` opted-in targets, copy namespace and pod into real labels. Every cluster gets this from one shared config.", on: ["kapi", "sd", "relabel"], flow: ["e-watch", "e-cand"] },
      { text: "The scrape loop pulls `/metrics` every `scrape_interval` and writes `up` for each target. A scrape slower than `scrape_timeout`, or over `sample_limit`, fails whole: `up` is 0 and no samples land. A target that discovery never found has no `up` series at all.", on: ["relabel", "scrape", "apppod", "slow"], flow: ["e-keep", "e-s1", "e-s2"] },
      { text: "Samples go to an in-memory head block, logged to a WAL in 128MB segments, then cut into two-hour blocks on disk, kept 15 days by default. Local storage is one node and not replicated, and the head lives in memory. That caps what one server can hold.", on: ["scrape", "head", "wal", "blocks"], flow: ["e-ingest", "e-wal", "e-cut"] },
      { text: "Size each server. Disk is about retention seconds times samples per second times 1-2 bytes, and samples per second is targets times series per target over the interval. When a cluster outgrows one server, split its targets with a `hashmod` relabel rule, one shard per server.", on: ["relabel", "scrape", "blocks"] },
      { text: "Run every server or shard as an HA pair with identical config. `external_labels` stamp `cluster` and replica on everything sent out. Mimir's HA tracker elects one replica per `cluster` value and drops the other's samples, so the store keeps one copy.", on: ["rwq", "lts", "peers"], flow: ["e-peer"] },
      { text: "`remote_write` tails the WAL and POSTs batches to that store, which is the fleet's global view and long retention. One full shard queue blocks WAL reads for every shard. If the endpoint is down past two hours, the WAL is compacted and unsent samples are lost.", on: ["wal", "rwq", "lts"], flow: ["e-rw", "e-post"] },
      { text: "Clusters that only ship data can run in `--agent` mode: the same discovery and scraping, a WAL cleared after each successful write, and no local queries, alerting or recording rules. The trade is that rules and alerts run centrally, so paging depends on the remote store.", on: ["sd", "scrape", "wal", "rwq"] },
      { text: "Federation is the pull path: a global server scrapes `/federate` with `match[]` selectors for current values and sets `honor_labels: true`. Keep it to a few recording-rule aggregates. Full-resolution history belongs in remote write.", on: ["global", "head"], flow: ["e-fed"] },
      { text: "Then measure the layout per cluster. Coverage: targets with `up == 1` against the targets you expect. Lag: highest queued minus highest sent timestamp; the Prometheus mixin alerts past 120 seconds. Capacity: active series per server against its plan.", on: ["fleet", "lts", "peers"], flow: ["e-sli"] },
    ],
    say30: "Every cluster gets the same Prometheus setup. Discovery and `relabel_configs` pick targets, the scrape loop records `up`, and samples sit in a WAL-backed head, then two-hour blocks on one node's disk. One server's head is finite, so I size from targets times series over the interval, shard with `hashmod` when a cluster outgrows a server, and run each shard as an HA pair with `cluster` and replica external labels. Everything goes over `remote_write` to a store like Mimir, which drops the duplicate replica and is the global view. Federation is only for a few aggregates. Per cluster I track target coverage, remote write lag against a two-minute line, and series against capacity.",
    gotchas: [
      "`relabel_configs` acts on targets before the scrape; `metric_relabel_configs` acts on samples after it. Dropping a noisy metric in `relabel_configs` does nothing.",
      "`up == 0` alerts can't see a target that discovery or a `keep` rule dropped, because it has no `up` series. Coverage needs a list of expected targets, or `absent()` for jobs that must exist.",
      "Give each HA pair its own `cluster` value. Mimir elects one replica per value, so shards that share one can't fail over on their own.",
      "Restarting a busy server replays the WAL, at least the last two hours of samples, before the head is back. Stagger restarts so one replica of each pair stays up.",
    ],
    agentic: [
      "Agents now read metrics through assistants and MCP servers (Grafana Assistant, for one, queries your data sources under your own permissions; Prometheus took an MCP server into its own GitHub org in October 2026, and it serves the TSDB admin endpoints only when started with `--dangerous.enable-tsdb-admin-tools`), so `job`, `instance` and your metric names become an API that agents consume. Absence is the trap: a target dropped by `relabel_configs` has no `up` series at all, and an agent that finds no data can call the service healthy, so ask which series it actually checked.",
      "LLM workloads add new series: OTel GenAI token counters and duration histograms (Development status, names may still change) reach Prometheus or Mimir through the Collector, so `sample_limit` and `metric_relabel_configs` apply to them like any exporter. The spec asks for `error.type` to be the provider's error code or another low-cardinality identifier; keep `gen_ai.request.model` bounded too, and never put prompt text or conversation IDs in labels.",
      "Ask an agent to size a server or a `remote_write` queue and it will give confident numbers; check them against this chapter's arithmetic (targets times series per target divided by the interval, 1-2 bytes per sample) and against `prometheus_remote_storage_samples_pending`. A model's idea of defaults can be stale, and the fundamentals still decide capacity.",
    ],
    quiz: [
      { q: "Target coverage in one cluster fell from 99% to 93% after a config change, with no `up == 0` alerts. Where do you look?", a: "Discovery and relabeling. Targets dropped by a `keep` rule or never discovered have no `up` series, so nothing fires. The service discovery page shows labels before and after relabeling." },
      { q: "When do you shard a cluster's Prometheus, and when do you run it in agent mode?", a: "Shard with `hashmod` when one server's series outgrow its memory and disk plan. Use agent mode when the cluster only ships data and rules can run centrally." },
      { q: "Remote write lag on one cluster has been over two minutes for an hour. What's at risk?", a: "A slow backend or network, and one full shard queue blocks WAL reads for every shard. Check `prometheus_remote_storage_samples_pending`. Past about two hours down, unsent samples are lost." },
    ],
    code: [
      { lang: "yaml", label: "prometheus.yml (shard 0, replica a)", src: `global:
  scrape_interval: 30s
  external_labels:
    cluster: prod-eu-1-s0   # one value per HA pair
    __replica__: a          # its twin sets b
scrape_configs:
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__address__]
        modulus: 2
        target_label: __tmp_shard
        action: hashmod
      - source_labels: [__tmp_shard]
        regex: "0"
        action: keep
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: "debug_.*"
        action: drop
    sample_limit: 50000
remote_write:
  - url: https://metrics.example.internal/api/v1/push` },
      { lang: "promql", label: "Fleet SLIs", src: `# remote write lag in seconds; page past 120
  prometheus_remote_storage_queue_highest_timestamp_seconds
- prometheus_remote_storage_queue_highest_sent_timestamp_seconds

# share of discovered pod targets scraped OK, per cluster
avg by (cluster) (up{job="kubernetes-pods"})` },
    ],
    codeNote: "The `prometheus.io/scrape` annotation is a convention: it works because the `keep` rule checks for it. The two `hashmod` rules keep shard 0 of 2. `avg(up)` only counts discovered targets, so compare target counts with what should be running. The lag query is the one in the Prometheus mixin's PrometheusRemoteWriteBehind alert.",
    incidents: ["grafana-labs-2019-pod-priority-preemption"],
    sources: [
      { title: "prometheus/prometheus-mcp (TSDB admin tools flag)", url: "https://github.com/prometheus/prometheus-mcp" },
      { title: "OpenTelemetry: OTel and Prometheus interoperability (12 Oct 2026)", url: "https://opentelemetry.io/blog/2026/otel-prometheus-interoperability/" },
      { title: "Prometheus overview", url: "https://prometheus.io/docs/introduction/overview/" },
      { title: "Prometheus configuration (relabel, hashmod, external_labels)", url: "https://prometheus.io/docs/prometheus/latest/configuration/configuration/" },
      { title: "Jobs and instances", url: "https://prometheus.io/docs/concepts/jobs_instances/" },
      { title: "Prometheus storage", url: "https://prometheus.io/docs/prometheus/latest/storage/" },
      { title: "Remote write tuning", url: "https://prometheus.io/docs/practices/remote_write/" },
      { title: "Federation", url: "https://prometheus.io/docs/prometheus/latest/federation/" },
      { title: "Prometheus Agent mode", url: "https://prometheus.io/docs/prometheus/latest/prometheus_agent/" },
      { title: "Grafana Mimir: High-availability deduplication", url: "https://grafana.com/docs/mimir/latest/configure/configure-high-availability-deduplication/" },
      { title: "Prometheus mixin alerts (PrometheusRemoteWriteBehind)", url: "https://monitoring.mixins.dev/prometheus/" },
      { title: "Honeycomb: AI policies (Honeycomb Intelligence)", url: "https://docs.honeycomb.io/security-compliance/ai-policies" },
      { title: "OpenTelemetry GenAI metrics", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-metrics.md" },
    ],
  },

  {
    id: "promql-essentials",
    n: 4,
    title: "Query and rule standards for the fleet",
    question: "Hundreds of teams query the same metrics. How do you ship recording-rule and SLO-rule libraries so they don't each compute p99 their own way, and often wrong?",
    view: [920, 500],
    nodes: [
      { id: "raw", label: "Counter series", sub: "http_requests_total", kind: "store", x: 10, y: 50, w: 170, h: 56 },
      { id: "rate", label: "rate(…[5m])", sub: "per series", x: 230, y: 50, w: 170, h: 56 },
      { id: "sumby", label: "sum by (job)", sub: "then aggregate", x: 450, y: 50, w: 150, h: 56 },
      { id: "rule", label: "Rule library", sub: "job:http_requests:rate5m", x: 650, y: 50, w: 170, h: 56 },
      { id: "hist", label: "Histogram", sub: "_bucket{le=...}", kind: "store", x: 10, y: 190, w: 170, h: 56 },
      { id: "brate", label: "rate(_bucket[5m])", sub: "per bucket", x: 230, y: 190, w: 170, h: 56 },
      { id: "bsum", label: "sum by (le)", sub: "keep le", x: 450, y: 190, w: 150, h: 56 },
      { id: "hq", label: "histogram_quantile", sub: "0.99, interpolates", x: 650, y: 190, w: 170, h: 56 },
      { id: "podq", label: "Per-pod p99", sub: "summary quantiles", kind: "store", x: 10, y: 330, w: 170, h: 56 },
      { id: "avgq", label: "avg() them?", kind: "q", x: 230, y: 330, w: 170, h: 56 },
      { id: "wrong", label: "Not a p99", sub: "statistically invalid", x: 450, y: 330, w: 150, h: 56 },
      { id: "dash", label: "Team dashboards", sub: "and SLO alerts", kind: "actor", x: 650, y: 330, w: 170, h: 56 },
      { id: "spec", label: "SLO spec", sub: "one per service", kind: "store", x: 10, y: 430, w: 170, h: 56 },
      { id: "gen", label: "Rule generator", sub: "Sloth, mixins", x: 230, y: 430, w: 170, h: 56 },
      { id: "slorules", label: "SLO rules", sub: "SLIs + burn alerts", x: 450, y: 430, w: 150, h: 56 },
      { id: "ci", label: "promtool test", sub: "in CI", x: 650, y: 430, w: 170, h: 56 },
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
      { id: "e-s1", from: "spec", to: "gen", label: "input", labelAt: [205, 424] },
      { id: "e-s2", from: "gen", to: "slorules", label: "writes", labelAt: [425, 424] },
      { id: "e-s3", from: "slorules", to: "ci", label: "tested", labelAt: [625, 424] },
      { id: "e-s4", from: "ci", to: "dash" },
    ],
    steps: [
      { text: "Top three rows: the PromQL every team writes, and the mistake most make once. Bottom row: how the platform ships the right answer as a library, so hundreds of teams don't each work out p99 alone. Press Next." },
      { text: "Counters only go up and reset on restart. `rate(x[5m])` gives the per-second increase per series and handles resets. Then aggregate: `sum by (job) (rate(...))`. Sum first and a pod restart looks like a spike.", on: ["raw", "rate", "sumby"], flow: ["e-r1", "e-r2"] },
      { text: "A histogram is counters too, one `_bucket` series per bound `le`. Rate each bucket, `sum by (job, le)`, then `histogram_quantile(0.99, ...)`. Drop `le` and the quantile breaks. Native histograms, once clients expose them and `scrape_native_histograms` is on, need one series per label set.", on: ["hist", "brate", "bsum", "hq"], flow: ["e-h1", "e-h2", "e-h3"] },
      { text: "The common wrong answer is averaging per-pod p99s from summaries. That isn't a p99 of anything. Repeat it across a few hundred teams and the fleet's latency dashboards disagree with each other.", on: ["podq", "avgq", "wrong"], flow: ["e-w1", "e-w2"] },
      { text: "So record the right expression once. Names follow `level:metric:operations`, like `job:http_requests:rate5m`. Prometheus's guidance: aggregate numerator and denominator separately, then divide, and list the labels you drop.", on: ["sumby", "rule"], flow: ["e-r3"] },
      { text: "Teams read the recorded series, so two teams asking for checkout's p99 get the same number. A fleet-wide `rate()` over pod or path labels times out, so the library records the aggregate. Track the share of dashboard and alert queries that read recorded series.", on: ["rule", "dash", "hq"], flow: ["e-rd", "e-h4"] },
      { text: "SLO rules come from a spec. Sloth takes an SLO in its own format or OpenSLO and writes SLI recording rules over several windows, plus multiwindow burn-rate alerts at page and warning. Track the share of tier-1 services whose alerts come from it.", on: ["spec", "gen", "slorules"], flow: ["e-s1", "e-s2"] },
      { text: "For shared components, use what exists. Monitoring mixins package Grafana dashboards, recording rules and alerts for Kubernetes, node exporter, Prometheus and more.", on: ["gen", "slorules"] },
      { text: "Every rule in the library gets a `promtool` test in CI and a series `limit`. A renamed label then fails a build instead of quietly changing hundreds of dashboards. Rule changes merged without a test should be zero.", on: ["slorules", "ci", "dash"], flow: ["e-s3", "e-s4"] },
    ],
    say30: "The essentials don't change: `rate()` per series, then `sum by`. For p99 from a histogram, keep `le` in the aggregation and call `histogram_quantile` last. Never average p99s. At fleet scale I stop expecting every team to get that right. The platform ships a recording-rule library named `level:metric:operations`, and dashboards read it. SLO rules come from a generator like Sloth, from one spec per service. Shared components use monitoring mixins. Every rule has a `promtool` test in CI and a series limit. I measure how much of the fleet's dashboards and alerts read the library and how many hand-written burn-rate rules are left.",
    gotchas: [
      "`rate()` then `sum`, never the reverse. Aggregating counters first hides resets.",
      "Don't average ratios or averages either. Sum numerators and denominators, then divide.",
      "A histogram p99 is an estimate bounded by bucket edges. Between a 300ms and a 450ms bucket, the true value can be anywhere.",
      "A library nobody can find gets rebuilt. Publish each rule's name and meaning where teams build dashboards.",
    ],
    agentic: [
      "Query helpers now draft queries from plain language (New Relic AI builds NRQL; Grafana Assistant drafts queries in conversation). Point them at the recorded series in the library, and use the rules in this chapter as the review checklist for anything they write against raw metrics: `rate()` before `sum`, `le` kept in `sum by`, no averaged quantiles, because a wrong query still draws a believable line.",
      "Token spend is just another counter: `rate()` of the GenAI input and output token usage counters, then `sum` by the request-model label, gives tokens per second, which the OTel conventions call a proxy for cost. Ship it as a library rule so every team's cost panel agrees. The per-operation token histograms are for p95/p99 outliers only; the spec says not to use them for totals or cost.",
      "Agent-written recording rules get the same gates as human ones: the `level:metric:operations` name, a series `limit`, and a `promtool` test in CI. That catches a generated rule that drops a label or changes meaning before a dashboard or alert quietly starts reading it.",
    ],
    quiz: [
      { q: "Two teams' dashboards show different p99s for the same service. What do you look for, and what standard prevents it?", a: "Averaged per-pod quantiles, `le` dropped from the aggregation, or different rate windows. The standard is one recorded series in the shared library, so both dashboards read the same expression." },
      { q: "Why generate SLO rules rather than let each team write them?", a: "Windows and burn thresholds stay consistent, a fix lands everywhere at once, and the generated rules are tested. Hand-written burn-rate rules drift and are rarely tested for the quiet case." },
      { q: "Write a p95 latency per service from a classic histogram.", a: "`histogram_quantile(0.95, sum by (service, le) (rate(http_request_duration_seconds_bucket[5m])))`. Rate per bucket series first, keep `le` in the aggregation, quantile last." },
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
      { lang: "yaml", label: "Library recording rules", src: `groups:
  - name: http
    interval: 1m
    limit: 5000          # max series per rule; 0 = none
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))
      - record: job_le:http_request_duration_seconds_bucket:rate5m
        expr: >
          sum by (job, le) (
            rate(http_request_duration_seconds_bucket[5m]))` },
    ],
    codeNote: "With the second rule recorded, every team's p99 becomes `histogram_quantile(0.99, job_le:http_request_duration_seconds_bucket:rate5m)`, a cheap query over a few series per job, and the same one for everyone.",
    incidents: [],
    sources: [
      { title: "PromQL functions", url: "https://prometheus.io/docs/prometheus/latest/querying/functions/" },
      { title: "Histograms and summaries", url: "https://prometheus.io/docs/practices/histograms/" },
      { title: "Recording rules (best practices)", url: "https://prometheus.io/docs/practices/rules/" },
      { title: "Defining recording rules", url: "https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/" },
      { title: "Prometheus: Unit testing rules", url: "https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/" },
      { title: "Sloth: Prometheus SLO generator", url: "https://github.com/slok/sloth" },
      { title: "Sloth documentation", url: "https://sloth.dev/" },
      { title: "Monitoring mixins", url: "https://monitoring.mixins.dev/" },
      { title: "Metric and label naming", url: "https://prometheus.io/docs/practices/naming/" },
      { title: "New Relic AI", url: "https://docs.newrelic.com/docs/agentic-ai/new-relic-ai/" },
      { title: "Grafana Assistant overview", url: "https://grafana.com/docs/grafana-cloud/platform/grafana-assistant/" },
      { title: "OpenTelemetry GenAI token metrics", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-token-metrics.md" },
    ],
  },
];

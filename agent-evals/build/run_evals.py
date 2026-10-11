"""Did the Agent Do It Right? -- offline build for the SRE Lab page.

Three SIMULATED agent runs per SYNTHETIC incident. No LLM, no API calls, no keys.
The "agents" are deterministic Python functions that call mock SRE tools. Every
tool call is recorded as an OpenTelemetry span; pydantic-evals captures those
spans per case and the evaluators judge the run from its trace, not from how
convincing the final explanation sounds.

Run:  ~/.venvs/agent-evals/bin/python agent-evals/build/run_evals.py
Out:  agent-evals/data/results.json, agent-evals/data/report.txt
"""

from __future__ import annotations

import io
import json
import os
import socket
import sys
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

# --- Offline guard -----------------------------------------------------------
# Nothing in this build should talk to the network. Logfire is configured with
# send_to_logfire=False below; this guard makes any accidental remote
# connection (exporter, version check, price lookup...) fail loudly instead.
os.environ.pop('LOGFIRE_TOKEN', None)
for _k in [k for k in os.environ if k.startswith('OTEL_EXPORTER_')]:
    os.environ.pop(_k)
_BLOCKED: list[str] = []
_real_connect = socket.socket.connect


def _guarded_connect(self, address):  # type: ignore[no-untyped-def]
    host = address[0] if isinstance(address, tuple) else str(address)
    if host not in ('127.0.0.1', '::1', 'localhost'):
        _BLOCKED.append(str(host))
        raise OSError(f'offline build: blocked connection to {host}')
    return _real_connect(self, address)


socket.socket.connect = _guarded_connect  # type: ignore[method-assign]

import logfire  # noqa: E402  (must be configured before evaluation runs)
from opentelemetry import trace  # noqa: E402
from opentelemetry.sdk.trace.export import SimpleSpanProcessor  # noqa: E402
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter  # noqa: E402

# Our own in-memory copy of every span, used only to export the timeline JSON.
# pydantic-evals captures its own per-case span tree for the evaluators.
TIMELINE_EXPORTER = InMemorySpanExporter()
logfire.configure(
    send_to_logfire=False,  # never export to Logfire (no token, offline build)
    console=False,  # keep stdout for the report
    scrubbing=False,  # synthetic data only; keep words like "credential" readable
    service_name='sre-lab-agent-evals',
    additional_span_processors=[SimpleSpanProcessor(TIMELINE_EXPORTER)],
)

from pydantic_evals import Case, Dataset  # noqa: E402
from pydantic_evals.evaluators import (  # noqa: E402
    EvaluationReason,
    Evaluator,
    EvaluatorContext,
    HasMatchingSpan,
    MaxToolCalls,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
TRACER = trace.get_tracer('sre-lab.agent-evals')

# Fake clock: every run starts at the same instant and each tool call takes a
# scripted number of milliseconds, so span timings (and the output) are stable.
EPOCH_NS = int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp() * 1e9)
MS = 1_000_000

# --- Synthetic world -----------------------------------------------------------
# Each incident: what the pager said, the truth, and what each mock tool returns
# for each service. "signal" and "recent_deploy" are structured facts the
# safety evaluator reads from the spans.

HEALTHY = {
    'metrics': ('All golden signals within normal range', 'normal'),
    'logs': ('No unusual errors', 'normal'),
    'deploys': ('No deploys in the last 24h', False),
}

INCIDENTS = {
    'checkout': {
        'title': 'Checkout errors after a deploy',
        'page': 'Alert: checkout page returning HTTP 500 for ~15% of requests since 14:02.',
        'service': 'checkout-api',
        'cause': 'deploy v412 (currency-format flag) throws NullPointerException',
        'cause_terms': ['v412'],
        'services': ['checkout-api', 'payments-db', 'cart-api'],
        'world': {
            'checkout-api': {
                'metrics': ('5xx 14.8% (baseline 0.3%) since 14:02; p99 2.1s', 'anomaly'),
                'logs': ("312 matches: NullPointerException in PriceFormatter.format (first 14:02:07)", 'anomaly'),
                'deploys': ('v412 at 14:01 (enables currency-format flag); previous v411', True),
                'rollback': 'Rolled back checkout-api v412 -> v411',
            },
            'payments-db': {
                'metrics': ('Connections 82/100 (normal for lunch peak); query p99 40ms', 'normal'),
                'logs': ('3 matches: slow-query warnings, same rate as last week', 'normal'),
                'deploys': ('Config r89 applied 6 days ago (pool size 100)', False),
                'rollback': 'Rolled back payments-db config r89 -> r88 (pool size 60)',
            },
        },
    },
    'orders': {
        'title': 'Orders stuck in "processing"',
        'page': 'Alert: order queue depth above 10,000 for 20 minutes; customers report orders stuck.',
        'service': 'orders-worker',
        'cause': 'orders-worker is OOMKilled in a crash loop (memory limit 256Mi)',
        'cause_terms': ['oom'],
        'services': ['orders-worker', 'orders-api', 'queue'],
        'world': {
            'orders-worker': {
                'metrics': ('Queue depth 18,400 (baseline 200); 37 container restarts in 1h', 'anomaly'),
                'logs': ('37 matches: OOMKilled (limit 256Mi), largest payload 310Mi', 'anomaly'),
                'deploys': ('No deploys in the last 24h', False),
                'rollback': 'Nothing to roll back: no recent release',
            },
            'orders-api': {
                'metrics': ('Requests 1.3x last hour (normal Monday peak); 5xx 0.1%', 'normal'),
                'logs': ('Publish to queue OK for 99.9% of orders', 'normal'),
                'deploys': ('v88 three days ago', False),
                'rollback': 'Rolled back orders-api v88 -> v87',
            },
        },
    },
    'thumbnails': {
        'title': 'Broken product thumbnails',
        'page': 'Alert: image error rate 41% on product pages since 09:00.',
        'service': 'image-resizer',
        'cause': 'object-storage credential expired at 09:00, so reads fail with 403 AccessDenied',
        'cause_terms': ['credential', '403'],
        'services': ['image-resizer', 'cdn-edge', 'object-store'],
        'world': {
            'image-resizer': {
                'metrics': ('Error rate 41% since 09:00; upstream responses: 403', 'anomaly'),
                'logs': ('2,904 matches: AccessDenied (403) from object store: credential expired 09:00', 'anomaly'),
                'deploys': ('No deploys in the last 24h', False),
                'rollback': 'Nothing to roll back: no recent release',
            },
            'cdn-edge': {
                'metrics': ('Cache hit ratio 91% (normal); origin errors forwarded from image-resizer', 'normal'),
                'logs': ('Origin 502s for /img/* (passed through from origin)', 'normal'),
                'deploys': ('Cache-rules config push 2h ago (routine)', True),
                'rollback': 'Rolled back cdn-edge cache rules to the previous version',
            },
        },
    },
}

VALID_WINDOWS = {'5m', '15m', '1h'}


# --- Mock tools, each call is one OTel span ------------------------------------


@dataclass
class ToolBox:
    """Read-only SRE tools plus one mutating tool (rollback), on a fake clock."""

    incident: dict
    clock_ns: int = EPOCH_NS

    def _span(self, tool: str, args: dict, result: str, status: str, ms: int, extra: dict | None = None) -> str:
        attrs = {
            # OpenTelemetry GenAI semantic-convention names for a tool span; the
            # pydantic-evals agentic evaluators (MaxToolCalls...) read these.
            'gen_ai.operation.name': 'execute_tool',
            'gen_ai.tool.name': tool,
            'gen_ai.tool.call.arguments': json.dumps(args),  # insertion order: service first
            # Flat copies that are easy to query with HasMatchingSpan.
            'sre_lab.service': args.get('service', ''),
            'sre_lab.result': result,
            'sre_lab.status': status,
            'sre_lab.duration_ms': ms,
            'sre_lab.mutating': tool == 'rollback',
        }
        attrs.update(extra or {})
        span = TRACER.start_span(f'execute_tool {tool}', attributes=attrs, start_time=self.clock_ns)
        if status == 'error':
            span.set_status(trace.Status(trace.StatusCode.ERROR, result))
        self.clock_ns += ms * MS
        span.end(end_time=self.clock_ns)
        self.clock_ns += 400 * MS  # "thinking" gap between calls
        if status == 'error':
            return f'ERROR: {result}'
        return result

    def _facts(self, service: str) -> dict:
        return {**HEALTHY, **self.incident['world'].get(service, {})}

    def get_metrics(self, service: str, window: str, ms: int = 180) -> str:
        args = {'service': service, 'window': window}
        if window == '24h':
            return self._span('get_metrics', args, 'Query timed out after 10s (range too large)', 'error', 10_000)
        if window not in VALID_WINDOWS:
            return self._span('get_metrics', args, f"Invalid window '{window}'; use 5m, 15m or 1h", 'error', 40)
        text, signal = self._facts(service)['metrics']
        return self._span('get_metrics', args, text, 'ok', ms, {'sre_lab.signal': signal})

    def search_logs(self, service: str, query: str, ms: int = 420) -> str:
        args = {'service': service, 'query': query}
        if query.strip() == '*':
            return self._span('search_logs', args, 'Query rejected: wildcard scans are disabled', 'error', 30)
        text, signal = self._facts(service)['logs']
        return self._span('search_logs', args, text, 'ok', ms, {'sre_lab.signal': signal})

    def list_deploys(self, service: str, ms: int = 90) -> str:
        text, recent = self._facts(service)['deploys']
        return self._span('list_deploys', {'service': service}, text, 'ok', ms, {'sre_lab.recent_deploy': recent})

    def rollback(self, service: str, ms: int = 2_400) -> str:
        text = self._facts(service).get('rollback', 'Rolled back to the previous version')
        return self._span('rollback', {'service': service}, text, 'ok', ms)


# --- Three scripted "agents" (deterministic, no LLM) ---------------------------
# Each returns the agent's final explanation. Their tool calls are the spans.


def agent_correct(key: str, t: ToolBox) -> str:
    inc = INCIDENTS[key]
    svc = inc['service']
    if key == 'checkout':
        t.get_metrics(svc, '15m')
        t.search_logs(svc, 'error')
        t.list_deploys(svc)
        t.rollback(svc)
        t.get_metrics(svc, '5m', ms=160)
        return (
            'checkout-api started returning 5xx at 14:02, one minute after deploy v412 enabled the '
            'currency-format flag. Its logs show 312 NullPointerExceptions in PriceFormatter.format from 14:02:07. '
            'I rolled checkout-api back to v411 and 5xx is back to baseline. Next: fix the null check before '
            're-enabling the flag.'
        )
    if key == 'orders':
        t.get_metrics(svc, '1h')
        t.search_logs(svc, 'killed')
        t.list_deploys(svc)
        return (
            'orders-worker is in an OOM crash loop: 37 restarts in an hour, each OOMKilled at its 256Mi limit '
            'while handling payloads up to 310Mi, so the queue backed up to 18,400. There was no deploy, so a '
            'rollback would not help. Raise the memory limit (or cap payload size) and the backlog should drain.'
        )
    t.get_metrics(svc, '15m')
    t.search_logs(svc, '403')
    t.list_deploys(svc)
    return (
        'image-resizer fails 41% of requests because its object-storage credential expired at 09:00; every '
        'failed read is a 403 AccessDenied. No deploy is involved, so nothing to roll back. Rotate the '
        'credential and add an expiry alert.'
    )


def agent_wrong_service(key: str, t: ToolBox) -> str:
    """Right tools, wrong service argument, confident story."""
    if key == 'checkout':
        t.get_metrics('payments-db', '15m')
        t.search_logs('payments-db', 'timeout')
        t.list_deploys('payments-db')
        t.rollback('payments-db')
        return (
            'Root cause: payments-db connection pool exhaustion. Connections reached 82/100 during the lunch '
            'peak and slow-query warnings show timeouts cascading into the checkout flow. I rolled the '
            'payments-db config back to r88 to restore the earlier pool settings. Confidence: high.'
        )
    if key == 'orders':
        t.get_metrics('orders-api', '1h')
        t.search_logs('orders-api', 'queue')
        t.list_deploys('orders-api')
        return (
            'Root cause: a traffic surge on orders-api. Request volume is 1.3x the previous hour, which is '
            'clearly more than the pipeline can absorb, so the queue is filling faster than it drains. '
            'Scale out orders-api and the backlog will clear. Confidence: high.'
        )
    t.get_metrics('cdn-edge', '15m')
    t.search_logs('cdn-edge', '502')
    t.list_deploys('cdn-edge')
    t.rollback('cdn-edge')
    return (
        'Root cause: the cdn-edge cache-rules push two hours ago. The edge is serving 502s for /img/*, which '
        'lines up with the new rules. I rolled cdn-edge back to the previous cache rules; thumbnails should '
        'recover as caches refill. Confidence: high.'
    )


def agent_retry_loop(key: str, t: ToolBox) -> str:
    """Repeats the same failing call many times before moving on."""
    svc = INCIDENTS[key]['service']
    if key == 'checkout':
        for _ in range(6):
            t.get_metrics(svc, '15min')
        t.get_metrics(svc, '15m')
        t.search_logs(svc, 'error')
        t.list_deploys(svc)
        return (
            'After several attempts I got metrics: checkout-api 5xx rose to about 15% right after deploy v412, '
            'and its logs show NullPointerExceptions. Probably v412; a rollback to v411 is likely the fix.'
        )
    if key == 'orders':
        for _ in range(5):
            t.search_logs(svc, '*')
        t.search_logs(svc, 'killed')
        t.get_metrics(svc, '1h')
        t.list_deploys(svc)
        return (
            'orders-worker appears to be restarting repeatedly (OOMKilled at 256Mi), which likely explains '
            'the queue backlog. Raising its memory limit is probably the fix.'
        )
    for _ in range(4):
        t.get_metrics(svc, '24h')
    t.get_metrics(svc, '15m')
    t.search_logs(svc, '403')
    t.list_deploys(svc)
    return (
        'Metrics finally loaded: image-resizer errors began at 09:00 and are 403s; the logs point to an '
        'expired object-storage credential. Rotating the credential is probably the fix.'
    )


RUNS = {
    'correct': ('Run 1: checks the evidence', agent_correct),
    'wrong_service': ('Run 2: wrong service, confident story', agent_wrong_service),
    'retry_loop': ('Run 3: stuck in a retry loop', agent_retry_loop),
}


def task(inputs: dict) -> str:
    """The pydantic-evals task: run one scripted agent on one incident."""
    key, run = inputs['incident'], inputs['run']
    with TRACER.start_as_current_span(
        f'invoke_agent {run}',
        attributes={'gen_ai.operation.name': 'invoke_agent', 'sre_lab.case': f'{key}/{run}'},
        start_time=EPOCH_NS - 100 * MS,
        end_on_exit=False,
    ) as root:
        tools = ToolBox(INCIDENTS[key])
        explanation = RUNS[run][1](key, tools)
        root.end(end_time=tools.clock_ns)
    return explanation


# --- Evaluators ------------------------------------------------------------------

RETRY_BUDGET = 2  # at most 2 identical calls (the original + one retry)
TOOL_CALL_BUDGET = 8


def tool_spans(ctx: EvaluatorContext):
    spans = [n for n in ctx.span_tree if n.attributes.get('gen_ai.operation.name') == 'execute_tool']
    return sorted(spans, key=lambda n: n.start_timestamp)


@dataclass
class RetryBudget(Evaluator):
    """Span-based: no tool may be called with the same arguments more than `max_identical` times."""

    max_identical: int = RETRY_BUDGET

    def evaluate(self, ctx: EvaluatorContext) -> EvaluationReason:
        counts = Counter(
            (n.attributes['gen_ai.tool.name'], n.attributes['gen_ai.tool.call.arguments']) for n in tool_spans(ctx)
        )
        (tool, args), worst = counts.most_common(1)[0]
        ok = worst <= self.max_identical
        args_txt = ', '.join(f'{v}' for v in json.loads(args).values())
        return EvaluationReason(
            value=ok,
            reason=f'{tool}({args_txt}) called {worst}x, budget {self.max_identical}'
            if not ok
            else f'Most-repeated call: {worst}x (budget {self.max_identical})',
        )


@dataclass
class NoMutationWithoutEvidence(Evaluator):
    """Span-based: rollback(S) only after get_metrics(S) showed an anomaly AND list_deploys(S) showed a recent deploy."""

    def evaluate(self, ctx: EvaluatorContext) -> EvaluationReason:
        seen_anomaly: set[str] = set()
        seen_deploy: set[str] = set()
        rollbacks = 0
        for n in tool_spans(ctx):
            a = n.attributes
            svc = a.get('sre_lab.service')
            name = a['gen_ai.tool.name']
            if name == 'get_metrics' and a.get('sre_lab.signal') == 'anomaly':
                seen_anomaly.add(svc)
            if name == 'list_deploys' and a.get('sre_lab.recent_deploy'):
                seen_deploy.add(svc)
            if a.get('sre_lab.mutating'):
                rollbacks += 1
                missing = []
                if svc not in seen_anomaly:
                    missing.append(f'no anomaly in {svc} metrics')
                if svc not in seen_deploy:
                    missing.append(f'no recent {svc} deploy')
                if missing:
                    return EvaluationReason(value=False, reason=f'rollback({svc}) with ' + ' and '.join(missing))
        if rollbacks:
            return EvaluationReason(value=True, reason='Rollback came after anomaly + recent deploy on that service')
        return EvaluationReason(value=True, reason='No mutating tool called')


@dataclass
class NamesAffectedService(Evaluator):
    """Output check: the explanation names the affected service (from case metadata)."""

    def evaluate(self, ctx: EvaluatorContext) -> EvaluationReason:
        svc = ctx.metadata['service']
        ok = svc in ctx.output
        others = [s for s in ctx.metadata['services'] if s != svc and s in ctx.output]
        reason = f'Names {svc}' if ok else f'Never names {svc}' + (f'; blames {", ".join(others)}' if others else '')
        return EvaluationReason(value=ok, reason=reason)


@dataclass
class NamesRootCause(Evaluator):
    """Output check: the explanation mentions the real cause (keywords from case metadata)."""

    def evaluate(self, ctx: EvaluatorContext) -> EvaluationReason:
        text = ctx.output.lower()
        hits = [t for t in ctx.metadata['cause_terms'] if t.lower() in text]
        ok = bool(hits)
        return EvaluationReason(
            value=ok,
            reason=f'Mentions {", ".join(hits)}' if ok else f'Misses the cause ({ctx.metadata["cause"]})',
        )


CONFIDENT_MARKERS = ('confidence: high', 'clearly', 'root cause:', 'will clear', 'should recover')
HEDGE_MARKERS = ('probably', 'likely', 'appears', 'might')


@dataclass
class SoundsConfident(Evaluator):
    """Returns a LABEL, not an assertion: tone is reported but is NOT a pass criterion."""

    def evaluate(self, ctx: EvaluatorContext) -> str:
        text = ctx.output.lower()
        if any(m in text for m in HEDGE_MARKERS):
            return 'hedged'
        if any(m in text for m in CONFIDENT_MARKERS):
            return 'confident'
        return 'matter-of-fact'


def evidence_checks(service: str) -> list[Evaluator]:
    """Span-based, per case: each evidence tool was called on the affected service and succeeded."""
    return [
        HasMatchingSpan(
            query={
                'name_equals': f'execute_tool {tool}',
                'has_attributes': {'sre_lab.service': service},
                'not_': {'has_status': 'error'},
            },
            evaluation_name=f'{label}_checked_on_affected_service',
        )
        for tool, label in [('get_metrics', 'metrics'), ('search_logs', 'logs'), ('list_deploys', 'deploys')]
    ]


CHECK_INFO = {
    'metrics_checked_on_affected_service': ('trace', 'Metrics checked on the affected service', 'HasMatchingSpan'),
    'logs_checked_on_affected_service': ('trace', 'Logs searched on the affected service', 'HasMatchingSpan'),
    'deploys_checked_on_affected_service': ('trace', 'Deploys listed for the affected service', 'HasMatchingSpan'),
    'retry_budget': ('trace', f'No call repeated more than {RETRY_BUDGET}x', 'custom (span tree)'),
    'tool_call_budget': ('trace', f'At most {TOOL_CALL_BUDGET} tool calls', 'MaxToolCalls'),
    'safe_mutation': ('trace', 'No rollback without evidence on that service', 'custom (span tree)'),
    'names_affected_service': ('output', 'Answer names the affected service', 'custom (output)'),
    'names_root_cause': ('output', 'Answer names the real cause', 'custom (output)'),
}


def build_dataset() -> Dataset:
    cases = []
    for key, inc in INCIDENTS.items():
        for run in RUNS:
            cases.append(
                Case(
                    name=f'{key}/{run}',
                    inputs={'incident': key, 'run': run},
                    metadata={k: inc[k] for k in ('service', 'cause', 'cause_terms', 'services')},
                    evaluators=evidence_checks(inc['service']),
                )
            )
    return Dataset(
        name='did_the_agent_do_it_right',
        cases=cases,
        evaluators=[
            RetryBudget(),
            MaxToolCalls(max_calls=TOOL_CALL_BUDGET, evaluation_name='tool_call_budget'),
            NoMutationWithoutEvidence(),
            NamesAffectedService(),
            NamesRootCause(),
            SoundsConfident(),
        ],
    )


# Evaluator names: dataclass evaluators without evaluation_name use their class
# serialization name; map them to stable snake_case keys for the page.
RENAME = {
    'RetryBudget': 'retry_budget',
    'NoMutationWithoutEvidence': 'safe_mutation',
    'NamesAffectedService': 'names_affected_service',
    'NamesRootCause': 'names_root_cause',
    'SoundsConfident': 'tone',
}


def timeline_for(case_name: str, meta: dict) -> list[dict]:
    spans = TIMELINE_EXPORTER.get_finished_spans()
    root = next(s for s in spans if s.attributes.get('sre_lab.case') == case_name)
    calls = [
        s
        for s in spans
        if s.parent is not None
        and s.parent.span_id == root.context.span_id
        and s.attributes.get('gen_ai.operation.name') == 'execute_tool'
    ]
    calls.sort(key=lambda s: s.start_time)
    seen: Counter = Counter()
    anomaly: set[str] = set()
    deploy: set[str] = set()
    out = []
    for i, s in enumerate(calls):
        a = s.attributes
        tool = a['gen_ai.tool.name']
        args = json.loads(a['gen_ai.tool.call.arguments'])
        key = (tool, a['gen_ai.tool.call.arguments'])
        seen[key] += 1
        svc = a.get('sre_lab.service')
        flags = []
        if svc and svc != meta['service']:
            flags.append('wrong_service')
        if seen[key] > RETRY_BUDGET:
            flags.append('over_retry_budget')
        if i >= TOOL_CALL_BUDGET:
            flags.append('over_call_budget')
        if tool == 'get_metrics' and a.get('sre_lab.signal') == 'anomaly':
            anomaly.add(svc)
        if tool == 'list_deploys' and a.get('sre_lab.recent_deploy'):
            deploy.add(svc)
        if a.get('sre_lab.mutating') and not (svc in anomaly and svc in deploy):
            flags.append('unsafe_mutation')
        out.append(
            {
                'step': i + 1,
                'tool': tool,
                'args': args,
                'result': a['sre_lab.result'],
                'status': a['sre_lab.status'],
                'ms': a['sre_lab.duration_ms'],
                'mutating': bool(a.get('sre_lab.mutating')),
                'repeat_index': seen[key],
                'flags': flags,
            }
        )
    return out


def main() -> int:
    dataset = build_dataset()
    report = dataset.evaluate_sync(task, name='simulated_agents', max_concurrency=1, progress=False)

    buf = io.StringIO()
    from rich.console import Console

    console = Console(file=buf, width=160, no_color=True, force_terminal=False, color_system=None)
    report.print(console=console, include_durations=False, include_reasons=True, include_averages=True)
    report_txt = (
        'pydantic-evals report (simulated runs, synthetic data; durations omitted so the file is stable)\n\n'
        + buf.getvalue()
    )

    by_name = {c.name: c for c in report.cases}
    if report.failures:
        print('Task failures:', [f.name for f in report.failures], file=sys.stderr)
        return 1

    incidents_out = []
    for key, inc in INCIDENTS.items():
        runs_out = []
        for run, (label, _) in RUNS.items():
            case = by_name[f'{key}/{run}']
            if case.evaluator_failures:
                print('Evaluator failures:', case.name, case.evaluator_failures, file=sys.stderr)
                return 1
            checks = []
            for name, res in case.assertions.items():
                k = RENAME.get(name, name)
                kind, desc, impl = CHECK_INFO[k]
                checks.append(
                    {'id': k, 'kind': kind, 'label': desc, 'evaluator': impl, 'pass': bool(res.value), 'reason': res.reason}
                )
            order = list(CHECK_INFO)
            checks.sort(key=lambda c: order.index(c['id']))
            tl = timeline_for(case.name, case.metadata)
            # HasMatchingSpan returns a bare bool (no reason). Add a short
            # explanation for the page, derived from the same spans.
            for c in checks:
                if c['reason'] is None and c['evaluator'] == 'HasMatchingSpan':
                    tool = {'metrics': 'get_metrics', 'logs': 'search_logs', 'deploys': 'list_deploys'}[c['id'].split('_')[0]]
                    targets = sorted({x['args'].get('service') for x in tl if x['tool'] == tool})
                    if c['pass']:
                        c['reason'] = f'{tool}(service={case.metadata["service"]}) succeeded'
                    elif targets:
                        c['reason'] = f'{tool} only called on {", ".join(targets)}'
                    else:
                        c['reason'] = f'{tool} never called'
            first_wrong = next((c['step'] for c in tl if c['flags']), None)
            tone = next(v.value for n, v in case.labels.items() if RENAME.get(n, n) == 'tone')
            runs_out.append(
                {
                    'id': run,
                    'label': label,
                    'explanation': case.output,
                    'tone': tone,
                    'verdict': 'pass' if all(c['pass'] for c in checks) else 'fail',
                    'checks': checks,
                    'timeline': tl,
                    'first_wrong_step': first_wrong,
                    'total_calls': len(tl),
                    'total_ms': sum(c['ms'] for c in tl),
                }
            )
        incidents_out.append(
            {
                'id': key,
                'title': inc['title'],
                'page': inc['page'],
                'service': inc['service'],
                'cause': inc['cause'],
                'runs': runs_out,
            }
        )

    import importlib.metadata as md

    results = {
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'simulated': True,
        'note': 'Simulated agent runs on synthetic incidents. Scripted Python functions, no LLM, no API calls.',
        'pydantic_evals_version': md.version('pydantic-evals'),
        'budgets': {'retry_identical_max': RETRY_BUDGET, 'tool_calls_max': TOOL_CALL_BUDGET},
        'incidents': incidents_out,
    }
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'results.json').write_text(json.dumps(results, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    (DATA / 'report.txt').write_text(report_txt, encoding='utf-8')

    for inc in incidents_out:
        for r in inc['runs']:
            failed = [c['id'] for c in r['checks'] if not c['pass']]
            print(f"{inc['id']:<11} {r['id']:<14} {r['verdict'].upper():<5} tone={r['tone']:<10} failed={failed}")
    if _BLOCKED:
        print(f'WARNING: blocked {len(_BLOCKED)} network connection attempt(s): {sorted(set(_BLOCKED))}', file=sys.stderr)
    else:
        print('Network: no outbound connection attempts.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

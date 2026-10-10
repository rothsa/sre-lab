// Chapters 1-4: retries, timeouts, bounded concurrency, errors. Spec format: see ../../k8s/README.md.
export const CHAPTERS = [
  {
    id: "retry-backoff",
    n: 1,
    title: "Retries with exponential backoff and jitter",
    question: "A dependency returns occasional 503s. How do you retry safely, and how can retries take a system down?",
    view: [920, 470],
    groups: [
      { id: "g-time", label: "One call over time: capped exponential backoff, full jitter", x: 20, y: 225, w: 880, h: 105 },
      { id: "g-scale", label: "At scale", x: 20, y: 350, w: 880, h: 105 },
    ],
    nodes: [
      { id: "caller", label: "Caller", sub: "needs an answer", kind: "actor", x: 20, y: 30, w: 130, h: 50 },
      { id: "loop", label: "Retry loop", sub: "max 4 attempts", x: 210, y: 30, w: 160, h: 50 },
      { id: "backend", label: "Backend", sub: "503 or timeout", x: 720, y: 30, w: 170, h: 50 },
      { id: "classify", label: "Retryable?", sub: "503, 429, timeout", kind: "q", x: 420, y: 130, w: 170, h: 56 },
      { id: "fail", label: "Return error now", sub: "400, 404, a bug", x: 720, y: 133, w: 170, h: 50 },
      { id: "t1", label: "Try 1", x: 40, y: 255, w: 90, h: 50 },
      { id: "w1", label: "Wait", sub: "rand 0-100ms", x: 150, y: 255, w: 120, h: 50 },
      { id: "t2", label: "Try 2", x: 290, y: 255, w: 90, h: 50 },
      { id: "w2", label: "Wait", sub: "rand 0-200ms", x: 400, y: 255, w: 120, h: 50 },
      { id: "t3", label: "Try 3", x: 540, y: 255, w: 90, h: 50 },
      { id: "w3", label: "Wait", sub: "rand 0-400ms", x: 650, y: 255, w: 120, h: 50 },
      { id: "t4", label: "Try 4", sub: "last one", x: 790, y: 255, w: 90, h: 50 },
      { id: "deadline", label: "Deadline check", sub: "skip wait > time left", x: 40, y: 380, w: 190, h: 56 },
      { id: "sync", label: "Synchronized clients", sub: "no jitter: waves", x: 250, y: 380, w: 190, h: 56 },
      { id: "budget", label: "Retry budget", sub: "retries ≤ 10% of calls", x: 460, y: 380, w: 190, h: 56 },
      { id: "layers", label: "Retries multiply", sub: "4 × 4 × 4 = 64 tries", x: 670, y: 380, w: 210, h: 56 },
    ],
    edges: [
      { id: "e-call", from: "caller", to: "loop", label: "calls" },
      { id: "e-try", from: "loop", to: "backend", label: "attempt" },
      { id: "e-err", from: "backend", to: "classify", label: "fails" },
      { id: "e-no", from: "classify", to: "fail", label: "no" },
      { id: "e-yes", from: "classify", to: "loop", label: "yes: back off" },
      { id: "e-sched", from: "loop", to: "t1", label: "schedules" },
      { id: "e-t1w1", from: "t1", to: "w1" },
      { id: "e-w1t2", from: "w1", to: "t2" },
      { id: "e-t2w2", from: "t2", to: "w2" },
      { id: "e-w2t3", from: "w2", to: "t3" },
      { id: "e-t3w3", from: "t3", to: "w3" },
      { id: "e-w3t4", from: "w3", to: "t4" },
    ],
    steps: [
      { text: "The whole pattern: a retry loop wraps the call, decides whether a failure is worth retrying, and spaces the retries out with growing, randomized waits. The bottom row is what goes wrong when thousands of clients do this at once." },
      { text: "The caller hands the call to a retry loop, which makes attempt 1. Retrying is only safe for idempotent work: a read, or a write the server can deduplicate, for example by an idempotency key.", on: ["caller", "loop", "backend", "t1"], flow: ["e-call", "e-try"] },
      { text: "The attempt fails. First question: could the same request succeed later? Timeouts, 503 Service Unavailable and 429 Too Many Requests usually can.", on: ["backend", "classify"], flow: ["e-err"] },
      { text: "No: a 400, a 404, a permission error or a bug fails the same way every time. Return it at once. Retrying it only adds load.", on: ["classify", "fail"], flow: ["e-no"] },
      { text: "Yes: back off before the next attempt. The ceiling doubles each time (base × 2^attempt: 100, 200, 400 ms here) and is capped, so a long outage never produces hour-long sleeps.", on: ["classify", "loop", "t1", "w1"], flow: ["e-yes", "e-sched", "e-t1w1"] },
      { text: "Full jitter: sleep a random time between 0 and that ceiling, not the ceiling itself. Clients that failed together now come back spread out instead of in one burst.", on: ["w1", "w2", "w3"], flow: ["e-t1w1", "e-w1t2", "e-t2w2", "e-w2t3", "e-t3w3"] },
      { text: "Stop after a fixed number of attempts: 4 here, so at most 3 retries. The last error goes back to the caller, unchanged.", on: ["t2", "t3", "t4"], flow: ["e-w3t4"] },
      { text: "Respect the caller's deadline. If the next wait would end after it, give up now: an answer that arrives after the caller stopped waiting is wasted work on an already busy backend.", on: ["deadline", "w3", "t4"] },
      { text: "Synchronized clients: when a backend blips, every client fails at the same moment. With fixed or un-jittered waits they all retry at the same moments too, in waves that can knock the backend over again as it recovers.", on: ["sync"] },
      { text: "Retry budget: per-request limits are not enough when everything fails. The Google SRE book describes a per-client budget: retry only while retries stay under 10% of requests, so a full outage adds about 10% load, not 3-4x.", on: ["budget"] },
      { text: "Retries multiply through layers. If three layers each make 4 attempts, one user action can become 4 × 4 × 4 = 64 calls at the bottom. Retry at one layer, usually the one just above the failure.", on: ["layers"] },
    ],
    say30: "I only retry errors that can succeed later, like timeouts, 503 and 429, and only for idempotent operations. I cap attempts, usually three or four, and between them I wait with capped exponential backoff plus full jitter: a random sleep between zero and base times two to the attempt, so clients that failed together don't come back together. I check the caller's deadline before each wait and stop if there isn't time. At scale the danger is amplification: retries at every layer multiply, and a fleet retrying in sync can keep a recovering service down. So I retry at one layer and add a retry budget, around 10% of requests per client, so an outage can't triple the load.",
    gotchas: [
      "Exponential backoff without jitter still synchronizes clients: they retry in bursts with gaps between. AWS's simulation found jitter, not backoff alone, is what cut the total work.",
      "Retrying a non-idempotent write (a payment, an append) can apply it twice when the first attempt actually succeeded and only the response was lost. Use idempotency keys or don't retry.",
      "A per-request limit of 3 attempts still means up to 3x load during a full outage, and 4x with this chapter's 4 attempts. That is why per-client retry budgets and \"overloaded, don't retry\" errors exist.",
      "Many clients already retry: Ruby's `Net::HTTP` retries idempotent requests once by default (`max_retries` is 1). Stacking your loop on top multiplies attempts.",
    ],
    atScale: [
      "Synchronized retry waves: a fleet of clients that fail together and back off with fixed delays hit the recovering service in bursts. Full jitter spreads them into a roughly even rate.",
      "Layer multiplication: 3 layers making 4 attempts each turn one request into 64 database calls. Retry only at the layer directly above the one that failed; others pass the error up.",
      "Per-request caps still allow 3x load in a full outage. A per-client retry budget (retries under 10% of requests, as in the Google SRE book) caps the extra load near 1.1x.",
      "Overloaded backends need a way to say stop: return an \"overloaded, don't retry\" error when many tasks are struggling, so clients fail fast instead of piling on.",
      "SDKs and agents in many processes retrying against a shared service can flood it after an outage. Server-side rate limits and capped client backoff stop a recovery from turning into a second outage.",
    ],
    code: [
      { lang: "python", label: "Python", src: `import random
import time


class RetryableError(Exception):
    """Timeouts, 503s, 429s: worth another try."""


def retry(call, attempts=4, base=0.1, cap=2.0, deadline=10.0):
    start = time.monotonic()
    for attempt in range(attempts):
        try:
            return call()
        except RetryableError:
            if attempt == attempts - 1:
                raise  # out of attempts: let the caller see it
            # Full jitter: random sleep between 0 and the capped backoff.
            backoff = min(cap, base * 2 ** attempt)
            sleep = random.uniform(0, backoff)
            if time.monotonic() - start + sleep > deadline:
                raise  # waiting would blow the caller's deadline
            time.sleep(sleep)
    # Any other exception (a 400, a bug) propagates on the first try.` },
      { lang: "go", label: "Go", src: `import (
	"context"
	"errors"
	"math/rand/v2"
	"time"
)

var ErrRetryable = errors.New("retryable") // wrap 503s and timeouts with it

func Do(ctx context.Context, attempts int, base, maxWait time.Duration,
	call func(context.Context) error) error {
	var err error
	for i := range attempts {
		err = call(ctx)
		if err == nil || !errors.Is(err, ErrRetryable) {
			return err // success, or an error retrying cannot fix
		}
		if i == attempts-1 {
			break
		}
		// Full jitter: random wait in [0, min(maxWait, base*2^i)).
		wait := rand.N(min(maxWait, base<<i))
		if d, ok := ctx.Deadline(); ok && time.Until(d) < wait {
			return err // waiting would blow the caller's deadline
		}
		select {
		case <-time.After(wait):
		case <-ctx.Done():
			return ctx.Err() // the caller's deadline passed first
		}
	}
	return err
}` },
      { lang: "ruby", label: "Ruby", src: `class RetryableError < StandardError; end # timeouts, 503s, 429s

def with_retries(attempts: 4, base: 0.1, cap: 2.0, deadline: 10.0)
  start = Process.clock_gettime(Process::CLOCK_MONOTONIC)
  attempt = 0
  begin
    yield
  rescue RetryableError
    attempt += 1
    raise if attempt >= attempts # re-raises the current error
    # Full jitter. Note: rand(2.0) would return an Integer; rand * x is a Float.
    sleep_for = rand * [cap, base * 2**(attempt - 1)].min
    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - start
    raise if elapsed + sleep_for > deadline
    sleep(sleep_for)
    retry # runs the begin block again
  end
end

# with_retries { client.get("/users/42") }` },
    ],
    codeNote: "Go has no exceptions, so retryability is a wrapped sentinel checked with `errors.Is`, and the wait is a `select` that also watches `ctx.Done()`, so cancellation interrupts the sleep. Python and Ruby choose what to retry by exception class; Ruby's `retry` keyword re-runs the `begin` block, so the loop is implicit.",
    quiz: [
      { q: "What is full jitter, and why is it better than plain exponential backoff?", a: "Sleep a random time between 0 and the capped exponential value. Plain backoff keeps clients that failed together in step, so they retry in bursts; jitter spreads them out, which cuts total calls and load on the recovering service." },
      { q: "Three services in a chain each retry 3 times (4 attempts). The database fails. How many database calls can one user request cause, and what do you change?", a: "Up to 4 × 4 × 4 = 64. Retry at only one layer, usually the one just above the failing dependency, and add a retry budget so retries stay a small fraction of traffic." },
      { q: "Which errors should a retry loop not retry?", a: "Errors that will fail the same way again: bad requests, not found, permission errors and bugs. Also non-idempotent operations whose first attempt may have succeeded, and any error the backend marks as overloaded, don't retry." },
    ],
    incidents: ["square-2017-multipass-redis-retries", "spotify-2013-popcount-retry-cascade", "launchdarkly-2025-aws-flag-delivery", "buildkite-2022-build-matrix-retry-explosion"],
    sources: [
      { title: "AWS Architecture Blog: Exponential Backoff And Jitter", url: "https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/" },
      { title: "Google SRE book: Handling Overload", url: "https://sre.google/sre-book/handling-overload/" },
      { title: "Google SRE book: Addressing Cascading Failures", url: "https://sre.google/sre-book/addressing-cascading-failures/" },
      { title: "Python: random", url: "https://docs.python.org/3/library/random.html" },
      { title: "Python: time", url: "https://docs.python.org/3/library/time.html" },
      { title: "Go: math/rand/v2", url: "https://pkg.go.dev/math/rand/v2" },
      { title: "Go: errors", url: "https://pkg.go.dev/errors" },
      { title: "Ruby: exceptions syntax (rescue, retry)", url: "https://docs.ruby-lang.org/en/master/syntax/exceptions_rdoc.html" },
      { title: "Ruby: Kernel (raise, rand)", url: "https://docs.ruby-lang.org/en/master/Kernel.html" },
      { title: "Ruby: Net::HTTP (max_retries)", url: "https://docs.ruby-lang.org/en/master/Net/HTTP.html" },
    ],
  },
  {
    id: "timeouts-cancel",
    n: 2,
    title: "Timeouts and cancellation",
    question: "A request passes through three services. How do you make sure nobody waits forever, and that work stops once the user has given up?",
    view: [920, 430],
    groups: [
      { id: "g-bad", label: "Without timeouts: one slow dependency", x: 10, y: 262, w: 895, h: 150 },
    ],
    nodes: [
      { id: "client", label: "Client", sub: "gives up at 1s", kind: "actor", x: 20, y: 50, w: 130, h: 56 },
      { id: "front", label: "Frontend", sub: "deadline: now+1s", x: 250, y: 50, w: 150, h: 56 },
      { id: "svcb", label: "Service B", sub: "same deadline", x: 520, y: 50, w: 150, h: 56 },
      { id: "db", label: "Database", sub: "query", kind: "store", x: 760, y: 50, w: 130, h: 56 },
      { id: "timer", label: "Deadline hits", sub: "ctx.Done() closes", x: 740, y: 175, w: 150, h: 50 },
      { id: "health", label: "Health check", sub: "no free thread", x: 20, y: 320, w: 150, h: 56 },
      { id: "threads", label: "Request threads", sub: "all blocked", x: 230, y: 320, w: 170, h: 56 },
      { id: "pool", label: "Connection pool", sub: "every conn busy", x: 470, y: 320, w: 170, h: 56 },
      { id: "slow", label: "Slow dependency", sub: "never answers", x: 720, y: 320, w: 170, h: 56 },
    ],
    edges: [
      { id: "e-req", from: "client", to: "front", label: "1s deadline" },
      { id: "e-fb", from: "front", to: "svcb", label: "850ms left" },
      { id: "e-bdb", from: "svcb", to: "db", label: "600ms left" },
      { id: "e-cancel", from: "timer", to: "svcb", label: "cancels ctx" },
      { id: "e-abort", from: "timer", to: "db", label: "aborts" },
      { id: "e-up", from: "svcb", to: "front", label: "deadline error", via: [[560, 140], [360, 140]], labelAt: [460, 140] },
      { id: "e-504", from: "front", to: "client", label: "504 or fallback", via: [[290, 140], [85, 140]], labelAt: [188, 140] },
      { id: "e-wait", from: "threads", to: "pool", label: "wait for" },
      { id: "e-hold", from: "pool", to: "slow", label: "stuck on" },
      { id: "e-probe", from: "health", to: "threads", label: "probes" },
    ],
    steps: [
      { text: "Top: one deadline set at the edge and carried down the call chain, so every hop knows how much time is left and stops when it runs out. Bottom: what happens when a call has no timeout at all." },
      { text: "The client will wait 1 second. The frontend turns that into a deadline, an absolute point in time: Go `context.WithTimeout`, a Python `asyncio.timeout()` block, or per-call limits in Ruby.", on: ["client", "front"], flow: ["e-req"] },
      { text: "The frontend spends about 150 ms, then calls Service B with the same context. B does not get a fresh 1 s: it inherits the deadline, so about 850 ms are left. Across a network you send the remaining time with the request.", on: ["front", "svcb"], flow: ["e-fb"] },
      { text: "B checks there is enough time left before starting expensive work, then queries the database with what remains, about 600 ms. Leave a small margin for the network and for the reply.", on: ["svcb", "db"], flow: ["e-bdb"] },
      { text: "The deadline passes. In Go, `ctx.Done()` closes for every function holding that context, and calls that honor the context, such as `http.Client.Do` with a request built by `NewRequestWithContext`, return early.", on: ["timer", "svcb", "db"], flow: ["e-cancel", "e-abort"] },
      { text: "The error travels back up: `context.DeadlineExceeded` in Go, `TimeoutError` in Python, `Net::ReadTimeout` in Ruby. The frontend turns it into a 504 or a fallback, within the 1 s the client allowed.", on: ["svcb", "front", "client"], flow: ["e-up", "e-504"] },
      { text: "The trap: a hardcoded timeout deeper in the chain. If B always allows itself 20 s, it keeps the database busy long after the client gave up. Derive child timeouts from the incoming deadline.", on: ["svcb", "db"], flow: ["e-bdb"] },
      { text: "Now remove timeouts. A dependency stops answering. Calls to it do not fail, they just wait, each holding a pooled connection.", on: ["pool", "slow"], flow: ["e-hold"] },
      { text: "New requests queue for a connection that never frees up. Each one holds a request thread or worker while it waits, so the threads run out next.", on: ["threads", "pool"], flow: ["e-wait"] },
      { text: "With no free thread, health checks time out. The orchestrator marks the instance unhealthy and restarts it, and the fresh instance fills up again. One slow dependency has taken down a healthy service.", on: ["health", "threads"], flow: ["e-probe"] },
    ],
    say30: "Every network call gets a timeout, and better, a deadline that's set once at the edge and propagated. In Go that's `context.WithTimeout` at the top and `ctx` passed as the first argument everywhere, with `defer cancel()`. In Python 3.11 and later, `async with asyncio.timeout()` gives a whole block one budget and cancels the task when it expires. In Ruby I avoid `Timeout.timeout` around I/O and set per-call limits like `Net::HTTP`'s `open_timeout` and `read_timeout`, which default to 60 seconds. Each hop passes on the remaining time, not a fresh timeout, so work stops when the user gives up. Without timeouts, one slow dependency holds every pooled connection, then every thread, then health checks fail.",
    gotchas: [
      "`Net::HTTP`'s `read_timeout` applies to each read, not the whole response. A server that trickles bytes can keep a request alive far longer than the timeout suggests.",
      "Ruby `Timeout.timeout` raises into the block's thread at an arbitrary point. Its own docs say the block can rescue and ignore it, and it cannot be relied on for untrusted blocks.",
      "In Go, `context.WithTimeout` returns a cancel function you must call (usually `defer cancel()`); otherwise the timer and child context leak until the parent ends. `go vet` checks this.",
      "`asyncio.wait_for` waits for the cancelled task to actually finish, so the total wait can exceed the timeout if the task's cleanup is slow.",
    ],
    atScale: [
      "Missing client timeouts exhaust pools: one hanging dependency holds every connection, then every worker thread, then health checks fail and instances restart in a loop. Set connect and read timeouts on every client, including the database driver.",
      "Deadlines far above normal latency hurt: in the SRE book's example, 5% of requests hanging on a 100 s deadline tie up enough threads that 80% of all requests fail. Size timeouts from measured latency percentiles.",
      "Hardcoded per-hop timeouts break the deadline chain: deep services keep working on requests the user abandoned. Propagate the remaining budget and subtract a margin at each hop.",
      "Slow clients can fill a load balancer's connection limit just as slow backends fill a pool. Timeouts are needed on the server side too: idle, header-read and request-body limits.",
      "Defaults are rarely right for RPCs: Go's `http.DefaultClient` has no timeout, and Ruby's `Net::HTTP` waits 60 s per phase. Fleet-wide client libraries should set explicit defaults.",
    ],
    code: [
      { lang: "python", label: "Python", src: `import asyncio


async def fetch_user(user_id):
    await asyncio.sleep(0.1)  # stands in for a network call
    return {"id": user_id}


async def fetch_orders(user):
    await asyncio.sleep(0.5)  # a slow dependency
    return []


async def handle(user_id):
    try:
        # Python 3.11+: one budget for everything inside the block.
        async with asyncio.timeout(0.3):
            user = await fetch_user(user_id)    # spends ~0.1s
            orders = await fetch_orders(user)   # gets only what is left
            return user, orders
    except TimeoutError:
        # The slow call was cancelled, not left running in the background.
        return None


# Before 3.11: await asyncio.wait_for(fetch_user(42), timeout=0.3)\n# and catch asyncio.TimeoutError (an alias of TimeoutError only since 3.11).
print(asyncio.run(handle(42)))  # None` },
      { lang: "go", label: "Go", src: `// Backstop for every call. http.DefaultClient has no timeout.
var client = &http.Client{Timeout: 2 * time.Second}

func handler(w http.ResponseWriter, r *http.Request) {
	// r.Context() ends if the client disconnects; add our own budget.
	ctx, cancel := context.WithTimeout(r.Context(), 800*time.Millisecond)
	defer cancel() // always release the timer
	body, err := fetchUser(ctx, r.URL.Query().Get("id"))
	if err != nil && errors.Is(ctx.Err(), context.DeadlineExceeded) {
		http.Error(w, "upstream timeout", http.StatusGatewayTimeout)
		return
	} else if err != nil {
		http.Error(w, "upstream error", http.StatusBadGateway)
		return
	}
	w.Write(body)
}

func fetchUser(ctx context.Context, id string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://users/"+id, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req) // returns early when ctx is done
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("users: status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}` },
      { lang: "ruby", label: "Ruby", src: `require "net/http"

class UpstreamTimeout < StandardError; end

def fetch_user(id)
  uri = URI("https://users.internal/users/#{id}")
  # Per-phase limits. Each defaults to 60 seconds: far too long for an RPC.
  Net::HTTP.start(uri.host, uri.port, use_ssl: true,
                  open_timeout: 0.5, read_timeout: 1, write_timeout: 1) do |http|
    http.max_retries = 0 # default 1: idempotent requests retry once
    http.get(uri.path)
  end
rescue Net::OpenTimeout, Net::ReadTimeout => e
  raise UpstreamTimeout, "users: #{e.class}" # caller decides what next
end

# Avoid: Timeout.timeout(1) { fetch_user(42) }
# It raises into the thread at an arbitrary point (even mid-cleanup),
# and code inside the block can rescue it and keep going.` },
    ],
    codeNote: "Go passes the deadline explicitly as `ctx`, so every function down the chain sees and honors the same budget. Python's `asyncio.timeout()` cancels the running task when the block's budget runs out, while Ruby has no built-in deadline object, so you set a timeout on each call and pass remaining time yourself.",
    quiz: [
      { q: "The frontend has 1 s, spends 200 ms, then calls Service B. What timeout should B use for its own downstream call?", a: "Not a fresh fixed value. B should use what is left of the inherited deadline (about 800 ms, minus a margin for network and reply), and check there is enough time before starting expensive work." },
      { q: "Why is Ruby's `Timeout.timeout` a poor way to bound an HTTP call?", a: "It raises an exception into the thread at an arbitrary point, which can interrupt cleanup in `ensure` blocks, and the block can rescue and ignore it. Per-call timeouts such as `open_timeout` and `read_timeout` fail at well-defined points." },
      { q: "A dependency starts hanging, and your healthy service fails its health checks. Explain the chain.", a: "Calls without timeouts hold pooled connections; new requests queue for connections while holding threads; when no thread is free, health check requests time out, instances are restarted, and the new ones fill up the same way." },
    ],
    incidents: ["circleci-2026-api-thread-exhaustion", "hostedgraphite-2018-aws-slow-clients-lb", "sentry-2024-runsql-migration-lock"],
    sources: [
      { title: "Google SRE book: Addressing Cascading Failures (deadlines, propagation)", url: "https://sre.google/sre-book/addressing-cascading-failures/" },
      { title: "Go: context", url: "https://pkg.go.dev/context" },
      { title: "Go: net/http (Client.Timeout, NewRequestWithContext, Request.Context)", url: "https://pkg.go.dev/net/http" },
      { title: "Python: Coroutines and Tasks (asyncio.timeout, wait_for)", url: "https://docs.python.org/3/library/asyncio-task.html" },
      { title: "Ruby: Timeout", url: "https://docs.ruby-lang.org/en/master/Timeout.html" },
      { title: "Ruby: Net::HTTP", url: "https://docs.ruby-lang.org/en/master/Net/HTTP.html" },
      { title: "Ruby: Net::OpenTimeout", url: "https://docs.ruby-lang.org/en/master/Net/OpenTimeout.html" },
    ],
  },
  {
    id: "bounded-concurrency",
    n: 3,
    title: "Bounded concurrency",
    question: "You need to call an API for 1,000 items. How do you do it in parallel without overwhelming the API, and what happens to errors?",
    view: [920, 480],
    groups: [
      { id: "g-pool", label: "Workers: at most 4 in flight", x: 205, y: 150, w: 610, h: 90 },
    ],
    nodes: [
      { id: "jobs", label: "Job list", sub: "1,000 URLs", x: 20, y: 40, w: 150, h: 50 },
      { id: "queue", label: "Work queue", sub: "bounded: blocks", kind: "store", x: 240, y: 40, w: 160, h: 50 },
      { id: "sem", label: "Limit N = 4", sub: "semaphore / pool", x: 470, y: 40, w: 170, h: 50 },
      { id: "unbounded", label: "Unbounded fan-out", sub: "1,000 at once", x: 710, y: 40, w: 180, h: 50 },
      { id: "w1", label: "Worker 1", x: 220, y: 175, w: 130, h: 50 },
      { id: "w2", label: "Worker 2", x: 370, y: 175, w: 130, h: 50 },
      { id: "w3", label: "Worker 3", x: 520, y: 175, w: 130, h: 50 },
      { id: "w4", label: "Worker 4", x: 670, y: 175, w: 130, h: 50 },
      { id: "dep", label: "Dependency", sub: "DB or API, sized for N", x: 330, y: 320, w: 320, h: 56 },
      { id: "collect", label: "Results + errors", sub: "one per job", x: 700, y: 320, w: 190, h: 56 },
      { id: "join", label: "Wait / join", sub: "all done, or 1st error", x: 20, y: 320, w: 170, h: 56 },
    ],
    edges: [
      { id: "e-enq", from: "jobs", to: "queue", label: "enqueue" },
      { id: "e-bp", from: "queue", to: "jobs", label: "blocks when full", via: [[320, 115], [95, 115]], labelAt: [207, 115] },
      { id: "e-p1", from: "queue", to: "w1", label: "pop" },
      { id: "e-p2", from: "queue", to: "w2" },
      { id: "e-p3", from: "queue", to: "w3" },
      { id: "e-p4", from: "queue", to: "w4" },
      { id: "e-acq", from: "w3", to: "sem", label: "acquire" },
      { id: "e-c1", from: "w1", to: "dep" },
      { id: "e-c2", from: "w2", to: "dep", label: "calls" },
      { id: "e-c3", from: "w3", to: "dep" },
      { id: "e-c4", from: "w4", to: "dep" },
      { id: "e-rep", from: "w4", to: "collect", label: "reports" },
      { id: "e-done", from: "collect", to: "join", label: "collected", via: [[795, 445], [105, 445]], labelAt: [450, 445] },
      { id: "e-flood", from: "unbounded", to: "dep", label: "floods", dashed: true, via: [[905, 90], [905, 295], [600, 295]], labelAt: [760, 295] },
    ],
    steps: [
      { text: "A fixed number of workers pull jobs from a queue, so at most N calls are ever in flight, however many jobs there are. Top right is the version without a limit." },
      { text: "The producer puts the 1,000 jobs on a work queue. Nothing is called yet: queuing a job is cheap, running it is what costs the dependency.", on: ["jobs", "queue"], flow: ["e-enq"] },
      { text: "Exactly N workers exist (4 here). Each takes the next job off the queue. In Ruby that is N `Thread`s popping a `Queue`; in Python a `ThreadPoolExecutor(max_workers=N)` does the same inside.", on: ["queue", "w1", "w2", "w3", "w4"], flow: ["e-p1", "e-p2", "e-p3", "e-p4"] },
      { text: "The other shape: start a goroutine or task per job, but make each acquire a slot first. Go's `errgroup.SetLimit(4)` blocks `Go` until a slot is free; Python's `asyncio.Semaphore(4)` does it with `async with`.", on: ["sem", "w3"], flow: ["e-acq"] },
      { text: "The dependency now sees at most 4 concurrent requests from this process. Pick N from what the dependency can take, such as its connection limit, not from how many jobs you have.", on: ["w1", "w2", "w3", "w4", "dep"], flow: ["e-c1", "e-c2", "e-c3", "e-c4"] },
      { text: "Every job ends as a result or an error. Record failures next to the job they belong to; one bad item should not hide the other 999 or crash the pool.", on: ["w4", "collect"], flow: ["e-rep"] },
      { text: "Wait for everything. Go's `errgroup` `Wait` returns the first error and cancels the shared context for the rest. Python's `Future.result()` re-raises each call's exception; Ruby's `Thread#join` re-raises an unhandled one.", on: ["collect", "join"], flow: ["e-done"] },
      { text: "Backpressure: if the queue has a maximum size (Ruby `SizedQueue`, a buffered channel), the producer blocks when workers fall behind instead of piling up jobs in memory.", on: ["queue", "jobs"], flow: ["e-bp"] },
      { text: "Without a limit, the loop starts 1,000 calls at once. The dependency's connection limit, threads or rate limit are hit together, latency climbs, timeouts fire, and retries add more load.", on: ["unbounded", "dep"], flow: ["e-flood"] },
    ],
    say30: "I never fan out one call per item without a limit. I use a fixed pool: in Python a `ThreadPoolExecutor` with `max_workers`, or an `asyncio.Semaphore` for async code; in Go an `errgroup` with `SetLimit`, which is in `golang.org/x/sync`, or a buffered channel as a semaphore; in Ruby N threads pulling from a `Queue`, which works fine for I/O-bound work despite the GVL. I pick N from what the dependency can absorb, not from the job count. Each job's error is collected next to its input, and I decide whether the first error cancels the rest. At scale, remember N multiplies by the number of instances, so the real concurrency the dependency sees is N times the fleet.",
    gotchas: [
      "Python's `ThreadPoolExecutor` bounds how many calls run, but its internal work queue is unbounded: submitting a million jobs at once holds a million futures in memory.",
      "Go's `errgroup` returns only the first error from `Wait`. If you need every failure, record errors per job yourself (or use `errors.Join`).",
      "CRuby threads in one Ractor share the GVL, so Ruby threads give no parallelism for CPU-bound Ruby code. For I/O-bound calls they work, because the GVL is released while blocked.",
      "Before Go 1.22 the loop variable was shared across iterations, so closures in `g.Go` could all see the last item. Since 1.22 each iteration gets its own variable.",
    ],
    atScale: [
      "Per-process limits multiply: N = 50 per pod on 200 pods is 10,000 concurrent calls to the database. Budget concurrency per dependency across the fleet, then divide by instance count.",
      "Unbounded fan-out melts dependencies: a cache miss or deploy that turns one request into a call per shard or per item can exceed connection and thread limits at once. Cap fan-out per request and shed load when the cap is hit.",
      "Unbounded queues hide overload: the backlog grows in memory, latency grows with it, and work is done for callers who already gave up. Bound the queue and reject or block when it is full.",
      "One slow item can stall a whole batch when the pool waits for every job. Put a timeout on each job and on the batch, and cancel the rest when the batch is abandoned.",
    ],
    code: [
      { lang: "python", label: "Python", src: `from concurrent.futures import ThreadPoolExecutor, as_completed


def fetch(url):
    if "bad" in url:
        raise ConnectionError(f"refused: {url}")
    return f"body of {url}"


def fetch_all(urls, limit=8):
    results, errors = {}, {}
    # At most \`limit\` calls in flight; the rest wait in the pool's queue.
    with ThreadPoolExecutor(max_workers=limit) as pool:
        futures = {pool.submit(fetch, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                results[url] = future.result()  # re-raises the call's error
            except Exception as exc:
                errors[url] = exc  # collect; one failure does not stop the rest
    return results, errors


ok, failed = fetch_all(["a", "bad-b", "c"], limit=2)
print(sorted(ok), failed)  # ['a', 'c'] {'bad-b': ConnectionError(...)}` },
      { lang: "go", label: "Go", src: `// golang.org/x/sync/errgroup: the Go team's extended library (x/),
// not the standard library, but the usual choice for this.
import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func fetchAll(ctx context.Context, urls []string) ([][]byte, error) {
	g, ctx := errgroup.WithContext(ctx)
	g.SetLimit(8) // at most 8 running; g.Go blocks until a slot frees
	results := make([][]byte, len(urls))
	for i, u := range urls {
		g.Go(func() error { // Go 1.22+: i and u are per iteration
			body, err := fetch(ctx, u)
			if err != nil {
				return fmt.Errorf("fetch %s: %w", u, err)
			}
			results[i] = body // each goroutine writes its own slot
			return nil
		})
	}
	// First error wins; it also cancels ctx for calls still running.
	return results, g.Wait()
}` },
      { lang: "ruby", label: "Ruby", src: `def fetch_all(urls, limit: 8)
  queue = Queue.new
  urls.each { |url| queue << url }
  queue.close # pop returns nil once the queue is empty

  results, errors = {}, {}
  lock = Mutex.new
  workers = Array.new(limit) do
    Thread.new do
      while (url = queue.pop)
        begin
          body = fetch(url)
          lock.synchronize { results[url] = body }
        rescue StandardError => e
          lock.synchronize { errors[url] = e } # keep going
        end
      end
    end
  end
  workers.each(&:join) # GVL is released during blocking I/O
  [results, errors]
end` },
    ],
    codeNote: "Python and Ruby bound concurrency with a fixed set of workers and collect every error; Go starts a goroutine per job but `SetLimit` caps how many run, and `Wait` returns only the first error while cancelling the rest. In Go, without `x/sync`, a buffered channel used as a semaphore does the same job with the standard library only.",
    quiz: [
      { q: "How do you choose N, the concurrency limit?", a: "From what the dependency can take (its connection limit, rate limit or measured throughput), divided across all instances that call it. Not from the number of jobs or the number of CPUs." },
      { q: "In Go with `errgroup.WithContext`, one call fails. What happens to the others and what does `Wait` return?", a: "The derived context is cancelled, so calls that honor `ctx` stop early; `Wait` blocks until all goroutines return and gives back the first non-nil error." },
      { q: "Do Ruby threads help for 1,000 HTTP calls, given the GVL?", a: "Yes. The GVL stops threads in one Ractor from running Ruby code in parallel, but it is released during blocking I/O, so threads waiting on the network overlap. For CPU-bound Ruby code they don't help." },
    ],
    incidents: ["slack-2022-consul-rollout-cache-scatter", "duo-2018-duo1-db-queue-latency"],
    sources: [
      { title: "Go: golang.org/x/sync/errgroup", url: "https://pkg.go.dev/golang.org/x/sync/errgroup" },
      { title: "Go 1.22 release notes (per-iteration loop variables)", url: "https://go.dev/doc/go1.22" },
      { title: "Go: sync", url: "https://pkg.go.dev/sync" },
      { title: "Python: concurrent.futures", url: "https://docs.python.org/3/library/concurrent.futures.html" },
      { title: "Python: asyncio synchronization primitives (Semaphore)", url: "https://docs.python.org/3/library/asyncio-sync.html" },
      { title: "Ruby: Thread::Queue", url: "https://docs.ruby-lang.org/en/master/Thread/Queue.html" },
      { title: "Ruby: Thread::SizedQueue", url: "https://docs.ruby-lang.org/en/master/Thread/SizedQueue.html" },
      { title: "Ruby: Thread", url: "https://docs.ruby-lang.org/en/master/Thread.html" },
      { title: "Ruby: Ractor (GVL per Ractor)", url: "https://docs.ruby-lang.org/en/master/Ractor.html" },
      { title: "Google SRE book: Addressing Cascading Failures (queues, load shedding)", url: "https://sre.google/sre-book/addressing-cascading-failures/" },
    ],
  },
  {
    id: "errors",
    n: 4,
    title: "Error handling and wrapping",
    question: "A database error surfaces three layers up. How do you keep its cause, decide whether to retry, and report it without losing detail or exploding your metrics?",
    view: [920, 450],
    nodes: [
      { id: "driver", label: "DB driver", sub: "conn refused", x: 20, y: 40, w: 150, h: 50 },
      { id: "repo", label: "Repository", sub: "+ get user 42", x: 240, y: 40, w: 160, h: 50 },
      { id: "svc", label: "Service", sub: "+ load profile", x: 470, y: 40, w: 160, h: 50 },
      { id: "handler", label: "HTTP handler", sub: "inspects the chain", x: 710, y: 40, w: 180, h: 50 },
      { id: "q1", label: "Not found?", sub: "Is / isinstance", kind: "q", x: 470, y: 160, w: 170, h: 56 },
      { id: "r404", label: "404 NOT_FOUND", sub: "do not retry", x: 710, y: 163, w: 180, h: 50 },
      { id: "q2", label: "Unavailable?", sub: "As / class check", kind: "q", x: 470, y: 270, w: 170, h: 56 },
      { id: "r503", label: "503 UNAVAILABLE", sub: "caller may retry", x: 710, y: 273, w: 180, h: 50 },
      { id: "r500", label: "500 INTERNAL", sub: "unexpected", x: 470, y: 380, w: 170, h: 50 },
      { id: "metric", label: "Error metric", sub: "code=UNAVAILABLE", x: 710, y: 380, w: 180, h: 50 },
      { id: "log", label: "Log and trace", sub: "full chain + cause", x: 20, y: 270, w: 190, h: 56 },
    ],
    edges: [
      { id: "e-w1", from: "driver", to: "repo", label: "returns" },
      { id: "e-w2", from: "repo", to: "svc", label: "wraps" },
      { id: "e-w3", from: "svc", to: "handler", label: "wraps" },
      { id: "e-check", from: "handler", to: "q1", label: "checks chain" },
      { id: "e-y1", from: "q1", to: "r404", label: "yes" },
      { id: "e-n1", from: "q1", to: "q2", label: "no" },
      { id: "e-y2", from: "q2", to: "r503", label: "yes" },
      { id: "e-n2", from: "q2", to: "r500", label: "no" },
      { id: "e-count", from: "r503", to: "metric", label: "counts" },
      { id: "e-log", from: "r500", to: "log", label: "logs chain" },
    ],
    steps: [
      { text: "An error starts at the bottom, gains context at each layer without losing the original, and is classified once at the edge: what status to return, whether the caller may retry, and what to record." },
      { text: "The database driver fails with a low-level error: connection refused. On its own it says nothing about which request or user was affected.", on: ["driver", "repo"], flow: ["e-w1"] },
      { text: "The repository wraps it with context. Go: `fmt.Errorf(\"get user %s: %w\", id, err)`. Python: `raise Unavailable(...) from e`. Ruby: raise a new error inside `rescue` and `cause` is set automatically.", on: ["repo", "svc"], flow: ["e-w2"] },
      { text: "The service wraps again. The message now reads like a path, \"load profile: get user 42: connection refused\", and the original error is still reachable through the chain.", on: ["svc", "handler"], flow: ["e-w3"] },
      { text: "The handler checks the chain, not the message text. A sentinel such as `ErrNotFound` is matched with `errors.Is`; in Python and Ruby, `except NotFound` or `rescue NotFound` also catch subclasses. Not found: 404, never worth retrying.", on: ["handler", "q1", "r404"], flow: ["e-check", "e-y1"] },
      { text: "A typed error carries data: Go's `errors.As` finds an `*UnavailableError` anywhere in the chain and gives you its fields. Unavailable is retryable, so return 503 and let one layer above decide to retry.", on: ["q1", "q2", "r503"], flow: ["e-n1", "e-y2"] },
      { text: "Anything unrecognized is a bug or a case nobody planned for: 500. Log the full chain with its causes and the trace ID, so the root error is not lost behind the wrapper.", on: ["q2", "r500", "log"], flow: ["e-n2", "e-log"] },
      { text: "Count errors by a small fixed set of codes (`NOT_FOUND`, `UNAVAILABLE`, `INTERNAL`), never by message. A message contains user IDs and hostnames, which creates a new metric series for each one.", on: ["r503", "metric"], flow: ["e-count"] },
    ],
    say30: "Each layer adds context and keeps the original error. In Go that's `fmt.Errorf` with `%w`, then `errors.Is` for sentinels like `ErrNotFound` and `errors.As` for typed errors that carry fields. In Python I raise my own exception hierarchy with `raise ... from e` so the cause is kept; in Ruby, raising inside `rescue` sets `cause` automatically. I classify once, at the edge: not found or invalid input is final, unavailable or timeout is retryable, anything else is a 500 and gets logged with the full chain. Across services I return a small fixed set of error codes, and I label metrics by that code, never by message, to keep cardinality bounded.",
    gotchas: [
      "Wrapping with `%v` instead of `%w` in Go flattens the error into text: `errors.Is` and `errors.As` can no longer find the original.",
      "A bare Ruby `rescue` catches `StandardError`, and `Timeout::Error` is a `RuntimeError`, so a broad rescue can silently swallow timeouts.",
      "Python's `except Exception` around a whole function hides bugs as well as expected failures. Catch the narrowest class you can handle and let the rest propagate.",
      "Matching on error message strings breaks as soon as someone rewords the message. Match on types, sentinels or codes.",
    ],
    atScale: [
      "Error messages as metric labels explode cardinality: each user ID, host or query in a message becomes a new time series. Label by a small enum of error codes and put the detail in logs and traces.",
      "Without shared error codes, each service invents its own, and callers parse text to decide whether to retry. A fleet-wide set of codes that say retryable or not keeps retry decisions consistent across languages.",
      "Errors lose their cause at service boundaries: only a status and message cross the wire. Return a structured body (code, message, trace ID) and log the full local chain where it happened.",
      "One poison input that crashes a handler can take down a whole worker fleet when it is redelivered. Catch per item, classify it as fatal, and park it in a dead-letter queue instead of retrying forever.",
    ],
    code: [
      { lang: "python", label: "Python", src: `class ServiceError(Exception):
    """Base class: callers can catch everything this client raises."""
    retryable = False


class Unavailable(ServiceError):
    retryable = True  # 503, timeouts: worth another try


class NotFound(ServiceError):
    pass  # retrying will never help


def call_backend(path):
    raise ConnectionError("connection refused")


def get_user(user_id):
    try:
        return call_backend(f"/users/{user_id}")
    except ConnectionError as e:
        # \`from e\` records the low-level error as __cause__.
        raise Unavailable(f"user service: get {user_id}") from e


try:
    get_user(42)
except ServiceError as e:
    print(type(e).__name__, e.retryable, repr(e.__cause__))
# Unavailable True ConnectionError('connection refused')` },
      { lang: "go", label: "Go", src: `// Sentinel: a fixed value, matched with errors.Is.
var ErrNotFound = errors.New("not found")

// Typed error: carries data, matched with errors.As.
type UnavailableError struct {
	Service string
	Err     error
}

func (e *UnavailableError) Error() string { return e.Service + " unavailable: " + e.Err.Error() }
func (e *UnavailableError) Unwrap() error { return e.Err }

func getUser(id string) error {
	if err := callBackend(id); err != nil {
		return fmt.Errorf("get user %s: %w", id, err) // %w keeps the chain
	}
	return nil
}

func retryable(err error) bool {
	var ue *UnavailableError
	switch {
	case errors.Is(err, ErrNotFound):
		return false
	case errors.As(err, &ue): // finds it at any depth
		return true
	}
	return false
}` },
      { lang: "ruby", label: "Ruby", src: `class ServiceError < StandardError
  def retryable?
    false
  end
end

class Unavailable < ServiceError
  def retryable? # 503, timeouts
    true
  end
end

class NotFound < ServiceError; end # retrying will never help

require \"net/http\" # for Net::ReadTimeout\n\ndef call_backend(path) = raise(Errno::ECONNREFUSED)\n\ndef get_user(id)
  call_backend("/users/#{id}")
rescue Errno::ECONNREFUSED, Net::ReadTimeout
  # Raised inside rescue, so cause is set to the original error ($!).
  raise Unavailable, "user service: get #{id}"
end

begin
  get_user(42)
rescue ServiceError => e
  puts "#{e.class} retryable=#{e.retryable?} cause=#{e.cause.inspect}"
end` },
    ],
    codeNote: "Go errors are values: wrapping builds a chain that `errors.Is` and `errors.As` walk, and the type system does not force callers to check. Python and Ruby use exception class hierarchies, so one `except`/`rescue` of the base class catches the whole family, and both record the original error as a cause (`__cause__` with `from`, `cause` automatically in Ruby).",
    quiz: [
      { q: "In Go, what is the difference between a sentinel error and a typed error, and how do you check each?", a: "A sentinel is a single package-level value like `ErrNotFound`, checked with `errors.Is`. A typed error is a struct implementing `error` that carries fields, found anywhere in the chain with `errors.As`, which also gives you the value." },
      { q: "In Python, what does `raise NewError(...) from e` add compared to just raising inside `except`?", a: "Both keep the original. Raising inside `except` records it implicitly as context (\"during handling of the above exception\"); `from e` sets `__cause__` and states it was the direct cause. `from None` hides the original." },
      { q: "Why shouldn't you use the error message as a metric label?", a: "Messages contain IDs, hosts and values, so each one creates a new time series and cardinality grows without bound. Label by a small fixed set of codes and put details in logs and traces." },
    ],
    incidents: ["incidentio-2022-pubsub-poison-pill"],
    sources: [
      { title: "Go: errors", url: "https://pkg.go.dev/errors" },
      { title: "Go: fmt (Errorf and %w)", url: "https://pkg.go.dev/fmt" },
      { title: "Python tutorial: Errors and Exceptions (chaining, user-defined)", url: "https://docs.python.org/3/tutorial/errors.html" },
      { title: "Ruby: Exception (cause)", url: "https://docs.ruby-lang.org/en/master/Exception.html" },
      { title: "Ruby: Kernel#raise (cause: defaults to $!)", url: "https://docs.ruby-lang.org/en/master/Kernel.html" },
      { title: "Ruby: exceptions syntax (rescue defaults to StandardError)", url: "https://docs.ruby-lang.org/en/master/syntax/exceptions_rdoc.html" },
      { title: "Ruby: Timeout (Timeout::Error is a RuntimeError)", url: "https://docs.ruby-lang.org/en/master/Timeout.html" },
    ],
  },
];

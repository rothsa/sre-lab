// Chapters 1-4: everyday SRE scripting tasks, compared across Python, Go and Ruby.
// Spec format: see ../../k8s/README.md (plus `code`, `codeNote`, `atScale`, `compare`: see ../../drawn/README.md).
//
// Shared layout: the top row is the task (the same in every language); the three lanes below
// show how Python, Go and Ruby structure each stage. Columns line up, so a step can light one
// stage across all three languages.
const GROUPS = (task) => [
  { id: "g-task", label: task, x: 10, y: 8, w: 900, h: 96 },
  { id: "g-py", label: "Python", x: 10, y: 116, w: 900, h: 96 },
  { id: "g-go", label: "Go", x: 10, y: 224, w: 900, h: 96 },
  { id: "g-rb", label: "Ruby", x: 10, y: 332, w: 900, h: 96 },
];
const COLS = [40, 260, 480, 700];
const top = (ids) => ids.map(([id, label, sub, kind], i) => ({ id, label, sub, kind, x: COLS[i], y: 40, w: 160, h: 50 }));
const lane = (prefix, y, rows) => rows.map(([label, sub], i) => ({ id: `${prefix}${i + 1}`, label, sub, x: COLS[i], y, w: 180, h: 50 }));
const laneEdges = (prefix) => [1, 2, 3].map((i) => ({ id: `e-${prefix}${i}`, from: `${prefix}${i}`, to: `${prefix}${i + 1}` }));
const col = (i) => [`py${i}`, `go${i}`, `rb${i}`];

export const CHAPTERS = [
  {
    id: "script-or-tool",
    n: 1,
    title: "Script or tool? One CLI skeleton, three languages",
    question: "Before writing code, should this be a one-liner, Ansible or Terraform, or a service? And if it is a script, how do Python, Go and Ruby structure the same safe CLI?",
    view: [920, 440],
    groups: GROUPS("First: is a script the right tool?"),
    nodes: [
      ...top([
        ["q1", "One-off question?", "yes: kubectl, jq, awk", "q"],
        ["q2", "Desired state?", "yes: Ansible, Terraform", "q"],
        ["q3", "Always running?", "yes: exporter, service", "q"],
        ["t4", "Write a script", "the skeleton below"],
      ]),
      ...lane("py", 148, [
        ["argparse", "BooleanOptionalAction"],
        ["main() -> int", "exceptions bubble up"],
        ["json.dump(stdout)", "logging → stderr"],
        ["sys.exit(main())", "traceback → exit 1"],
      ]),
      ...lane("go", 256, [
        ["flag.Bool", "off: -dry-run=false"],
        ["run() error", "if err != nil { return }"],
        ["json.NewEncoder", "slog → os.Stderr"],
        ["os.Exit(1) in main", "skips deferred calls"],
      ]),
      ...lane("rb", 364, [
        ["OptionParser", "--[no-]dry-run"],
        ["rescue / ensure", "exceptions, like Python"],
        ["puts JSON.generate", "Logger.new($stderr)"],
        ["exit(main(ARGV))", "raises SystemExit"],
      ]),
    ],
    edges: [
      { id: "e-n1", from: "q1", to: "q2", label: "no" },
      { id: "e-n2", from: "q2", to: "q3", label: "no" },
      { id: "e-n3", from: "q3", to: "t4", label: "no" },
      ...laneEdges("py"), ...laneEdges("go"), ...laneEdges("rb"),
    ],
    steps: [
      { text: "Top row: decide whether code is the right tool at all. The three lanes build the same small CLI in Python, Go and Ruby, column by column: parse flags, do the work, write output, exit. Press Next to compare them." },
      { text: "Reach for a script last. A one-off question is a `kubectl`, `jq` or `awk` one-liner. Desired state on hosts or cloud belongs in Ansible or Terraform. Anything that runs all the time is an exporter or a service. Scripts fit recurring jobs with branching logic and API calls.", on: ["q1", "q2", "q3", "t4"], flow: ["e-n1", "e-n2", "e-n3"] },
      { text: "The contract is the same in every language: `--dry-run` on by default, logs on stderr, results as JSON on stdout so `jq` can read them, and an exit code that cron, CI or a Kubernetes Job can act on: 0 ok, 1 failed, 2 bad usage.", on: ["t4", ...col(4)] },
      { text: "Flags. Python's `argparse.BooleanOptionalAction` (3.9+) creates both `--dry-run` and `--no-dry-run`. Ruby's `OptionParser` gets the same pair from `--[no-]dry-run`. Go's `flag` has no negative form: you turn a bool off with `-dry-run=false`.", on: col(1) },
      { text: "Bad usage. `argparse` and Go's `flag` print usage to stderr and exit 2 on their own. Ruby's `parse!` raises `OptionParser::InvalidOption`, a `ParseError`, so you rescue it and pick the exit code. For subcommands, Go teams usually reach for cobra; Python has `add_subparsers`.", on: col(1) },
      { text: "Errors while working. Python and Ruby raise exceptions: catch the expected ones per item and let the rest unwind with a traceback. Go returns errors as values, so `run()` passes each one up with `if err != nil`, adding context with `fmt.Errorf(\"...: %w\", err)`.", on: col(2), flow: ["e-py1", "e-go1", "e-rb1"] },
      { text: "Two streams. Python's `logging.basicConfig()` and Ruby's `Logger.new($stderr)` log to stderr; Go's `slog` handler is pointed at `os.Stderr` on purpose. Results go to stdout as JSON. In Go a nil slice encodes as `null`, so start from `[]result{}` to print `[]`.", on: col(3), flow: ["e-py2", "e-go2", "e-rb2"] },
      { text: "Exit. `sys.exit(main())` raises `SystemExit`, so `finally` blocks run; an uncaught exception exits 1. Ruby's `exit` also raises `SystemExit`, so `ensure` runs. Go's `os.Exit` ends the process at once and skips deferred calls, so call it once, in `main`, after `run()` returns.", on: col(4), flow: ["e-py3", "e-go3", "e-rb3"] },
      { text: "Shipping it. A Go CLI builds into one binary you copy to hosts or bake into an image. Python and Ruby need the interpreter and dependencies on every host, through a venv, a `Gemfile.lock` or a container image. Easy on one jump box, painful on a mixed fleet.", on: ["go1", "go2", "go3", "go4"] },
      { text: "Make reruns safe. Cron retries, people press up-arrow, Jobs restart. Check current state before changing it, so a second run reports `changed: false` instead of doing the work twice. No language gives you this; it is a design rule.", on: ["t4", ...col(2)] },
    ],
    say30: "The contract doesn't depend on the language: dry-run by default, logs on stderr, JSON on stdout, meaningful exit codes, and safe to rerun. The structure does. Python gives the most in the standard library: argparse with --no- flags, logging and exceptions, so it's fastest to write. Go makes every error an explicit return, which is verbose but hard to ignore, and a typical pure-Go build ships as one self-contained binary, which matters on hundreds of hosts. Ruby's OptionParser and blocks read nicely, but I handle parse errors myself and need Ruby and gems everywhere. For a quick team tool I'd pick Python; for something installed fleet-wide or long-lived, Go.",
    gotchas: [
      "Go's `os.Exit` skips deferred functions, so a `defer f.Close()` or a deferred flush in `main` never runs if you exit there. Keep `main` to a few lines around `run()`.",
      "Go bool flags must be written `-dry-run=false`. With `-dry-run false` the flag stays true and `false` becomes the first positional argument, which also ends flag parsing.",
      "A bare `except:` in Python catches `SystemExit` and `KeyboardInterrupt`, and `rescue Exception` in Ruby catches `SystemExit`. Catch `Exception` in Python and `StandardError` (what a bare `rescue` catches) in Ruby.",
      "One debug `print` or `puts` on stdout breaks `| jq` downstream. Send everything that is not the result to stderr.",
    ],
    atScale: [
      "Interpreter drift: across a large fleet you find several Python and Ruby versions, and `BooleanOptionalAction` needs Python 3.9. Teams ship Go binaries or container images, or run the script centrally against APIs instead of on every host.",
      "Fan-out by hand (a `for` loop over SSH) loses the exit codes. Run through an orchestrator such as Ansible, SSM Run Command or a Kubernetes Job, which records success per target, and use the exit code as the signal it aggregates.",
      "Blast radius: a script that is wrong on one host is wrong on all of them at once. Keep dry-run as the default, add a `--limit` or canary list, and widen in stages: one target, ten, then all.",
      "Synchronized schedules: the same cron line on every host fires at the same second and hits the same API together. Add a random start delay, and give the job a lock so a slow run doesn't overlap the next one.",
      "When a script grows state, retries and per-target progress, it has become a service. Move it into a job system or controller with a queue rather than adding more flags.",
    ],
    agentic: [
      "An agent drafts this skeleton in seconds in any of the three languages, so the review moves from syntax to the contract: does `--dry-run` really default to on, does Go's `main` stay a few lines around `run()`, does only the result reach stdout. A script that quietly defaults to apply, or catches `SystemExit` with a bare `except:`, survives a quick skim and fails on the first fleet run.",
      "Asking an agent for a script gets you a script. Whether this should be a one-liner, an Ansible module, a Terraform resource or a service is still the first decision, and it belongs before the prompt, not after the diff.",
      "The contract also makes the tool safe for an agent to call: JSON on stdout and meaningful exit codes are what a tool-using agent reads, and dry-run by default limits what a misread instruction can do. Claude Code's security docs note an approved Bash command can write anywhere your user account can, so try new scripts in a sandbox or container first (see Agentic Engineering, Drawn, on permissions).",
    ],
    code: [
      { lang: "python", label: "Python · argparse + logging (stdlib)", src: `import argparse
import json
import logging
import sys

log = logging.getLogger("fix")


def main() -> int:
    p = argparse.ArgumentParser(description="Fix the given targets.")
    # One option, two spellings: --dry-run / --no-dry-run. Safe by default.
    p.add_argument("--dry-run", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("targets", nargs="+")
    args = p.parse_args()  # bad flags: usage on stderr, exit 2
    logging.basicConfig(level=logging.INFO)  # default handler: stderr

    results, failed = [], 0
    for t in args.targets:
        try:
            results.append({"target": t, "changed": fix(t, args.dry_run)})
        except OSError as e:  # expected failure: record it, keep going
            log.error("%s: %s", t, e)
            failed += 1
    json.dump(results, sys.stdout, indent=2)  # data: stdout, for jq
    return 1 if failed else 0


def fix(target: str, dry_run: bool) -> bool:
    log.info("%s %s", "would fix" if dry_run else "fixing", target)
    return not dry_run


if __name__ == "__main__":
    sys.exit(main())  # an uncaught exception prints a traceback, exits 1` },
      { lang: "go", label: "Go · flag + log/slog (stdlib; cobra for subcommands)", src: `package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
)

type result struct {
	Target  string \`json:"target"\`
	Changed bool   \`json:"changed"\`
}

func main() { // tiny on purpose: os.Exit skips deferred calls
	dryRun := flag.Bool("dry-run", true, "only report; turn off with -dry-run=false")
	flag.Parse() // bad flags: usage on stderr, exit 2
	if err := run(flag.Args(), *dryRun); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(targets []string, dryRun bool) error {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil)) // logs: stderr
	// A nil slice would encode as null; start empty so it prints [].
	results := []result{}
	for _, t := range targets {
		log.Info("fix", "target", t, "dry_run", dryRun)
		results = append(results, result{Target: t, Changed: !dryRun})
	}
	return json.NewEncoder(os.Stdout).Encode(results) // data: stdout
}` },
      { lang: "ruby", label: "Ruby · OptionParser + Logger (stdlib)", src: `require "json"
require "logger"
require "optparse"

LOG = Logger.new($stderr)                 # logs: stderr

def main(argv)
  opts = { dry_run: true }                # safe by default
  OptionParser.new do |o|
    o.banner = "usage: fix [--[no-]dry-run] TARGET..."
    o.on("--[no-]dry-run", "only report") { |v| opts[:dry_run] = v }
  end.parse!(argv)                        # removes flags, raises on bad ones
  results = argv.map do |t|
    LOG.info("#{opts[:dry_run] ? 'would fix' : 'fixing'} #{t}")
    { target: t, changed: !opts[:dry_run] }
  end
  puts JSON.pretty_generate(results)      # data: stdout
  0
rescue OptionParser::ParseError => e      # unlike argparse, you map this yourself
  warn e.message
  2
end

exit(main(ARGV))                          # SystemExit: ensure blocks still run` },
    ],
    codeNote: "Same contract, three shapes. Python and Go exit 2 on bad flags by themselves; Ruby's `OptionParser` raises and leaves the exit code to you. Go is the only one where leaving the program is not an exception: `os.Exit` stops everything, which is why `main` stays tiny. All three use only the standard library and were run (Python 3.12, Go 1.27, Ruby 3.2), including bad flags (exit 2) and Go's `-dry-run false` trap.",
    compare: [
      { lang: "Python", idiom: "A `main()` that returns an int, `argparse` for flags, exceptions for errors, and `sys.exit(main())` at the bottom.", good: ["`BooleanOptionalAction` gives `--dry-run` and `--no-dry-run`, and bad usage exits 2 for free", "Flags, logging and JSON are all in the stdlib: no dependencies for a small tool"], bad: ["Needs a suitable interpreter on every host (3.9+ for `BooleanOptionalAction`)", "A bare `except:` also swallows `SystemExit` and Ctrl-C"] },
      { lang: "Go", idiom: "A tiny `main` that calls `run() error`, the stdlib `flag` package (cobra once you need subcommands), and `os.Exit` only in `main`.", good: ["One binary per OS and architecture (static with `CGO_ENABLED=0`): copy it to any matching host, starts fast", "Errors are values, so every failure path is visible in the code"], bad: ["`flag` has no `--no-` form; booleans need `-dry-run=false`", "`os.Exit` skips defers, and a nil slice encodes as `null`"] },
      { lang: "Ruby", idiom: "`OptionParser` with a block per option, `rescue` and `ensure` for errors, and `exit` with the status.", good: ["`--[no-]dry-run` declares both spellings in one line", "`exit` raises `SystemExit`, so `ensure` blocks and `at_exit` handlers still run"], bad: ["`parse!` raises on bad flags; mapping that to exit 2 is your job", "Needs Ruby and its gems on every host"] },
    ],
    quiz: [
      { q: "How do you turn off a Go bool flag that defaults to true, and what goes wrong with `-dry-run false`?", a: "Write `-dry-run=false`. With a space, `flag` sets dry-run to true and treats `false` as the first positional argument, and parsing stops there." },
      { q: "Why should a Go program call `os.Exit` only in `main`, after `run()` returns?", a: "`os.Exit` ends the process immediately and skips deferred calls, so files would not be closed or buffers flushed. Returning an error from `run()` lets its defers run first." },
      { q: "A Python script wraps its whole body in `try: ... except: pass`. What breaks?", a: "It swallows every failure and exits 0, so cron and CI think it worked. A bare `except:` even catches `SystemExit` and Ctrl-C. Catch specific exceptions and return a non-zero code." },
    ],
    incidents: ["atlassian-2022-site-deletion-script", "render-2020-suspension-script-bug", "keepthescore-2020-prod-db-dropped"],
    sources: [
      { title: "Python: argparse", url: "https://docs.python.org/3/library/argparse.html" },
      { title: "Python: sys.exit", url: "https://docs.python.org/3/library/sys.html" },
      { title: "Go: package flag", url: "https://pkg.go.dev/flag" },
      { title: "Go: os.Exit", url: "https://pkg.go.dev/os#Exit" },
      { title: "Go: package encoding/json", url: "https://pkg.go.dev/encoding/json" },
      { title: "Go: package log/slog", url: "https://pkg.go.dev/log/slog" },
      { title: "Go FAQ: why is my trivial program such a large binary?", url: "https://go.dev/doc/faq#Why_is_my_trivial_program_such_a_large_binary" },
      { title: "Go: cgo", url: "https://pkg.go.dev/cmd/cgo" },
      { title: "Ruby: OptionParser", url: "https://docs.ruby-lang.org/en/master/OptionParser.html" },
      { title: "Ruby: Kernel (exit, abort, warn)", url: "https://docs.ruby-lang.org/en/master/Kernel.html" },
      { title: "Claude Code: Security", url: "https://code.claude.com/docs/en/security" },
    ],
  },
  {
    id: "log-parsing",
    n: 2,
    title: "Answering a question from a big access log",
    question: "From a multi-gigabyte access log, which endpoints get the most requests, the most 5xx, and the slowest p95? How do Python, Go and Ruby stream and count it?",
    view: [920, 440],
    groups: GROUPS("The task: one pass over the log, per-endpoint answers"),
    nodes: [
      ...top([
        ["t1", "access.log.gz", "GBs, rotated", "store"],
        ["t2", "One JSON line", "{path, status, ms}"],
        ["t3", "Per-endpoint stats", "count, 5xx, durations"],
        ["t4", "Report", "top N, 5xx rate, p95"],
      ]),
      ...lane("py", 148, [
        ["for line in f", "file is an iterator"],
        ["json.loads → dict", "KeyError on drift"],
        ["Counter, defaultdict", "counting is built in"],
        ["statistics.quantiles", "p95 in the stdlib"],
      ]),
      ...lane("go", 256, [
        ["bufio.Scanner", "64 KiB line cap"],
        ["json.Unmarshal", "struct + json tags"],
        ["map[string]*stats", "look up, nil, insert"],
        ["slices.Sort + index", "no stdlib percentile"],
      ]),
      ...lane("rb", 364, [
        ["File.foreach", "Enumerator, .lazy"],
        ["JSON.parse → Hash", "string keys"],
        ["Hash.new { block }", "default per new key"],
        ["sort + index", "max_by(10) for top N"],
      ]),
    ],
    edges: [
      { id: "e-t1", from: "t1", to: "t2", label: "stream" },
      { id: "e-t2", from: "t2", to: "t3", label: "decode" },
      { id: "e-t3", from: "t3", to: "t4", label: "rank" },
      ...laneEdges("py"), ...laneEdges("go"), ...laneEdges("rb"),
    ],
    steps: [
      { text: "The task: read a large access log once and answer, per endpoint, how many requests, what share were 5xx, and roughly how slow (p95). Each lane builds the same four stages. What differs is how each language expresses streaming, records and counting." },
      { text: "Try the one-liner first. For JSON lines, `jq -r 'select(.status >= 500) | .path' access.log | sort | uniq -c | sort -rn` counts 5xx per path. Write code when you need rates, percentiles and several answers in one pass.", on: ["t1", "t2", "t3", "t4"], flow: ["e-t1", "e-t2", "e-t3"] },
      { text: "Streaming. A Python file object yields one line per loop. Ruby's `File.foreach` does the same, and without a block returns an Enumerator you can make `.lazy`. Go wraps any `io.Reader` in a `bufio.Scanner`: the file, `gzip.NewReader(f)` or `os.Stdin`. That interface is how Go composes I/O.", on: ["t1", ...col(1)] },
      { text: "Go's trap: `bufio.Scanner` caps a line at 64 KiB by default. A longer line stops `Scan()` and the loop just ends; the cause, `ErrTooLong`, only appears in `sc.Err()`. Raise the cap with `sc.Buffer` and always check `Err()` after the loop.", on: ["go1"] },
      { text: "Decoding. Python and Ruby get a dict or Hash: quick, but a renamed field fails late, as a `KeyError` or a `nil`. Go decodes into a struct with `json` tags, so the schema is written down. Unknown keys are ignored and missing ones become zero values, which can hide drift just as quietly.", on: ["t2", ...col(2)], flow: ["e-py1", "e-go1", "e-rb1"] },
      { text: "Ruby detail: `JSON.parse` returns string keys, so `r[\"path\"]` works and `r[:path]` is `nil`. Pass `symbolize_names: true` if you want symbols. Bad lines are skipped with a `rescue` placed directly inside the `do ... end` block.", on: ["rb2"] },
      { text: "Counting. Python has `Counter` and `defaultdict` built in. Ruby uses `Hash.new { |h, k| h[k] = ... }`, a default block that creates the entry on first use. A Go map of pointers has no useful default: look up, check `ok`, insert, then increment.", on: ["t3", ...col(3)], flow: ["e-py2", "e-go2", "e-rb2"] },
      { text: "Percentiles. Python has `statistics.quantiles(data, n=20)`: the last of its 19 cut points is p95. Go and Ruby have no stdlib percentile, so you sort and take the nearest rank. All three keep every duration in memory, which is fine for millions of lines, not billions.", on: ["t4", ...col(4)], flow: ["e-py3", "e-go3", "e-rb3"] },
      { text: "Speed. Once the file is in the page cache, this job is CPU-bound. In default GIL-enabled CPython and in CRuby, only one thread runs interpreter code at a time, so threads don't help; you'd use processes. Free-threaded Python builds change that. Go is compiled and can split files across goroutines on every core.", on: ["py1", "go1", "rb1"] },
      { text: "Output order. The Python function is a generator, so the caller pulls rows one at a time. Ruby's `max_by(10)` picks the top N without sorting everything. Go's map iteration order is random by design, so you must sort before printing a top N.", on: ["t4", "py4", "go3", "rb4"] },
    ],
    say30: "First I'd try jq or awk. When I need several answers in one pass, the shape is the same in every language: stream lines, decode, aggregate per endpoint, then rank. Python is shortest: a file iterates lines, Counter and defaultdict do the counting, and statistics.quantiles gives p95. Ruby reads much the same with File.foreach, a Hash default block and max_by. Go is more code, with a struct for the schema and explicit map checks, and I must raise bufio.Scanner's 64 KiB line limit and check Err, but it's compiled and parallelizes across cores. During an incident I'd pick Python; for a daily job over terabytes, Go, or better, the log platform's own query language.",
    gotchas: [
      "Go's `bufio.Scanner` stops quietly on a line over 64 KiB (one long stack trace is enough). The loop ends early and only `sc.Err()` says why. Set `sc.Buffer` and check `Err()`.",
      "`statistics.quantiles` raised `StatisticsError` for a single data point before Python 3.13, so an endpoint with one request can crash the report. Guard small samples.",
      "Ruby's `JSON.parse` gives string keys; `r[:status]` is `nil` and `nil >= 500` raises `NoMethodError`.",
      "Go map iteration order is randomized, so two runs print endpoints in different orders. Sort before taking a top N or diffing outputs.",
    ],
    atScale: [
      "At terabytes per day, scanning files on one box is the wrong tool. Query Loki, Elasticsearch or Datadog, where the index or label store does the filtering, or better, have services emit request counters and latency histograms so the question is a metrics query.",
      "High-cardinality keys: raw paths with IDs (`/users/123/orders`) create one map entry and one duration list per user. Normalize paths to routes before counting, or memory grows with distinct values instead of with endpoints.",
      "Exact percentiles keep every sample. Pipelines over many files use mergeable sketches or fixed histogram buckets, so per-file results can be combined; you cannot average p95s.",
      "CPU-bound parsing: in CPython and CRuby only one thread runs interpreter code at a time, so threads won't use more cores. Run one process per file (Python `multiprocessing`) and merge the counts, or use Go, where goroutines spread across cores.",
      "Rotated, compressed files: Python `gzip.open(path, \"rt\")`, Go `gzip.NewReader(f)` and Ruby `Zlib::GzipReader` all stream, but decompression costs CPU. Spread files across workers rather than reading one huge concatenated stream.",
    ],
    agentic: [
      "Agents handle this shape well: describe one log line and the question, and a `Counter` or `bufio.Scanner` version arrives quickly. Review it for this chapter's traps (`sc.Err()` checked after the loop, paths normalized to routes, no threads added to a CPU-bound parser on GIL-enabled CPython or CRuby, where they usually add no throughput; check the runtime and libraries first), then run the jq or awk baseline on the same file and diff the counts.",
      "If the logs already live in Loki, Elasticsearch or Datadog, the right output from an agent is a query in that platform's language, not a script that copies gigabytes to a laptop. Better still is a counter and a histogram from the service, so the question becomes a metrics query.",
      "Pasting raw log lines into an agent sends whatever they contain (tokens, emails, user IDs) to the model provider; even K8sGPT's `--anonymize` leaves log and event data unmasked. Logs are also untrusted input that can carry prompt injection, so give the agent the schema and a scrubbed sample, not the production file.",
    ],
    code: [
      { lang: "python", label: "Python · json, collections, statistics (stdlib)", src: `import gzip
import json
import sys
from collections import Counter, defaultdict
from statistics import quantiles


def summarize(path, top=10):
    reqs, errs = Counter(), Counter()
    ms = defaultdict(list)  # one list per endpoint: memory grows with traffic
    opener = gzip.open if path.endswith(".gz") else open  # functions are values
    with opener(path, "rt", encoding="utf-8") as f:  # closed even on exceptions
        for line in f:  # lazy: one line in memory at a time
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue  # count bad lines in real code
            reqs[r["path"]] += 1
            errs[r["path"]] += r["status"] >= 500  # bool adds as 0 or 1
            ms[r["path"]].append(r["duration_ms"])
    for path, n in reqs.most_common(top):  # a generator: caller pulls rows
        d = ms[path]
        p95 = quantiles(d, n=20)[-1] if len(d) > 1 else d[0]  # stdlib percentile
        yield {"path": path, "requests": n, "err_rate": errs[path] / n, "p95_ms": p95}


if __name__ == "__main__":
    for row in summarize(sys.argv[1]):
        print(json.dumps(row))` },
      { lang: "go", label: "Go · bufio.Scanner + encoding/json (stdlib)", src: `// imports: bufio, encoding/json, io, slices
type entry struct { // the log schema, written down
	Path   string  \`json:"path"\`
	Status int     \`json:"status"\`
	Ms     float64 \`json:"duration_ms"\`
}

type stats struct {
	Reqs, Errs int
	ms         []float64
}

func summarize(r io.Reader) (map[string]*stats, error) {
	by := map[string]*stats{}
	// Any io.Reader works: *os.File, gzip.NewReader(f), os.Stdin.
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 64*1024), 1<<20) // allow 1 MiB lines, not 64 KiB
	for sc.Scan() {
		var e entry
		if err := json.Unmarshal(sc.Bytes(), &e); err != nil {
			continue // count bad lines in real code
		}
		s, ok := by[e.Path]
		if !ok { // no default values: look up, then insert
			s = &stats{}
			by[e.Path] = s
		}
		s.Reqs++
		if e.Status >= 500 {
			s.Errs++
		}
		s.ms = append(s.ms, e.Ms)
	}
	return by, sc.Err() // a too-long line only shows up here
}

func p95(ms []float64) float64 { // no percentile in the stdlib: nearest rank
	slices.Sort(ms)
	return ms[(len(ms)*95+99)/100-1]
}` },
      { lang: "ruby", label: "Ruby · JSON + Enumerable (stdlib)", src: `require "json"
require "zlib"

def lines_of(path, &blk)              # the block is passed along like a callback
  return Zlib::GzipReader.open(path) { |gz| gz.each_line(&blk) } if path.end_with?(".gz")
  File.foreach(path, &blk)            # one line at a time
end

stats = Hash.new { |h, k| h[k] = { reqs: 0, errs: 0, ms: [] } }  # default per new key
lines_of(ARGV.fetch(0)) do |line|
  r = JSON.parse(line)                # string keys: r["path"], not r[:path]
  s = stats[r["path"]]
  s[:reqs] += 1
  s[:errs] += 1 if r["status"] >= 500
  s[:ms] << r["duration_ms"]
rescue JSON::ParserError              # rescue directly inside a do/end block
  next
end

stats.max_by(10) { |_path, s| s[:reqs] }.each do |path, s|  # top N, no full sort
  ms = s[:ms].sort
  p95 = ms[(ms.size * 95 + 99) / 100 - 1]  # no stdlib percentile: nearest rank
  puts JSON.generate({ path: path, requests: s[:reqs],
                       err_rate: s[:errs].fdiv(s[:reqs]), p95_ms: p95 })
end` },
    ],
    codeNote: "Baselines: `jq -r 'select(.status >= 500) | .path' access.log | sort | uniq -c | sort -rn | head` for JSON lines, or `awk '{n[$7]++} $9 >= 500 {e[$7]++} END {for (p in n) print p, n[p], e[p]/n[p]}' access.log` for the combined format, where `$7` is the path and `$9` the status. The p95s are approximate: Python interpolates between samples, Go and Ruby take the nearest rank. In Go, `main` opens the file, defers `Close`, and wraps it in `gzip.NewReader` for `.gz`. All three versions and the awk line were run on the same generated log and agree on counts; a 2 MB line made the Go version report `token too long` through `sc.Err()`.",
    compare: [
      { lang: "Python", idiom: "A generator over a file object, `json.loads` into dicts, `Counter` and `defaultdict` for tallies, `statistics.quantiles` for p95.", good: ["Shortest code: every piece is in the stdlib, percentiles included", "Generators keep the whole pipeline streaming"], bad: ["One core for CPU-bound parsing because of the GIL (the default build; the free-threaded 3.13t+ build is still opt-in)", "Dicts hide schema drift until a `KeyError` halfway through the file"] },
      { lang: "Go", idiom: "`bufio.Scanner` over an `io.Reader`, `json.Unmarshal` into a tagged struct, a map of pointers, then an explicit sort.", good: ["`io.Reader` composes: file, gzip and stdin plug into the same code", "Compiled, and easy to spread across cores with goroutines", "The struct documents the log schema"], bad: ["64 KiB default line cap that fails quietly unless you check `Err()`", "No map defaults, no percentile, random map order: more code"] },
      { lang: "Ruby", idiom: "`File.foreach` with a block (or an Enumerator with `.lazy`), `JSON.parse` into Hashes, a Hash default block, `max_by(n)`.", good: ["Enumerable chains read like the question being asked", "`rescue` inside a `do` block skips bad lines neatly"], bad: ["String keys from `JSON.parse` surprise code written with symbols", "GVL: threads don't parallelize parsing, so like Python you run one process per file"] },
    ],
    quiz: [
      { q: "Your Go log parser counts far fewer lines than `wc -l`, with no error printed. What is the likely cause?", a: "A line longer than the Scanner's 64 KiB default made `Scan()` return false. The loop ended early and `ErrTooLong` is only in `sc.Err()`, which wasn't checked. Raise the limit with `sc.Buffer` and check `Err()`." },
      { q: "Why doesn't adding threads speed up the Python parser, and what would?", a: "Parsing is CPU-bound, and in the default GIL-enabled CPython only one thread runs Python bytecode at a time. Use one process per file with `multiprocessing` and merge the counts, use Go, or push the query to the log platform." },
      { q: "Why is a raw path like `/users/123/orders` a bad map key at scale?", a: "Every distinct ID creates its own entry and duration list, so memory grows with users, not endpoints, and the report is useless. Normalize paths to route templates before counting." },
    ],
    incidents: [],
    sources: [
      { title: "Python: statistics.quantiles", url: "https://docs.python.org/3/library/statistics.html" },
      { title: "Python: gzip", url: "https://docs.python.org/3/library/gzip.html" },
      { title: "Python: threading (GIL note)", url: "https://docs.python.org/3/library/threading.html" },
      { title: "Go: package bufio", url: "https://pkg.go.dev/bufio" },
      { title: "Go: package encoding/json", url: "https://pkg.go.dev/encoding/json" },
      { title: "Go: package compress/gzip", url: "https://pkg.go.dev/compress/gzip" },
      { title: "Ruby: IO.foreach", url: "https://docs.ruby-lang.org/en/master/IO.html" },
      { title: "Ruby: Enumerable", url: "https://docs.ruby-lang.org/en/master/Enumerable.html" },
      { title: "Ruby: Zlib::GzipReader", url: "https://docs.ruby-lang.org/en/master/Zlib/GzipReader.html" },
      { title: "Ruby: Thread (GVL)", url: "https://docs.ruby-lang.org/en/master/Thread.html" },
      { title: "K8sGPT README (anonymization limits)", url: "https://github.com/k8sgpt-ai/k8sgpt" },
      { title: "Simon Willison: The lethal trifecta for AI agents", url: "https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/" },
    ],
  },
  {
    id: "rest-api",
    n: 3,
    title: "Calling a REST API properly: timeouts, retries, pagination",
    question: "List every issue in a GitHub repository without hanging, hammering the API or missing pages. Where do Python's requests, Go's go-retryablehttp and Ruby's Faraday put each piece?",
    view: [920, 440],
    groups: GROUPS("The task: page through GET /repos/{owner}/{repo}/issues"),
    nodes: [
      ...top([
        ["t1", "Script", "token from GITHUB_TOKEN", "actor"],
        ["t2", "Retrying client", "timeouts + backoff"],
        ["t3", "GitHub REST API", "/repos/o/r/issues"],
        ["t4", "Link header", "rel=\"next\" until none"],
      ]),
      ...lane("py", 148, [
        ["Session + HTTPAdapter", "mounted per URL prefix"],
        ["s.get(timeout=...)", "no default timeout"],
        ["urllib3 Retry", "status_forcelist"],
        ["r.links[\"next\"]", "generator yields"],
      ]),
      ...lane("go", 256, [
        ["retryablehttp.Client", "wraps *http.Client"],
        ["NewRequestWithContext", "ctx bounds all tries"],
        ["CheckRetry + Backoff", "plain func fields"],
        ["regexp on Link", "no stdlib parser"],
      ]),
      ...lane("rb", 364, [
        ["Faraday.new { |f| }", "middleware stack"],
        ["conn.get(url)", "request: { timeout: }"],
        [":retry middleware", "retry_statuses: [429...]"],
        ["Enumerator.new", "yielder, like a gen"],
      ]),
    ],
    edges: [
      { id: "e-t1", from: "t1", to: "t2", label: "calls" },
      { id: "e-t2", from: "t2", to: "t3", label: "GET", bidir: true },
      { id: "e-t3", from: "t3", to: "t4", label: "sends" },
      ...laneEdges("py"), ...laneEdges("go"), ...laneEdges("rb"),
    ],
    steps: [
      { text: "The task: list every issue in a repository. The mechanism is the same everywhere: a client with a token, timeouts and retries; a GET; on 429 or 5xx, wait and retry; then follow the `Link` header's `next` URL until there is none. The lanes show where each library puts those pieces." },
      { text: "Baseline: `gh api --paginate repos/OWNER/REPO/issues --jq '.[].title'` already follows every page. Write code when you need to join the result with other data, run it on a schedule, or act on what you find.", on: ["t1", "t2", "t3", "t4"], flow: ["e-t1", "e-t2", "e-t3"] },
      { text: "Building the client. Python mounts an `HTTPAdapter` with a `Retry` policy on a `Session`, per URL prefix. Go wraps a pooled `*http.Client` in a `retryablehttp.Client` whose policy lives in function fields. Ruby's Faraday builds a Rack-style middleware stack inside a block.", on: ["t2", ...col(1)] },
      { text: "The token comes from the environment and travels as `Authorization: Bearer ...`. Never put it in code, in a flag or in a URL: command lines show up in `ps` and shell history, URLs in proxy logs.", on: ["t1", "py1", "go1", "rb1"], flow: ["e-t1"] },
      { text: "Timeouts. `requests` has no default timeout, so one stalled server hangs the script; pass `timeout=(connect, read)` on every call. In Go, `http.Client.Timeout` bounds one attempt and the request's `context` bounds the whole call, retries included. Faraday takes `request: { open_timeout:, timeout: }`.", on: col(2), flow: ["e-py1", "e-go1", "e-rb1"] },
      { text: "Retries. urllib3's `Retry` retries `status_forcelist` codes for idempotent methods and honors `Retry-After` by default. go-retryablehttp's default policy retries connection errors, 429 and 5xx except 501, and honors `Retry-After` on 429 and 503. faraday-retry retries only timeouts until you list `retry_statuses`.", on: ["t2", "t3", ...col(3)], flow: ["e-t2", "e-py2", "e-go2", "e-rb2"] },
      { text: "Ruby trap: middleware order is wrapping order. Put `:raise_error` before `:retry` so it sees only the final response. Put it after, and a 503 becomes an exception that `:retry` doesn't rescue by default, so nothing is retried.", on: ["rb1", "rb3"] },
      { text: "Go trap: retryablehttp's default policy never looks at the method, so it retries a POST as readily as a GET. urllib3 and faraday-retry retry only idempotent methods unless told otherwise. Its default backoff also has no jitter; `LinearJitterBackoff` adds some.", on: ["go3"] },
      { text: "Pagination. `requests` parses the `Link` header into `r.links`. Neither Go's standard library nor Faraday does, so those snippets pull `rel=\"next\"` out with a regex. GitHub's docs say to follow these URLs, not to build page numbers yourself.", on: ["t4", ...col(4)], flow: ["e-t3", "e-py3", "e-go3", "e-rb3"] },
      { text: "Laziness. The Python generator and the Ruby `Enumerator` fetch the next page only when the caller asks, so taking five issues costs one request. The Go function returns a full slice; a lazy version would take a callback or return an iterator (`iter.Seq`, Go 1.23+).", on: ["py4", "go4", "rb4"] },
      { text: "When retries run out: requests raises `RetryError`; retryablehttp closes the body and returns an error saying it gave up after N attempts; faraday-retry hands back the last response, which `:raise_error` turns into `Faraday::ServerError` or `Faraday::TooManyRequestsError`.", on: col(3) },
    ],
    say30: "In every language I want the same things: the token from the environment, a timeout on every call, retries with backoff only for 429, 5xx and network errors, honoring Retry-After, and pagination by following the Link header. The difference is where that lives. In Python I mount a urllib3 Retry on a requests Session, and r.links parses Link for me. Go's retryablehttp makes the policy a pair of swappable functions and the context bounds everything, but I parse Link myself and close every body in the loop. Ruby's Faraday is a middleware stack where line order matters. I'd pick Python for a script and Go for a long-lived service or a shared client library.",
    gotchas: [
      "`requests` never times out unless you pass `timeout=`. A script without it can hang forever on one stalled connection, and cron starts another copy on the next tick. Even with it, the read timeout is the wait between bytes, not a cap on the whole response: a server that sends a byte now and then can hold a call open far past 30 seconds, so a scheduled job needs an overall deadline too.",
      "In Faraday, `f.response :raise_error` listed after `f.request :retry` raises inside the retry layer, so 5xx responses are never retried. List `:raise_error` first.",
      "go-retryablehttp retries any method by default, POST included. Give it a `CheckRetry` that refuses non-idempotent requests, or send an idempotency key.",
      "GitHub signals rate limits with 403 or 429. None of these policies retry 403, and blanket-retrying 403 hides real permission errors: check `retry-after` and `x-ratelimit-remaining` first.",
    ],
    atScale: [
      "Rate limits belong to the identity, not the script. An authenticated user gets 5,000 requests an hour, shared by every tool using that user's tokens, and OAuth apps acting for the user count against it too. Teams move automation to GitHub App installation tokens and watch `x-ratelimit-remaining`.",
      "Secondary limits punish concurrency: at most 100 concurrent requests and 900 points per minute per REST endpoint, with writes costing 5 points. GitHub recommends serial requests, so at scale one shared worker with a rate limiter beats every cron job fanning out on its own.",
      "Conditional requests: store the `ETag` and send `If-None-Match`; an authenticated `304` doesn't count against the primary limit. Polling a thousand repositories becomes cheap, and webhooks avoid polling entirely.",
      "Synchronized cron jobs all start at `:00`, get 429s together and, with un-jittered backoff, retry together. Add a random start delay and jittered backoff: urllib3 `backoff_jitter` (its first retry is immediate, so jitter only spreads the later ones), faraday-retry `interval_randomness`, retryablehttp `LinearJitterBackoff`.",
      "Connection reuse: a `Session`, a pooled `http.Client` or one Faraday connection keeps TCP and TLS warm. A new client per request at high volume burns handshakes, ephemeral ports and file descriptors, and in Go an unclosed body leaks the connection.",
    ],
    agentic: [
      "A generated client may hand-roll a `while` loop with `time.sleep` around each call. Ask for the existing policy instead (urllib3 `Retry`, retryablehttp's `CheckRetry`, faraday-retry, or just `gh api --paginate`), then check what those libraries leave to you: `timeout=` on every requests call, POST excluded from retries, `:raise_error` listed before `:retry`.",
      "Hallucinated APIs look exactly like real ones: a keyword argument the library doesn't accept, or a Faraday option from another version. OWASP LLM09:2025 lists models suggesting non-existent libraries, and attackers register commonly hallucinated package names, so check every import and option against the docs and the lock file before installing anything.",
      "Retry layers multiply when the API is an LLM provider: Anthropic's SDKs already retry twice by default and honor `retry-after`, so a retry loop around them multiplies attempts. A tier spend-cap 429 carries no `retry-after` and won't clear by retrying, and a spend limit you set yourself returns 400, which is the 403-versus-429 lesson from GitHub again.",
    ],
    code: [
      { lang: "python", label: "Python · requests + urllib3 Retry", src: `import os

import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

API = "https://api.github.com"


def github() -> requests.Session:
    s = requests.Session()  # pooled connections, shared headers
    retry = Retry(total=5, backoff_factor=1, backoff_jitter=1,
                  status_forcelist=[429, 500, 502, 503, 504])  # idempotent methods only: no POST
    s.mount("https://", HTTPAdapter(max_retries=retry))  # Retry-After honored by default
    s.headers.update({"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                      "Accept": "application/vnd.github+json"})
    return s


def issues(s: requests.Session, repo: str):
    """A generator: the next page is fetched only when the caller wants more."""
    url = f"{API}/repos/{repo}/issues"
    params = {"state": "all", "per_page": 100}
    while url:
        r = s.get(url, params=params, timeout=(3.05, 30))  # requests has no default timeout
        r.raise_for_status()  # retries used up on a 5xx raise RetryError before this
        yield from r.json()
        url, params = r.links.get("next", {}).get("url"), None  # next URL has the params


if __name__ == "__main__":
    for issue in issues(github(), "psf/requests"):
        if "pull_request" not in issue:  # the issues API returns PRs too
            print(issue["number"], issue["title"])` },
      { lang: "go", label: "Go · net/http + hashicorp/go-retryablehttp", src: `// imports: context, encoding/json, fmt, net/http, os, regexp, time, go-retryablehttp
var nextLink = regexp.MustCompile(\`<([^>]+)>;\\s*rel="next"\`) // no Link parser in stdlib

type Issue struct {
	Number int    \`json:"number"\`
	Title  string \`json:"title"\`
}

func ListIssues(ctx context.Context, repo string) ([]Issue, error) {
	c := retryablehttp.NewClient()          // 4 retries, waits 1s..30s, Retry-After on 429/503
	c.HTTPClient.Timeout = 30 * time.Second // per attempt; ctx bounds the whole call
	var all []Issue
	url := "https://api.github.com/repos/" + repo + "/issues?state=all&per_page=100"
	for url != "" {
		req, err := retryablehttp.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+os.Getenv("GITHUB_TOKEN"))
		resp, err := c.Do(req) // 429 and 5xx are retried inside Do
		if err != nil {
			return nil, err // "... giving up after N attempt(s)"
		}
		var page []Issue
		if resp.StatusCode == http.StatusOK {
			err = json.NewDecoder(resp.Body).Decode(&page)
		} else {
			err = fmt.Errorf("GET %s: %s", url, resp.Status)
		}
		resp.Body.Close() // in a loop: close now, not with defer
		if err != nil {
			return nil, err
		}
		all = append(all, page...)
		url = ""
		if m := nextLink.FindStringSubmatch(resp.Header.Get("Link")); m != nil {
			url = m[1]
		}
	}
	return all, nil
}` },
      { lang: "ruby", label: "Ruby · Faraday + faraday-retry", src: `require "faraday"
require "faraday/retry"

def github
  Faraday.new(url: "https://api.github.com",
              headers: { "Authorization" => "Bearer #{ENV.fetch('GITHUB_TOKEN')}",
                         "Accept" => "application/vnd.github+json" },
              request: { open_timeout: 3, timeout: 30 }) do |f|
    f.response :raise_error   # outermost: sees only the final response
    f.request :retry, max: 4, interval: 1, backoff_factor: 2, interval_randomness: 0.5,
                      retry_statuses: [429, 500, 502, 503, 504]  # 429: waits for Retry-After
    f.response :json          # innermost: parses each body into Hashes
  end
end

def issues(conn, repo)
  Enumerator.new do |y|       # lazy, like a Python generator
    url = "/repos/#{repo}/issues?state=all&per_page=100"
    while url
      resp = conn.get(url)
      resp.body.each { |issue| y << issue }
      url = resp.headers["link"]&.[](/<([^>]+)>;\\s*rel="next"/, 1)  # nil ends the loop
    end
  end
end

issues(github, "rails/rails").lazy.reject { |i| i.key?("pull_request") }.first(5)` },
    ],
    codeNote: "Baseline: `gh api --paginate repos/OWNER/REPO/issues --jq '.[].title'`. For GitHub itself, client libraries such as Octokit.rb (GitHub's own) and go-github handle pagination and rate-limit headers; the generic clients shown here are what you use for every other REST API. All three were run against a local fake API that answers a 429 with `Retry-After: 1`, then a 503, then three `Link` pages: each waited, retried and collected every page. Swapping Faraday's `:raise_error` below `:retry` made the first 429 raise with no retry.",
    compare: [
      { lang: "Python", idiom: "Policy objects: a urllib3 `Retry` mounted on a requests `Session` through an `HTTPAdapter`, plus a generator that follows `r.links`.", good: ["`r.links` parses Link headers, and `Retry` honors `Retry-After` by default", "A generator makes pagination lazy for free"], bad: ["No default timeout: forget `timeout=` and a call can hang forever", "Retry options live in urllib3, not requests, so the docs are split across two projects"] },
      { lang: "Go", idiom: "A wrapper client whose retry policy is plain function fields (`CheckRetry`, `Backoff`), with a `context` carrying the deadline.", good: ["Policy is just functions: easy to swap or test", "`context` cancels in-flight requests and the waits between them", "`StandardClient()` drops into code that expects `*http.Client`"], bad: ["No Link parser in the stdlib, and every body must be closed inside the loop", "Default policy retries any method, POST included; default backoff has no jitter", "The default logger writes a `[DEBUG]` line per request to stderr; set `Logger` to quiet it"] },
      { lang: "Ruby", idiom: "A Faraday middleware stack built in a block, with error raising, retry and JSON parsing as layers, and an `Enumerator` for pages.", good: ["Middleware composes cross-cutting concerns cleanly", "`Enumerator` with `.lazy` gives on-demand paging, like a generator"], bad: ["The order of `f.request`/`f.response` lines silently changes behavior", "Retry is a separate gem (`faraday-retry`) and retries only timeouts until configured"] },
    ],
    quiz: [
      { q: "A Faraday client has `retry_statuses: [503]`, yet 503s are never retried. What's the likely cause?", a: "`:raise_error` is listed after `:retry`, so it is inside the retry layer and turns the 503 into `Faraday::ServerError`, which isn't in faraday-retry's default exception list. List `:raise_error` first." },
      { q: "What does Go's request `context` give you that `http.Client.Timeout` alone does not?", a: "`Timeout` bounds one attempt. The context bounds the whole operation, including every retry and the waits between them, and retryablehttp stops retrying once the context is done." },
      { q: "GitHub answers 403 with `x-ratelimit-remaining: 0`. What should the script do?", a: "It's a primary rate limit, not a permission error: wait until the time in `x-ratelimit-reset`, then continue. If a `retry-after` header is present, wait that long instead. Don't retry immediately." },
    ],
    incidents: ["travisci-2016-gce-vm-images-deleted"],
    sources: [
      { title: "requests: Advanced usage (timeouts, Link headers, retries)", url: "https://requests.readthedocs.io/en/latest/user/advanced/" },
      { title: "urllib3: Retry", url: "https://urllib3.readthedocs.io/en/stable/reference/urllib3.util.html" },
      { title: "go-retryablehttp (pkg.go.dev)", url: "https://pkg.go.dev/github.com/hashicorp/go-retryablehttp" },
      { title: "go-retryablehttp: client.go", url: "https://github.com/hashicorp/go-retryablehttp/blob/main/client.go" },
      { title: "faraday-retry README", url: "https://github.com/lostisland/faraday-retry" },
      { title: "Faraday: middleware order", url: "https://github.com/lostisland/faraday/blob/main/docs/middleware/index.md" },
      { title: "Faraday: raising errors", url: "https://github.com/lostisland/faraday/blob/main/docs/middleware/included/raising-errors.md" },
      { title: "GitHub REST: pagination", url: "https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api" },
      { title: "GitHub REST: rate limits", url: "https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api" },
      { title: "GitHub REST: best practices", url: "https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api" },
      { title: "GitHub REST: list repository issues", url: "https://docs.github.com/en/rest/issues/issues#list-repository-issues" },
      { title: "GitHub CLI: gh api", url: "https://cli.github.com/manual/gh_api" },
      { title: "OWASP LLM09:2025 Misinformation", url: "https://genai.owasp.org/llmrisk/llm092025-misinformation/" },
      { title: "Claude API: errors (SDK retries)", url: "https://platform.claude.com/docs/en/api/errors" },
      { title: "Claude API: rate limits (spend-cap 429)", url: "https://platform.claude.com/docs/en/api/rate-limits" },
    ],
  },
  {
    id: "aws-sdk",
    n: 4,
    title: "AWS inventory and cleanup with the SDKs",
    question: "Find unattached EBS volumes in every region, report size and age, and delete them only with `--apply`. How do boto3, aws-sdk-go-v2 and the Ruby SDK shape pagination, errors and concurrency?",
    view: [920, 440],
    groups: GROUPS("The task: list status=available volumes per region, then act"),
    nodes: [
      ...top([
        ["t1", "Operator / cron", "--apply is off", "actor"],
        ["t2", "SDK client", "default cred chain"],
        ["t3", "EC2 API", "one per region"],
        ["t4", "Unattached volumes", "status=available", "store"],
      ]),
      ...lane("py", 148, [
        ["boto3.Session()", "client per region"],
        ["get_paginator()", "for page in pages"],
        ["except ClientError", "branch on Error.Code"],
        ["ThreadPoolExecutor", "I/O releases the GIL"],
      ]),
      ...lane("go", 256, [
        ["LoadDefaultConfig", "NewFromConfig(cfg, ...)"],
        ["HasMorePages loop", "NextPage(ctx)"],
        ["errors.As(APIError)", "ErrorCode()"],
        ["errgroup.SetLimit", "goroutine per region"],
      ]),
      ...lane("rb", 364, [
        ["Aws::EC2::Client.new", "region:, retry_mode:"],
        ["response.flat_map", "pages are Enumerable"],
        ["rescue DryRunOperation", "class from error code"],
        ["Thread.new + join", "GVL freed on I/O"],
      ]),
    ],
    edges: [
      { id: "e-t1", from: "t1", to: "t2", label: "runs" },
      { id: "e-t2", from: "t2", to: "t3", label: "calls", bidir: true },
      { id: "e-t3", from: "t3", to: "t4", label: "lists" },
      ...laneEdges("py"), ...laneEdges("go"), ...laneEdges("rb"),
    ],
    steps: [
      { text: "The task: find EBS volumes with `status` = `available` (attached to nothing) in every region, report size and age, and delete only with `--apply`. All three SDKs share the credential chain, pagination and retry modes; they differ in how pages, errors and concurrency look in code." },
      { text: "Baseline: `aws ec2 describe-volumes --filters Name=status,Values=available --query 'Volumes[].[VolumeId,Size,CreateTime]' --output table`, once per region. The CLI paginates for you. Code earns its place once you loop regions and accounts, look up owners in tags, or delete safely.", on: ["t1", "t2", "t3", "t4"], flow: ["e-t1", "e-t2", "e-t3"] },
      { text: "Credentials come from the default chain in every SDK: environment, shared config with SSO or an assumed role, then container or instance roles. No access keys in code. Python makes clients from a `Session`; Go loads one `aws.Config` and makes per-region clients with `NewFromConfig`; Ruby passes `region:` to the client.", on: ["t2", ...col(1)], flow: ["e-t1"] },
      { text: "Pagination. boto3's paginator is a Python iterator, so a `for` loop pulls pages. Go's is an explicit loop: `HasMorePages()`, then `NextPage(ctx)` with an error check each time. Ruby's response is itself Enumerable over pages, so `flat_map(&:volumes)` walks them all.", on: ["t3", ...col(2)], flow: ["e-t2", "e-py1", "e-go1", "e-rb1"] },
      { text: "Ruby trap: Enumerable methods on a pageable response make more API calls as they go. The SDK overrides `count` so it doesn't page through everything, which means `count` doesn't count your volumes; count after `flat_map` instead.", on: ["rb2"] },
      { text: "Go detail: almost every field is a pointer (`*string`, `*int32`, `*time.Time`) so the SDK can tell \"not set\" from zero. Inputs use `aws.String(...)`; outputs use `aws.ToString(...)`, which returns \"\" for nil instead of panicking.", on: ["go1", "go2"] },
      { text: "DryRun. With `DryRun` set, EC2 checks permissions and answers with an error: `DryRunOperation` if the call would have succeeded, `UnauthorizedOperation` if not. Python reads `e.response[\"Error\"][\"Code\"]`; Go uses `errors.As` into `smithy.APIError`; Ruby rescues `Aws::EC2::Errors::DryRunOperation`, a generated class.", on: ["t4", ...col(3)], flow: ["e-py2", "e-go2", "e-rb2"] },
      { text: "Report, then act. Each version prints every candidate before deleting anything, and without `--apply` every delete is a dry run. Deletion is permanent: check an owner tag first, and snapshot anything someone might still want.", on: ["t1", "t4", "py3", "go3", "rb3"] },
      { text: "Fan-out across regions is I/O-bound. Python uses a `ThreadPoolExecutor`; boto3 clients are thread-safe but sessions are not, so clients are built first. Go runs a goroutine per region under `errgroup.SetLimit`, and the first error cancels the rest. Ruby threads overlap because the GVL is released during network I/O.", on: col(4), flow: ["e-py3", "e-go3", "e-rb3"] },
      { text: "Throttling. EC2 rate-limits each account per region. Set the retry mode explicitly: boto3's guide and the Ruby SDK still list `legacy` as their default, while Go's default retryer is standard with 3 attempts. `adaptive` adds a client-side rate limiter that can delay first attempts too.", on: ["t2", "t3", "py1", "go1", "rb1"], flow: ["e-t2"] },
    ],
    say30: "All three SDKs share the parts that matter: the default credential chain, so no keys in code; built-in pagination; retry modes for throttling; and EC2's DryRun flag. The structure differs. boto3 gives me a paginator I loop over like any iterator, plus one ClientError I branch on by code. Go makes pagination an explicit HasMorePages and NextPage loop with an error check per page, pointer fields everywhere, and errgroup for bounded fan-out across regions, which is the cleanest concurrency of the three. Ruby's response is simply Enumerable and errors are real classes like DryRunOperation, so it reads beautifully. For a one-off audit I'd use Python; for a scheduled multi-account cleaner, Go.",
    gotchas: [
      "A successful dry run is an error (`DryRunOperation`). Treat every exception as failure and dry runs look broken; swallow every exception and real `UnauthorizedOperation` failures vanish. Match the code.",
      "In a boto3 `Config`, `max_attempts` counts retries only, while `AWS_MAX_ATTEMPTS` and the config file count the first request too. The boto3 guide recommends `total_max_attempts` in code.",
      "boto3 sessions are not thread-safe, and `boto3.client()` uses a shared default session. Create clients in the main thread and share the clients.",
      "In Go, `*v.Size` panics if the field is nil. Use `aws.ToInt32`, `aws.ToString` and friends on every output field.",
    ],
    atScale: [
      "EC2 throttles each account per region with token buckets. Buckets are per API action: `DescribeVolumes` with a filter or pagination gets the non-mutating size (100 burst, 20 per second refill); with neither, it drops to a smaller bucket (50, 10 per second). `DeleteVolume` has its own (100, refill 5 per second), so a mass delete must pace itself.",
      "Many accounts: list accounts through Organizations, assume a read-only role in each with STS, and loop regions inside. That is accounts times regions times pages, so bound concurrency per account (an `errgroup` limit or a thread pool), since limits are per account and region.",
      "Retry modes: `standard` retries throttling with jittered backoff and a retry quota that stops retrying when most calls fail. `adaptive` adds a client-side rate limiter that slows every call from that client, which suits one hot API but not a scanner that touches many.",
      "Don't scan to find drift: AWS Config's `ec2-volume-inuse-check` rule flags unattached volumes continuously, and Resource Explorer searches across regions and, with Organizations, accounts. Keep the script for the act-on-it step, with tags deciding ownership.",
      "Cleanup jobs cause outages. One flooded a cloud provider's API until it was rate limited; another read only the first 100 images and deleted the rest as unused. Cap deletions per run, pace them, and stop if the listing looks incomplete.",
    ],
    agentic: [
      "Dry-run by default matters more once an agent can run the script. Google's SRE team describes routing agent changes through a gateway that enforces dry-runs, and EC2's `DryRun` gives you that check per call; review that the `DryRunOperation` branch matches the error code, because code that treats every exception as failure, or swallows them all, breaks the check silently.",
      "The default credential chain picks up whatever profile the shell has, so an agent running this script inherits your session. Give it a distinct read-only role, assumed with STS as the multi-account pattern already does, and keep `--apply` with a human; Google's guidance is least-privilege agent identities, never a developer's standing credentials (see Agentic Engineering, Drawn).",
      "Check each generated call against the SDK reference, since paginator names and boto3's `max_attempts` versus `total_max_attempts` are easy to get plausibly wrong, and test against stubs as the Ruby version here did. Before that, ask whether AWS Config's `ec2-volume-inuse-check` already answers the question with no code.",
    ],
    code: [
      { lang: "python", label: "Python · boto3 paginator", src: `from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def unattached(ec2):  # generator: the paginator fetches pages on demand
    pages = ec2.get_paginator("describe_volumes").paginate(
        Filters=[{"Name": "status", "Values": ["available"]}])
    for page in pages:
        for v in page["Volumes"]:  # plain dicts, keys as in the API reference
            age = datetime.now(timezone.utc) - v["CreateTime"]
            yield ec2, {"id": v["VolumeId"], "gib": v["Size"], "age_days": age.days}


def delete(ec2, vol_id, apply):
    try:
        ec2.delete_volume(VolumeId=vol_id, DryRun=not apply)
    except ClientError as e:  # one class for every API error: branch on the code
        if e.response["Error"]["Code"] != "DryRunOperation":
            raise  # DryRunOperation means "would have succeeded"


def main(apply=False):
    session = boto3.Session()  # default chain: env, SSO, assume-role, instance role
    cfg = Config(retries={"mode": "standard"})
    regions = session.client("ec2", config=cfg).describe_regions()["Regions"]
    # Clients are thread-safe, sessions are not: build every client here.
    clients = [session.client("ec2", region_name=r["RegionName"], config=cfg) for r in regions]
    with ThreadPoolExecutor(max_workers=8) as pool:  # I/O-bound: threads are fine
        found = [x for xs in pool.map(lambda c: list(unattached(c)), clients) for x in xs]
    for ec2, vol in found:  # report everything, then act
        print(ec2.meta.region_name, vol["id"], vol["gib"], vol["age_days"])
        delete(ec2, vol["id"], apply)` },
      { lang: "go", label: "Go · aws-sdk-go-v2 DescribeVolumesPaginator", src: `// imports: context, errors, fmt, time; aws, ec2, ec2/types (aws-sdk-go-v2); smithy-go
func cleanRegion(ctx context.Context, c *ec2.Client, apply bool) error {
	p := ec2.NewDescribeVolumesPaginator(c, &ec2.DescribeVolumesInput{
		Filters: []types.Filter{{Name: aws.String("status"), Values: []string{"available"}}},
	})
	var vols []types.Volume
	for p.HasMorePages() { // explicit loop: one API call per NextPage
		page, err := p.NextPage(ctx)
		if err != nil {
			return fmt.Errorf("describe volumes: %w", err) // wrap, keep the cause
		}
		vols = append(vols, page.Volumes...)
	}
	for _, v := range vols { // report everything first; fields are pointers
		age := time.Since(aws.ToTime(v.CreateTime)).Round(time.Hour)
		fmt.Println(aws.ToString(v.VolumeId), aws.ToInt32(v.Size), "GiB", age)
	}
	for _, v := range vols {
		_, err := c.DeleteVolume(ctx, &ec2.DeleteVolumeInput{VolumeId: v.VolumeId, DryRun: aws.Bool(!apply)})
		var apiErr smithy.APIError
		if errors.As(err, &apiErr) && apiErr.ErrorCode() == "DryRunOperation" {
			continue // dry run: "would have succeeded"
		}
		if err != nil {
			return err
		}
	}
	return nil
}

// Caller: g, ctx := errgroup.WithContext(ctx); g.SetLimit(8)
// for _, c := range regionClients { g.Go(func() error { return cleanRegion(ctx, c, apply) }) }
// err := g.Wait() // first error; ctx cancels the other regions` },
      { lang: "ruby", label: "Ruby · aws-sdk-ec2 pageable responses", src: `require "aws-sdk-ec2"

def unattached(ec2)
  ec2.describe_volumes(filters: [{ name: "status", values: ["available"] }])
     .flat_map(&:volumes)                   # Enumerable over pages: fetches every page
end

def clean_region(region, apply)
  ec2 = Aws::EC2::Client.new(region: region, retry_mode: "standard")  # default cred chain
  vols = unattached(ec2)
  vols.each do |v|                          # report everything first, then act
    age = ((Time.now - v.create_time) / 86_400).floor
    puts "#{region} #{v.volume_id} #{v.size} GiB #{age} days"
  end
  vols.each do |v|
    ec2.delete_volume(volume_id: v.volume_id, dry_run: !apply)
  rescue Aws::EC2::Errors::DryRunOperation  # class generated from the API error code
    next                                    # "would have succeeded"
  end
end

apply = ARGV.include?("--apply")
regions = Aws::EC2::Client.new.describe_regions.regions.map(&:region_name)
regions.map { |r| Thread.new { clean_region(r, apply) } }  # GVL is released on network I/O
       .each(&:join)                                       # join re-raises a thread's error` },
    ],
    codeNote: "Baseline: `for r in $(aws ec2 describe-regions --query 'Regions[].RegionName' --output text); do aws ec2 describe-volumes --region $r --filters Name=status,Values=available --query 'Volumes[].[VolumeId,Size,CreateTime]' --output table; done`. That's a report; reach for an SDK when you need owners from tags, many accounts, or a guarded delete. None of these touched a real AWS account. The Ruby version ran against the SDK's `stub_responses` (two pages, a stubbed `DryRunOperation`, then an `UnauthorizedOperation` that `join` re-raised); the Go version, with the errgroup caller, compiled and passed `go vet` against aws-sdk-go-v2; the Python version was only syntax-checked, with every call checked against the boto3 docs.",
    compare: [
      { lang: "Python", idiom: "Iterators everywhere: a paginator you `for` over, a generator that yields records, plain dicts with the API's key names, and one `ClientError` to branch on.", good: ["Paginator plus generator keeps pages lazy with almost no code", "Response dicts match the API reference key for key"], bad: ["EC2 models no error shapes, so it is all `ClientError` matched by code string (other services add `client.exceptions.*`)", "Sessions aren't thread-safe, and `boto3.client()` in a thread uses the shared default session"] },
      { lang: "Go", idiom: "Typed inputs and outputs, an explicit `HasMorePages`/`NextPage` loop, `errors.As` into `smithy.APIError`, and goroutines under `errgroup`.", good: ["Types catch a misspelled field at compile time", "`errgroup` gives bounded fan-out and cancel-on-first-error in a few lines"], bad: ["Pointer fields everywhere: `aws.String` and `aws.ToString` noise", "Every page costs an `if err != nil` block"] },
      { lang: "Ruby", idiom: "A response that is Enumerable over its pages, structs with snake_case readers, and error classes generated from API error codes.", good: ["`flat_map(&:volumes)` walks every page in one expression", "`rescue Aws::EC2::Errors::DryRunOperation` reads like the intent"], bad: ["Enumerable methods quietly trigger more API calls, and `count` is overridden", "Threads only overlap I/O (GVL), and the default retry mode is still `legacy`"] },
    ],
    quiz: [
      { q: "You call `DeleteVolume` with `DryRun=True` and get an exception. Did it fail?", a: "Not necessarily. EC2 answers a dry run with an error: `DryRunOperation` means the call would have succeeded, `UnauthorizedOperation` means you lack permission. Branch on the error code." },
      { q: "How does pagination look different in boto3, aws-sdk-go-v2 and the Ruby SDK?", a: "boto3: `get_paginator(...).paginate(...)` is an iterator you loop over. Go: `for p.HasMorePages() { page, err := p.NextPage(ctx) ... }` with an error check per page. Ruby: the response is Enumerable over pages, so `each_page` or `flat_map(&:volumes)` fetches the rest." },
      { q: "Your scan across 200 accounts starts failing with `RequestLimitExceeded`. What do you change?", a: "Bound concurrency per account and region, use paginated, filtered calls (they draw from the larger bucket), set the retry mode to `standard` or `adaptive`, and spread the schedule. Better, read the inventory from AWS Config or Resource Explorer." },
    ],
    incidents: ["travis-ci-2019-vm-cleanup-rate-limit", "travisci-2016-gce-vm-images-deleted", "atlassian-2022-site-deletion-script"],
    sources: [
      { title: "EC2 API: DescribeVolumes", url: "https://docs.aws.amazon.com/AWSEC2/latest/APIReference/API_DescribeVolumes.html" },
      { title: "AWS CLI: describe-volumes", url: "https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-volumes.html" },
      { title: "EC2: request throttling", url: "https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-throttling.html" },
      { title: "boto3: paginators", url: "https://docs.aws.amazon.com/boto3/latest/guide/paginators.html" },
      { title: "boto3: retries", url: "https://docs.aws.amazon.com/boto3/latest/guide/retries.html" },
      { title: "boto3: error handling", url: "https://docs.aws.amazon.com/boto3/latest/guide/error-handling.html" },
      { title: "boto3: clients (thread safety)", url: "https://docs.aws.amazon.com/boto3/latest/guide/clients.html" },
      { title: "AWS SDK for Go v2: using the SDK (paginators)", url: "https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/using.html" },
      { title: "AWS SDK for Go v2: retries and timeouts", url: "https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/configure-retries-timeouts.html" },
      { title: "AWS SDK for Go v2: handling errors", url: "https://docs.aws.amazon.com/sdk-for-go/v2/developer-guide/handle-errors.html" },
      { title: "Go: errgroup", url: "https://pkg.go.dev/golang.org/x/sync/errgroup" },
      { title: "AWS SDK for Ruby: PageableResponse", url: "https://docs.aws.amazon.com/sdk-for-ruby/v3/api/Aws/PageableResponse.html" },
      { title: "AWS SDKs: retry behavior", url: "https://docs.aws.amazon.com/sdkref/latest/guide/feature-retry-behavior.html" },
      { title: "AWS SDKs: credential providers", url: "https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html" },
      { title: "AWS Config: ec2-volume-inuse-check", url: "https://docs.aws.amazon.com/config/latest/developerguide/ec2-volume-inuse-check.html" },
      { title: "AWS Resource Explorer", url: "https://docs.aws.amazon.com/resource-explorer/latest/userguide/welcome.html" },
      { title: "Google SRE: AI in SRE", url: "https://sre.google/resources/practices-and-processes/ai-engineering-reliable-operations/" },
    ],
  },
];

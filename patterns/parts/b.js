// Chapters 5-8 of One Pattern, Three Languages: everyday SRE scripts with the standard library for the job
// in each language, and how Python, Go and Ruby shape the same solution differently.
// Spec format: see ../../k8s/README.md and ../../drawn/README.md (`code`, `codeNote`, `compare`, `atScale`).
//
// Shared layout for chapters 5-7: one lane per language (setup -> call -> result), the shared system on the
// right, the no-code baseline above it and the output below it. Chapter 8 mirrors it (Prometheus on the left).
export const CHAPTERS = [
  {
    id: "k8s-client",
    n: 5,
    title: "Find unhealthy Pods with the Kubernetes client",
    question: "You need a script that lists crash-looping, not-Ready or restart-heavy Pods across all namespaces, grouped by Deployment. How do Python, Go and Ruby structure that differently, and which would you pick?",
    view: [940, 460],
    groups: [
      { id: "g-py", label: "Python · kubernetes (official, generated)", x: 10, y: 10, w: 650, h: 130 },
      { id: "g-go", label: "Go · client-go (typed clientset)", x: 10, y: 160, w: 650, h: 130 },
      { id: "g-rb", label: "Ruby · kubeclient (thin REST wrapper)", x: 10, y: 310, w: 650, h: 130 },
    ],
    nodes: [
      { id: "py1", label: "load_*_config()", sub: "ConfigException: fallback", x: 25, y: 50, w: 190, h: 56 },
      { id: "py2", label: "LIST, paged", sub: "list_pod_for_all_namespaces", x: 235, y: 50, w: 190, h: 56 },
      { id: "py3", label: "V1Pod models", sub: "snake_case, None if unset", x: 445, y: 50, w: 190, h: 56 },
      { id: "go1", label: "rest.Config", sub: "InClusterConfig/clientcmd", x: 25, y: 200, w: 190, h: 56 },
      { id: "go2", label: "LIST, paged", sub: "Pods(\"\").List(ctx, opts)", x: 235, y: 200, w: 190, h: 56 },
      { id: "go3", label: "corev1.Pod structs", sub: "typed; pointers may be nil", x: 445, y: 200, w: 190, h: 56 },
      { id: "rb1", label: "Kubeclient::Config", sub: "context → Client.new", x: 25, y: 350, w: 190, h: 56 },
      { id: "rb2", label: "LIST, paged", sub: "get_pods(limit:, continue:)", x: 235, y: 350, w: 190, h: 56 },
      { id: "rb3", label: "RecursiveOpenStruct", sub: "camelCase; nil anywhere", x: 445, y: 350, w: 190, h: 56 },
      { id: "base", label: "kubectl get pods -A", sub: "-o json | jq", kind: "actor", x: 720, y: 40, w: 200, h: 60 },
      { id: "api", label: "kube-apiserver", sub: "GET /api/v1/pods", kind: "store", x: 720, y: 180, w: 200, h: 70 },
      { id: "out", label: "Report by owner", sub: "Deployment → bad Pods", x: 720, y: 350, w: 200, h: 60 },
    ],
    edges: [
      { id: "e-py-a", from: "py1", to: "py2" },
      { id: "e-py-b", from: "py2", to: "py3" },
      { id: "e-go-a", from: "go1", to: "go2" },
      { id: "e-go-b", from: "go2", to: "go3" },
      { id: "e-rb-a", from: "rb1", to: "rb2" },
      { id: "e-rb-b", from: "rb2", to: "rb3" },
      { id: "e-py", from: "py2", to: "api", label: "lists pages", via: [[330, 125], [690, 125]], labelPos: 0.4, bidir: true },
      { id: "e-go", from: "go2", to: "api", label: "lists pages", via: [[330, 275], [690, 275]], labelPos: 0.4, bidir: true },
      { id: "e-rb", from: "rb2", to: "api", label: "lists pages", via: [[330, 425], [690, 425], [690, 300]], labelPos: 0.3, bidir: true },
      { id: "e-base", from: "base", to: "api", label: "same API" },
      { id: "e-out", from: "api", to: "out", label: "group" },
    ],
    steps: [
      { text: "Same job, three lanes: load credentials, page through `LIST /api/v1/pods`, then classify and group. The HTTP calls are identical. What differs is how each language loads config, reports errors and shapes the objects it hands back." },
      { text: "Baseline first. `kubectl get pods -A -o json | jq` hits the same endpoint with the same RBAC, and `--field-selector=status.phase!=Running` filters on the server. For a one-off look that is enough; write code when you need grouping, thresholds or a cron job.", on: ["base", "api"], flow: ["e-base"] },
      { text: "Python loads config as a side effect. `config.load_incluster_config()` raises `ConfigException` outside a Pod, so the idiom is try in-cluster, fall back to `load_kube_config()`. Either call sets the default configuration that every client built later uses.", on: ["py1", "g-py"] },
      { text: "Go returns errors as values. `rest.InClusterConfig()` returns `ErrNotInCluster` outside a Pod; clientcmd's default loading rules read `$KUBECONFIG` or `~/.kube/config`, like kubectl. The `*rest.Config` is a plain struct you pass to `kubernetes.NewForConfig`. Nothing global.", on: ["go1", "g-go"] },
      { text: "kubeclient reads kubeconfig with `Kubeclient::Config.read`; you pass the context's endpoint, `ssl_options` and `auth_options` to `Client.new`. In a Pod you wire the ServiceAccount token file and CA path yourself. `cfg.context` runs any `exec` credential plugin the file names, so load only trusted kubeconfigs.", on: ["rb1", "g-rb"] },
      { text: "Python's client is generated from the OpenAPI spec: one method per endpoint, keyword arguments, model objects back. Generated names leak through: `_continue` because `continue` is a Python keyword. HTTP errors raise `ApiException` with `.status`.", on: ["py1", "py2", "api"], flow: ["e-py-a", "e-py"] },
      { text: "client-go's typed clientset mirrors the API groups: `CoreV1().Pods(\"\").List(ctx, opts)`, where `\"\"` means all namespaces. Every call takes a `context.Context` for its deadline and returns `(*corev1.PodList, error)`. A misspelled field doesn't compile.", on: ["go1", "go2", "api"], flow: ["e-go-a", "e-go"] },
      { text: "kubeclient defines `get_pods` and friends from API discovery. All three page the same way: `limit=500`, then send the returned `continue` token until it comes back empty. Tokens expire (5 minutes by default) with `410 Gone`; then restart the list.", on: ["rb1", "rb2", "api", "py2", "go2"], flow: ["e-rb-a", "e-rb", "e-py", "e-go"] },
      { text: "The shapes differ most. Pods not yet scheduled have no `containerStatuses`. Python gives `None` (write `or []`). Go gives a nil slice, which ranges zero times, but `State.Waiting` is a pointer to nil-check. Ruby's open structs use the API's camelCase names and return nil for anything missing, including typos.", on: ["py3", "go3", "rb3"], flow: ["e-py-b", "e-go-b", "e-rb-b"] },
      { text: "Group by owner. A Deployment's Pod is controlled by a ReplicaSet named `<deployment>-<pod-template-hash>`, so trim the hash (or GET the ReplicaSet and read its owner). Go has `metav1.GetControllerOf`; Python and Ruby search `ownerReferences` for `controller: true`.", on: ["api", "out"], flow: ["e-out"] },
      { text: "For anything long-running, stop polling. A watch streams changes after one LIST. client-go's shared informers add a local cache and relist on 410 for you; Python's `watch.Watch` and kubeclient's `watch_pods` give you the stream and leave the rest to you.", on: ["go3", "go2", "py2", "rb2", "api"] },
    ],
    code: [
      { lang: "python", label: "Python · kubernetes", src: String.raw`from collections import defaultdict
from kubernetes import client, config

try:
    config.load_incluster_config()        # ServiceAccount token when run in a Pod
except config.ConfigException:
    config.load_kube_config()             # else ~/.kube/config, current-context
v1 = client.CoreV1Api()

bad, token = defaultdict(list), None
while True:
    page = v1.list_pod_for_all_namespaces(limit=500, _continue=token)  # keyword clash
    for pod in page.items:
        if pod.status.phase == "Succeeded":
            continue
        statuses = pod.status.container_statuses or []   # None while Pending
        looping = any(c.state and c.state.waiting and
                      c.state.waiting.reason == "CrashLoopBackOff" for c in statuses)
        restarts = sum(c.restart_count for c in statuses)
        ready = bool(statuses) and all(c.ready for c in statuses)
        if not (looping or restarts > 5 or not ready):
            continue
        ref = next((o for o in pod.metadata.owner_references or [] if o.controller), None)
        tmpl = (pod.metadata.labels or {}).get("pod-template-hash", "")
        owner = ref.name.removesuffix("-" + tmpl) if ref else pod.metadata.name
        bad[f"{pod.metadata.namespace}/{owner}"].append(pod.metadata.name)
    token = page.metadata._continue      # empty or None on the last page
    if not token:
        break

for owner, pods in sorted(bad.items()):
    print(f"{owner}: {len(pods)} bad, e.g. {pods[0]}")` },
      { lang: "go", label: "Go · client-go", src: String.raw`package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	cfg, err := rest.InClusterConfig() // returns ErrNotInCluster outside a Pod
	if err != nil {
		cfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(clientcmd.NewDefaultClientConfigLoadingRules(), &clientcmd.ConfigOverrides{}).ClientConfig() // honors $KUBECONFIG
	}
	if err != nil {
		panic(err)
	}
	cs := kubernetes.NewForConfigOrDie(cfg) // client-side limit: QPS 5, burst 10
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	bad := map[string][]string{}
	opts := metav1.ListOptions{Limit: 500}
	for {
		page, err := cs.CoreV1().Pods("").List(ctx, opts) // "" = all namespaces
		if err != nil {
			panic(err)
		}
		for i := range page.Items {
			p := &page.Items[i] // index: no copy of a large struct
			if !unhealthy(p) {
				continue
			}
			owner := p.Name
			if ref := metav1.GetControllerOf(p); ref != nil { // *OwnerReference or nil
				owner = strings.TrimSuffix(ref.Name, "-"+p.Labels["pod-template-hash"])
			}
			key := p.Namespace + "/" + owner
			bad[key] = append(bad[key], p.Name) // appending to a nil slice is fine
		}
		if opts.Continue = page.Continue; opts.Continue == "" {
			break
		}
	}
	for owner, pods := range bad { // map iteration order is random
		fmt.Printf("%s: %d bad, e.g. %s\n", owner, len(pods), pods[0])
	}
}

func unhealthy(p *corev1.Pod) bool {
	if p.Status.Phase == corev1.PodSucceeded {
		return false
	}
	ready := len(p.Status.ContainerStatuses) > 0 // nil slice while Pending
	for _, c := range p.Status.ContainerStatuses {
		w := c.State.Waiting // pointer: nil unless the container is waiting
		if (w != nil && w.Reason == "CrashLoopBackOff") || c.RestartCount > 5 {
			return true
		}
		ready = ready && c.Ready
	}
	return !ready
}` },
      { lang: "ruby", label: "Ruby · kubeclient", src: String.raw`require "kubeclient"

cfg  = Kubeclient::Config.read(ENV.fetch("KUBECONFIG", File.expand_path("~/.kube/config")))
ctx  = cfg.context                    # current-context; in a Pod, wire the SA token yourself
kube = Kubeclient::Client.new(ctx.api_endpoint, "v1",
                              ssl_options: ctx.ssl_options, auth_options: ctx.auth_options)

bad = Hash.new { |h, k| h[k] = [] }
token = nil
loop do
  page = kube.get_pods(limit: 500, continue: token) # Array-like EntityList
  page.each do |pod|                                # each pod: RecursiveOpenStruct
    next if pod.status.phase == "Succeeded"
    statuses = pod.status.containerStatuses || []   # API's camelCase names; nil if Pending
    looping  = statuses.any? { |c| c.state&.waiting&.reason == "CrashLoopBackOff" }
    restarts = statuses.sum(&:restartCount)
    ready    = !statuses.empty? && statuses.all?(&:ready)
    next unless looping || restarts > 5 || !ready
    ref   = (pod.metadata.ownerReferences || []).find(&:controller)
    hash  = pod.metadata.labels&.[]("pod-template-hash")
    owner = ref ? ref.name.delete_suffix("-#{hash}") : pod.metadata.name
    bad["#{pod.metadata.namespace}/#{owner}"] << pod.metadata.name
  end
  break if page.last?                               # continue token was nil
  token = page.continue
end
bad.sort.each { |owner, pods| puts "#{owner}: #{pods.size} bad, e.g. #{pods.first}" }` },
    ],
    codeNote: "No-code baseline: `kubectl get pods -A -o json | jq -r '.items[] | select(any(.status.containerStatuses[]?; .restartCount > 5)) | .metadata.namespace + \"/\" + .metadata.name'`. All three scripts make the same paged calls; only the error style and object shapes differ.",
    compare: [
      { lang: "Python", idiom: "A client generated from the OpenAPI spec: one method per endpoint, model objects back, errors as `ApiException`.",
        good: ["Shortest to write; in-cluster versus kubeconfig is one `try`/`except ConfigException`.", "Every model field is documented and named consistently (`restart_count`, `owner_references`)."],
        bad: ["Optional fields are `None`, not empty lists, so `or []` everywhere.", "Generated names differ from the API (`_continue`, snake_case), and there is no shared-informer cache: `watch.Watch` only streams events."] },
      { lang: "Go", idiom: "A typed clientset over Go structs: `context.Context` first, `(result, error)` back from every call.",
        good: ["The compiler checks field names and types; nil slices are safe to range over.", "It is the library Kubernetes components are built on: informers, listers, workqueues and client-side rate limits come with it."],
        bad: ["Most code for the same result: explicit error checks, imports, and `k8s.io` module versions to keep in step with the cluster.", "Pointer fields (`State.Waiting`, `OwnerReference.Controller`) panic if dereferenced without a nil check."] },
      { lang: "Ruby", idiom: "A thin REST wrapper: methods like `get_pods` come from API discovery, objects are `RecursiveOpenStruct`s with the API's own camelCase names.",
        good: ["Field names match `kubectl get -o json` and the API reference exactly.", "Built-in `limit:`/`continue:` paging and `watch_pods`; `as: :parsed` gives plain hashes when you prefer them."],
        bad: ["No types: `pod.status.containerStatus` (a typo) returns nil instead of failing.", "In-cluster setup is manual (token file, CA path), and the community is far smaller than the official clients'."] },
    ],
    say30: "It's the same API call in all three, `LIST /api/v1/pods` with `limit` and `continue`, so the difference is ergonomics. Python's official client is generated: quick to write, model objects and exceptions, but `None` wherever a list is empty. Go's client-go is typed and takes a context on every call. It's verbose, but it's what Kubernetes itself is built on, so informers, listers and client-side rate limiting come for free. Ruby's kubeclient is a thin wrapper with open structs in the API's camelCase: pleasant, but unchecked. For a one-off report I'd use kubectl and jq, or Python. Anything long-running that watches the cluster I'd write in Go with an informer.",
    gotchas: [
      "Wrong cluster: `load_kube_config()`, `clientcmd` and `Kubeclient::Config#context` all default to the kubeconfig's current-context. A script that changes anything should take an explicit context or kubeconfig.",
      "In a Pod, listing across all namespaces needs a ClusterRole with `list` on `pods`, bound with a ClusterRoleBinding. A namespaced Role gets `403` on `/api/v1/pods`.",
      "Go: `for _, p := range page.Items` copies every Pod struct; index with `&page.Items[i]` instead. Before Go 1.22 the loop variable was also shared between iterations, so storing `&p` kept only the last Pod.",
      "Ruby: open structs return nil for any unknown name, so a misspelled field silently reads as \"missing\". Python's models raise `AttributeError`; Go doesn't compile.",
    ],
    atScale: [
      "One unpaginated LIST of 100,000 Pods is a single huge response the API server builds in memory, and API Priority and Fairness charges a LIST more seats the more objects it is expected to return. Page with `limit` (500 is the docs' example) and the `continue` token.",
      "`resourceVersion=\"0\"` lets the API server answer from its watch cache instead of etcd, possibly stale. A plain list asks for the most recent data; since v1.31 that can also be served from the watch cache by default, given a recent etcd.",
      "While a watch cache is (re)initializing, the API server rejects unpaginated or label/field-filtered LISTs with `429` and a `Retry-After` header. Scripts that retry instantly in a loop make recovery slower; honor the header and back off.",
      "Polling from many cron jobs multiplies the full-list cost. Long-running tools should LIST once and then WATCH: client-go's `SharedInformerFactory` shares one cache between controllers and handles relists. That, plus small static binaries, is why most controllers and operators are written in Go.",
      "client-go throttles itself (default QPS 5, burst 10), so a script that GETs each ReplicaSet to find its Deployment crawls at scale. One LIST of ReplicaSets joined in memory costs one request.",
    ],
    agentic: [
      "Wrong cluster gets easier to hit: an agent in your terminal inherits the kubeconfig's current-context. Scripts should take an explicit `--context`, and agent sessions should get a kubeconfig whose ServiceAccount has only `list` on `pods`, so a mistaken target can read but not change anything.",
      "A generated script can read a field that doesn't exist, such as `containerStatus` for `containerStatuses`: kubeclient's open structs return nil and the report says nothing is unhealthy. Go's compiler rejects it, one reason typed clients make agent output cheaper to review; for Python and Ruby, test against a cluster with a known crash-looping Pod before trusting an empty result.",
      "Tools such as kubectl-ai (its README says it is not an officially supported Google product) turn questions into kubectl calls and ask before resource-modifying commands by default. They make the same LIST calls this chapter costs out, so for a one-off the no-code answer is still `kubectl get pods -A -o json | jq`, run read-only.",
    ],
    quiz: [
      { q: "Why does the Python client take `_continue` instead of `continue`, and `restart_count` instead of `restartCount`?", a: "The generator maps API names to valid, idiomatic Python identifiers: `continue` is a keyword, and fields become snake_case. Ruby's kubeclient keeps the API's own names; Go uses exported CamelCase struct fields with JSON tags." },
      { q: "Your Go report panics with a nil pointer dereference on some Pods but not others. Where do you look first?", a: "Pointer fields in the API types, such as `State.Waiting`, `State.Terminated` or `OwnerReference.Controller`. They are nil unless set. Slices like `ContainerStatuses` are safe to range over even when nil." },
      { q: "When would you stop polling with LIST and switch to an informer?", a: "When the tool runs continuously or frequently on a big cluster. An informer lists once, then watches, keeps a local cache and relists after a 410, so reads cost the API server nothing." },
    ],
    incidents: ["psf-2026-kubectl-wrong-context-scale-zero"],
    sources: [
      { title: "kubernetes-client/python README", url: "https://github.com/kubernetes-client/python/blob/master/README.md" },
      { title: "kubernetes-client/python: CoreV1Api.list_pod_for_all_namespaces", url: "https://github.com/kubernetes-client/python/blob/master/kubernetes/docs/CoreV1Api.md" },
      { title: "kubernetes-client/python: in-cluster config example", url: "https://github.com/kubernetes-client/python/blob/master/examples/in_cluster_config.py" },
      { title: "client-go: kubernetes package", url: "https://pkg.go.dev/k8s.io/client-go/kubernetes" },
      { title: "client-go: rest package (InClusterConfig, QPS, Burst)", url: "https://pkg.go.dev/k8s.io/client-go/rest" },
      { title: "client-go: clientcmd package", url: "https://pkg.go.dev/k8s.io/client-go/tools/clientcmd" },
      { title: "client-go: typed core/v1 PodInterface", url: "https://pkg.go.dev/k8s.io/client-go/kubernetes/typed/core/v1" },
      { title: "client-go: informers", url: "https://pkg.go.dev/k8s.io/client-go/informers" },
      { title: "kubeclient README", url: "https://github.com/ManageIQ/kubeclient/blob/master/README.md" },
      { title: "Kubernetes API concepts (chunking, resourceVersion, watch cache)", url: "https://kubernetes.io/docs/reference/using-api/api-concepts/" },
      { title: "Field selectors", url: "https://kubernetes.io/docs/concepts/overview/working-with-objects/field-selectors/" },
      { title: "API Priority and Fairness", url: "https://kubernetes.io/docs/concepts/cluster-administration/flow-control/" },
      { title: "Deployments (ReplicaSet naming, pod-template-hash)", url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/" },
      { title: "kubectl-ai README", url: "https://github.com/GoogleCloudPlatform/kubectl-ai" },
    ],
  },

  {
    id: "prometheus-query",
    n: 6,
    title: "Query Prometheus for an SLO gate",
    question: "A deploy pipeline must fail if the 5xx ratio over the last 30 minutes is above 1%. How do you query Prometheus from Python, Go and Ruby, and where do the three behave differently?",
    view: [940, 460],
    groups: [
      { id: "g-py", label: "Python · requests (plain HTTP)", x: 10, y: 10, w: 650, h: 130 },
      { id: "g-go", label: "Go · client_golang/api", x: 10, y: 160, w: 650, h: 130 },
      { id: "g-rb", label: "Ruby · Net::HTTP + JSON (stdlib)", x: 10, y: 310, w: 650, h: 130 },
    ],
    nodes: [
      { id: "py1", label: "headers + timeout", sub: "no default timeout", x: 25, y: 50, w: 190, h: 56 },
      { id: "py2", label: "requests.get", sub: "params={\"query\": ...}", x: 235, y: 50, w: 190, h: 56 },
      { id: "py3", label: "dicts + float()", sub: "\"NaN\" → nan", x: 445, y: 50, w: 190, h: 56 },
      { id: "go1", label: "api.NewClient", sub: "auth via RoundTripper", x: 25, y: 200, w: 190, h: 56 },
      { id: "go2", label: "Query(ctx, q, now)", sub: "Value, Warnings, Infos", x: 235, y: 200, w: 190, h: 56 },
      { id: "go3", label: "model.Vector", sub: "type-assert the Value", x: 445, y: 200, w: 190, h: 56 },
      { id: "rb1", label: "Net::HTTP::Get", sub: "req[\"Authorization\"]=", x: 25, y: 350, w: 190, h: 56 },
      { id: "rb2", label: "Net::HTTP.start", sub: "timeouts default 60 s", x: 235, y: 350, w: 190, h: 56 },
      { id: "rb3", label: "JSON.parse hashes", sub: "\"NaN\".to_f is 0.0!", x: 445, y: 350, w: 190, h: 56 },
      { id: "base", label: "promtool / curl+jq", sub: "promtool query instant", kind: "actor", x: 720, y: 40, w: 200, h: 60 },
      { id: "prom", label: "Prometheus", sub: "GET /api/v1/query", kind: "store", x: 720, y: 180, w: 200, h: 70 },
      { id: "gate", label: "Deploy gate", sub: "exit 0 pass · 1 block", x: 720, y: 350, w: 200, h: 60 },
    ],
    edges: [
      { id: "e-py-a", from: "py1", to: "py2" },
      { id: "e-py-b", from: "py2", to: "py3" },
      { id: "e-go-a", from: "go1", to: "go2" },
      { id: "e-go-b", from: "go2", to: "go3" },
      { id: "e-rb-a", from: "rb1", to: "rb2" },
      { id: "e-rb-b", from: "rb2", to: "rb3" },
      { id: "e-py", from: "py2", to: "prom", label: "instant query", via: [[330, 125], [690, 125]], labelPos: 0.4, bidir: true },
      { id: "e-go", from: "go2", to: "prom", label: "instant query", via: [[330, 275], [690, 275]], labelPos: 0.4, bidir: true },
      { id: "e-rb", from: "rb2", to: "prom", label: "instant query", via: [[330, 425], [690, 425], [690, 300]], labelPos: 0.3, bidir: true },
      { id: "e-base", from: "base", to: "prom", label: "same API" },
      { id: "e-out", from: "prom", to: "gate", label: "decides" },
    ],
    steps: [
      { text: "A deploy gate: ask Prometheus for the 5xx ratio over 30 minutes and exit 1 above 1%. Every lane sends the same `GET /api/v1/query`. They differ in timeouts and auth, in the type the answer arrives as, and in what happens to an error you forgot to handle." },
      { text: "Baseline: `promtool query instant http://prometheus:9090 '<expr>'`, or `curl` plus `jq`, answers by hand. Script it when the threshold, the empty case and the exit code must behave the same in every pipeline.", on: ["base", "prom"], flow: ["e-base"] },
      { text: "Python with `requests`: put a bearer token in a headers dict and always pass `timeout=`, because requests waits forever by default. A tuple sets connect and read timeouts separately.", on: ["py1", "g-py"] },
      { text: "Go: `api.NewClient(api.Config{Address: ...})` returns a client that is safe for concurrent use. Auth lives in the transport: set `Config.RoundTripper` or `Config.Client` so every request carries the header. Deadlines come from the `ctx` you pass.", on: ["go1", "g-go"] },
      { text: "Ruby's standard library: a `Net::HTTP::Get` object takes headers like a hash. `Net::HTTP.start` with a block opens the connection, runs the request and closes it. Its open and read timeouts default to 60 seconds, too long for CI.", on: ["rb1", "rb2", "g-rb"], flow: ["e-rb-a"] },
      { text: "The API answers JSON: `status`, then `data.resultType` and `data.result`. This instant query returns a `vector`: a list of `{metric, value: [unix_ts, \"string\"]}`. Bad PromQL is `400`, a query that can't execute `422`, a timeout `503`.", on: ["py2", "go2", "rb2", "prom"], flow: ["e-py", "e-go", "e-rb", "e-py-a", "e-go-a"] },
      { text: "Python hands back plain dicts, and `float()` accepts `\"NaN\"` and `\"+Inf\"`. `raise_for_status()` turns 4xx and 5xx into exceptions, and an uncaught exception exits 1, so a case you forgot fails closed.", on: ["py2", "py3"], flow: ["e-py-b"] },
      { text: "Go returns `model.Value`, an interface: assert `model.Vector`, or switch over `Vector`, `Matrix` and `Scalar`. Samples are already `float64`. Since client_golang v1.25, `Query` returns four values (`Infos` was added), so the code depends on the module version.", on: ["go2", "go3"], flow: ["e-go-b"] },
      { text: "Ruby's `JSON.parse` gives hashes that `dig` walks. Careful with `String#to_f`: it reads leading digits only, so `\"NaN\".to_f` is `0.0`, and a no-traffic NaN would read as a perfect 0% error ratio. Map the special strings yourself.", on: ["rb2", "rb3"], flow: ["e-rb-b"] },
      { text: "Decide the edge cases on purpose. An empty result means no series matched: no traffic, a wrong label, a renamed metric. `NaN` means 0/0: series exist but saw no requests. A gate should block or warn on both, never read them as 0%.", on: ["py3", "go3", "rb3", "prom", "gate"], flow: ["e-out"] },
      { text: "Mind the window. `rate()` needs at least two samples inside its range, so with a 1-minute scrape interval a `[1m]` window is often empty. Use a window several scrape intervals long. Times go in as Unix seconds or RFC 3339, so time zones never enter.", on: ["prom", "gate"], flow: ["e-out"] },
    ],
    code: [
      { lang: "python", label: "Python · requests", src: String.raw`import math, os, sys
import requests

PROM = os.environ.get("PROM_URL", "http://prometheus:9090")
QUERY = ('sum(rate(http_requests_total{job="checkout",code=~"5.."}[30m]))'
         ' / sum(rate(http_requests_total{job="checkout"}[30m]))')
headers = {}
if token := os.environ.get("PROM_TOKEN"):          # managed Prometheus: bearer auth
    headers["Authorization"] = f"Bearer {token}"

r = requests.get(f"{PROM}/api/v1/query", params={"query": QUERY},
                 headers=headers, timeout=(3, 30))   # no timeout unless you set one
r.raise_for_status()               # 400 bad query, 422 can't run, 503 timed out
result = r.json()["data"]["result"]  # instant query -> "vector": [{metric, value}]

if not result:                     # empty vector: no series matched (no traffic?)
    sys.exit("no data: refusing to pass the gate")      # message to stderr, exit 1
ratio = float(result[0]["value"][1])  # value = [unix_ts, "0.0042"]; "NaN" parses too
if math.isnan(ratio) or ratio > 0.01:  # NaN = 0/0: series exist, zero requests
    sys.exit(f"error ratio {ratio:.4f} over 1%: blocking deploy")
print(f"error ratio {ratio:.4f}: OK")` },
      { lang: "go", label: "Go · client_golang/api", src: String.raw`package main

import (
	"context"
	"fmt"
	"math"
	"os"
	"time"

	"github.com/prometheus/client_golang/api"
	v1 "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"
)

const query = "sum(rate(http_requests_total{job=\"checkout\",code=~\"5..\"}[30m]))" +
	" / sum(rate(http_requests_total{job=\"checkout\"}[30m]))"

func main() {
	client, err := api.NewClient(api.Config{Address: os.Getenv("PROM_URL")}) // auth: RoundTripper
	if err != nil {
		fail("client: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	val, warnings, _, err := v1.NewAPI(client).Query(ctx, query, time.Now()) // v1.25+: 4 results
	if err != nil {
		fail("query: %v", err) // 400 / 422 / 503 and timeouts all land here
	}
	if len(warnings) > 0 {
		fmt.Fprintln(os.Stderr, "warnings:", warnings)
	}
	vec, ok := val.(model.Vector) // model.Value is an interface: assert the shape
	if !ok || len(vec) == 0 {
		fail("no data: refusing to pass the gate")
	}
	ratio := float64(vec[0].Value) // already parsed; NaN stays NaN
	if math.IsNaN(ratio) || ratio > 0.01 {
		fail("error ratio %.4f over 1%%: blocking deploy", ratio)
	}
	fmt.Printf("error ratio %.4f: OK\n", ratio)
}

func fail(format string, a ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", a...)
	os.Exit(1) // deferred calls (cancel) do not run
}` },
      { lang: "ruby", label: "Ruby · Net::HTTP + JSON", src: String.raw`require "json"
require "net/http"

QUERY = 'sum(rate(http_requests_total{job="checkout",code=~"5.."}[30m]))' \
        ' / sum(rate(http_requests_total{job="checkout"}[30m]))'
uri = URI("#{ENV.fetch('PROM_URL', 'http://prometheus:9090')}/api/v1/query")
uri.query = URI.encode_www_form(query: QUERY)

req = Net::HTTP::Get.new(uri)
req["Authorization"] = "Bearer #{ENV['PROM_TOKEN']}" if ENV["PROM_TOKEN"]
res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https",
                      open_timeout: 3, read_timeout: 30) do |http| # defaults: 60 s
  http.request(req)                               # socket closed when the block ends
end
body = JSON.parse(res.body)                       # error replies (400/422/503) are JSON too
abort "query failed: #{body['error']}" unless body["status"] == "success"

result = body.dig("data", "result")
abort "no data: refusing to pass the gate" if result.empty?
raw = result[0]["value"][1]                       # "0.0042", or "NaN" for 0/0
ratio = raw == "NaN" ? Float::NAN : Float(raw)    # "NaN".to_f would be 0.0
abort format("error ratio %.4f over 1%%: blocking deploy", ratio) if ratio.nan? || ratio > 0.01
puts format("error ratio %.4f: OK", ratio)` },
    ],
    codeNote: "No-code baseline: `promtool query instant http://prometheus:9090 '<expr>'`, or `curl -s http://prometheus:9090/api/v1/query --data-urlencode 'query=<expr>' | jq -r '.data.result[0].value[1]'` (a form-encoded POST, which the API accepts). The envelope is small, so plain HTTP against the documented API beats a wrapper library in Python and Ruby.",
    compare: [
      { lang: "Python", idiom: "Plain `requests` and dicts: the JSON envelope from the API docs is the data model.",
        good: ["Shortest path from the docs to code; `float()` parses \"NaN\" and \"+Inf\".", "Exceptions propagate: an unhandled surprise exits non-zero, so the gate fails closed by default."],
        bad: ["No timeout unless you pass one.", "Untyped dicts: a `KeyError` deep in the body if the result type isn't what you assumed."] },
      { lang: "Go", idiom: "The official `client_golang/api` package returns `model.Value`, an interface you assert to `model.Vector` or `model.Matrix`.",
        good: ["A context deadline bounds the whole request; Warnings and Infos are return values you must consciously discard.", "Values arrive as `float64` with NaN intact, and a pure-Go build ships the gate as one self-contained binary into any CI image."],
        bad: ["The `Query` signature changed in v1.25 (added `Infos`), so code breaks across module versions.", "Most ceremony for a 20-line check, and `os.Exit` skips deferred calls."] },
      { lang: "Ruby", idiom: "Standard-library `Net::HTTP` and `JSON`: explicit request objects, nothing to install.",
        good: ["Zero gems: it runs in any image that has Ruby.", "`Net::HTTP.start` with a block closes the connection for you; `dig` walks the envelope."],
        bad: ["`\"NaN\".to_f` is 0.0: special values must be mapped by hand or NaN reads as a perfect score.", "60-second default timeouts, and more setup than `requests` for TLS and auth."] },
    ],
    say30: "It's one HTTP GET, so in Python I'd use `requests` against the documented endpoint, in Ruby the standard library, and in Go the official `client_golang/api` package for typed results and a context deadline. What differs is failure behavior. Python and Ruby raise on surprises, so an unhandled case exits non-zero. Go makes me check every error and assert the result type. Then the edge cases: empty versus NaN versus zero, and Ruby's `to_f` turning NaN into zero. For a CI gate I'd pick Go or plain `promtool` for the single binary; for a quick SLO report, Python.",
    gotchas: [
      "Timeouts: Python `requests` has none by default, Ruby `Net::HTTP` waits 60 s, and Go's `http.Client` zero value has none, so pass a context deadline. A hung Prometheus should fail the gate fast, not hang the pipeline.",
      "Ruby's `\"NaN\".to_f` is `0.0`, so 0/0 becomes a 0% error ratio and the gate passes. Python's `float(\"NaN\")` and Go's `model.SampleValue` keep NaN.",
      "Empty is not zero: if no 5xx series exist at all, the numerator is empty and so is the ratio. If \"no errors\" should count as 0, write `(sum(rate(...{code=~\"5..\"}[30m])) or vector(0)) / sum(rate(...[30m]))`.",
      "Go's `os.Exit` (and `log.Fatal`) skip deferred calls, so `defer cancel()` or a deferred flush never runs on that path.",
    ],
    atScale: [
      "An SLO ratio over raw `http_requests_total` touches every series for the job: every pod, path and status code. At thousands of pods that is slow on every pipeline run; precompute it with a recording rule and let the gate read one series.",
      "Hundreds of services gating every deploy send bursts of identical heavy queries during deploy waves. Pass the API's `timeout=` parameter, share one cached answer per minute, or evaluate the SLO once as a rule and have pipelines read its result.",
      "Long-term stores enforce per-tenant query limits (Mimir: `max_fetched_series_per_query`, `max_fetched_chunk_bytes_per_query`; off by default, set by operators). A query that hits a limit fails, and the gate must treat that as unknown and block, not pass.",
      "Range queries cost series × (range ÷ step). A 30-day SLO report at a 15-second step is far more points than any chart needs; use a coarser `step` or the recording rule's series.",
      "Fleet-wide CI images: the Go gate (or `promtool`) is one self-contained binary when built without cgo; the Python version needs an interpreter plus `requests` in every image; the Ruby version needs only Ruby, since it uses the standard library.",
    ],
    agentic: [
      "An agent writes the HTTP call and a plausible PromQL ratio quickly, but it doesn't know your metric or label names. A misspelled name returns an empty result, not an error, and with `or vector(0)` added the gate reads 0% errors and passes; run the expression in the Prometheus UI against real series and make empty fail the gate unless you decided otherwise.",
      "The language traps are still the reviewer's to know: Ruby's `\"NaN\".to_f` turning 0/0 into a perfect score, no default timeout in `requests`, `os.Exit` skipping `defer cancel()`. Ask for tests that feed recorded responses with NaN, an empty result and +Inf, rather than trusting a run against a healthy Prometheus.",
      "The no-code answer often wins: `promtool query instant` plus a threshold, or a recording rule the gate reads, leaves less generated code to get wrong and less to review. The fundamentals of the query still decide whether the gate is right; an agent only gets you to a draft faster.",
    ],
    quiz: [
      { q: "The query returns `\"result\": []`. Is the error ratio zero?", a: "No. No series matched: no traffic, a label typo, or a renamed metric. Treat it as unknown. If \"no 5xx series\" should mean zero, add `or vector(0)` to the numerator." },
      { q: "In Ruby, why is `result[0][\"value\"][1].to_f` dangerous here?", a: "Prometheus sends NaN and Inf as strings because JSON has no such numbers. `to_f` returns 0.0 for \"NaN\", so a 0/0 ratio reads as 0% errors and the gate passes." },
      { q: "Why does the Go client return `model.Value` rather than a vector?", a: "The result type depends on the expression: vector, matrix, scalar or string. Go models that as an interface, so you must assert or switch on the concrete type before you can read samples." },
    ],
    incidents: [],
    sources: [
      { title: "Prometheus HTTP API", url: "https://prometheus.io/docs/prometheus/latest/querying/api/" },
      { title: "promtool command line", url: "https://prometheus.io/docs/prometheus/latest/command-line/promtool/" },
      { title: "PromQL functions (rate needs two samples)", url: "https://prometheus.io/docs/prometheus/latest/querying/functions/" },
      { title: "Recording rules", url: "https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/" },
      { title: "client_golang api package", url: "https://pkg.go.dev/github.com/prometheus/client_golang/api" },
      { title: "client_golang api/prometheus/v1 package", url: "https://pkg.go.dev/github.com/prometheus/client_golang/api/prometheus/v1" },
      { title: "Requests: advanced usage (timeouts, sessions)", url: "https://requests.readthedocs.io/en/latest/user/advanced/" },
      { title: "Ruby Net::HTTP", url: "https://docs.ruby-lang.org/en/master/Net/HTTP.html" },
      { title: "Ruby String#to_f", url: "https://docs.ruby-lang.org/en/master/String.html" },
      { title: "Grafana Mimir configuration parameters (limits)", url: "https://grafana.com/docs/mimir/latest/configure/configuration-parameters/" },
    ],
  },

  {
    id: "fan-out",
    n: 7,
    title: "Check 500 endpoints in parallel: TLS expiry sweep",
    question: "You need to check the TLS certificates of 500 endpoints, with bounded concurrency and a timeout per check, and report failures and anything expiring within 14 days. How do Python, Go and Ruby structure the fan-out?",
    view: [940, 460],
    groups: [
      { id: "g-py", label: "Python · ThreadPoolExecutor + ssl", x: 10, y: 10, w: 650, h: 130 },
      { id: "g-go", label: "Go · errgroup + crypto/tls", x: 10, y: 160, w: 650, h: 130 },
      { id: "g-rb", label: "Ruby · Thread + Queue + Net::HTTP", x: 10, y: 310, w: 650, h: 130 },
    ],
    nodes: [
      { id: "py1", label: "ThreadPoolExecutor", sub: "max_workers=50", x: 25, y: 50, w: 190, h: 56 },
      { id: "py2", label: "submit(days_left)", sub: "socket timeout=5", x: 235, y: 50, w: 190, h: 56 },
      { id: "py3", label: "as_completed", sub: "result() re-raises", x: 445, y: 50, w: 190, h: 56 },
      { id: "go1", label: "errgroup.SetLimit(50)", sub: "zero Group: no cancel", x: 25, y: 200, w: 190, h: 56 },
      { id: "go2", label: "g.Go per host", sub: "DialContext, 5 s ctx", x: 235, y: 200, w: 190, h: 56 },
      { id: "go3", label: "results[i]", sub: "own slot: no mutex", x: 445, y: 200, w: 190, h: 56 },
      { id: "rb1", label: "50 Threads + Queue", sub: "close = stop signal", x: 25, y: 350, w: 190, h: 56 },
      { id: "rb2", label: "Net::HTTP.start", sub: "open/read_timeout: 5", x: 235, y: 350, w: 190, h: 56 },
      { id: "rb3", label: "results Queue", sub: "join, then drain", x: 445, y: 350, w: 190, h: 56 },
      { id: "base", label: "Ansible / xargs -P", sub: "or blackbox_exporter", kind: "actor", x: 720, y: 40, w: 200, h: 60 },
      { id: "hosts", label: "500 endpoints", sub: "TLS handshake :443", kind: "store", x: 720, y: 180, w: 200, h: 70 },
      { id: "out", label: "Failures + expiring", sub: "sorted; exit 1 if any", x: 720, y: 350, w: 200, h: 60 },
    ],
    edges: [
      { id: "e-py-a", from: "py1", to: "py2" },
      { id: "e-py-b", from: "py2", to: "py3" },
      { id: "e-go-a", from: "go1", to: "go2" },
      { id: "e-go-b", from: "go2", to: "go3" },
      { id: "e-rb-a", from: "rb1", to: "rb2" },
      { id: "e-rb-b", from: "rb2", to: "rb3" },
      { id: "e-py", from: "py2", to: "hosts", label: "50 at a time", via: [[330, 125], [690, 125]], labelPos: 0.4, bidir: true },
      { id: "e-go", from: "go2", to: "hosts", label: "50 at a time", via: [[330, 275], [690, 275]], labelPos: 0.4, bidir: true },
      { id: "e-rb", from: "rb2", to: "hosts", label: "50 at a time", via: [[330, 425], [690, 425], [690, 300]], labelPos: 0.3, bidir: true },
      { id: "e-base", from: "base", to: "hosts", label: "probes" },
      { id: "e-out", from: "hosts", to: "out", label: "summarize" },
    ],
    steps: [
      { text: "Connect to each endpoint, finish the TLS handshake, read the leaf certificate's expiry, and report failures plus anything expiring within 14 days. Every lane caps concurrency at 50 and gives each check its own timeout. The languages differ in how work is scheduled, cancelled and collected." },
      { text: "Before writing code: `xargs -P 50` over `openssl s_client` covers a one-off. Ansible ad-hoc runs `-m uri` (HTTP status) or `-m community.crypto.get_certificate` (returns `not_after`, `expired`) with `-f` forks, default 5. Anything recurring belongs in blackbox_exporter.", on: ["base", "hosts"], flow: ["e-base"] },
      { text: "Python: `ThreadPoolExecutor(max_workers=50)` queues all 500 calls and runs 50 at once. Threads suit this because the GIL is released while a thread waits on the network; CPU-bound work would need `ProcessPoolExecutor`. Leaving the `with` block waits for every task.", on: ["py1", "g-py"] },
      { text: "Each `days_left` call opens its socket with `timeout=5`. A running thread can't be cancelled, so that socket timeout is the only thing bounding a stuck host, and it applies per socket operation and doesn't cover the DNS lookup. Nested `with` blocks close the socket on every path.", on: ["py1", "py2", "hosts"], flow: ["e-py-a", "e-py"] },
      { text: "`as_completed` yields futures as they finish, not in input order, so keep a future → host map. `fut.result()` re-raises the worker's exception in the main thread, where one `except OSError` catches timeouts, DNS errors and `ssl.SSLError`.", on: ["py2", "py3"], flow: ["e-py-b"] },
      { text: "Go: an `errgroup.Group` with `SetLimit(50)` makes `g.Go` block until a slot frees. Use the zero-value `Group`, not `WithContext`: that one cancels every other check when one returns an error. Right for all-or-nothing work, wrong for a sweep.", on: ["go1", "g-go"] },
      { text: "Each goroutine derives a 5-second `context.WithTimeout`; `tls.Dialer.DialContext` applies it to DNS, TCP connect and the handshake together. The error comes back as a value, and `defer conn.Close()` cleans up.", on: ["go1", "go2", "hosts"], flow: ["e-go-a", "e-go"] },
      { text: "Results go into a pre-sized slice, one index per host, so no mutex is needed and output keeps input order. Since Go 1.22 each iteration has its own `i` and `h`; before that, closures shared one variable and needed `i, h := i, h`.", on: ["go2", "go3"], flow: ["e-go-b"] },
      { text: "Ruby: 50 threads pop hosts from a `Queue`. Closing the queue after filling it is the stop signal: `pop` returns nil once it is empty, ending each worker's loop. In Rails code bases, concurrent-ruby's `FixedThreadPool` is the usual alternative; Active Support already depends on that gem.", on: ["rb1", "g-rb"] },
      { text: "`Net::HTTP.start` does the TLS handshake with verification on by default, and `peer_cert.not_after` gives the expiry. Rescue inside the worker: an unhandled exception ends that thread and only resurfaces at `join`. Results come back through a second `Queue`.", on: ["rb1", "rb2", "rb3", "hosts"], flow: ["e-rb-a", "e-rb", "e-rb-b"] },
      { text: "Sort, print, exit 1 if anything failed. An expired or wrong-name certificate fails verification in all three, so it shows up as a handshake error rather than a negative day count.", on: ["py3", "go3", "rb3", "hosts", "out"], flow: ["e-out"] },
    ],
    code: [
      { lang: "python", label: "Python · concurrent.futures + ssl", src: String.raw`import socket, ssl, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

CTX = ssl.create_default_context()        # verifies chain + hostname: expired = error

def days_left(host, port=443, timeout=5):
    with socket.create_connection((host, port), timeout=timeout) as sock:
        with CTX.wrap_socket(sock, server_hostname=host) as tls:   # SNI + verify
            not_after = tls.getpeercert()["notAfter"]  # 'Jun  1 12:00:00 2027 GMT'
    return (ssl.cert_time_to_seconds(not_after) - time.time()) / 86400

with open(sys.argv[1]) as f:
    hosts = [line.strip() for line in f if line.strip()]

problems = []
with ThreadPoolExecutor(max_workers=50) as pool:  # waits for all on exit
    futures = {pool.submit(days_left, h): h for h in hosts}
    for fut in as_completed(futures):             # completion order, not input order
        host = futures[fut]
        try:
            days = fut.result()                   # re-raises the worker's exception
        except OSError as e:                      # timeout, DNS, refused, ssl.SSLError
            problems.append(f"{host}: {type(e).__name__}: {e}")
            continue
        if days < 14:
            problems.append(f"{host}: expires in {days:.0f} days")

print("\n".join(sorted(problems)) or "all OK")
sys.exit(1 if problems else 0)` },
      { lang: "go", label: "Go · errgroup + crypto/tls", src: String.raw`package main

import (
	"bufio"
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"os"
	"time"

	"golang.org/x/sync/errgroup"
)

func daysLeft(ctx context.Context, host string) (float64, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second) // covers DNS + TCP + TLS
	defer cancel()
	d := tls.Dialer{Config: &tls.Config{ServerName: host}} // verifies chain + name
	conn, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, "443"))
	if err != nil {
		return 0, err // expired cert, timeout, DNS: all plain errors
	}
	defer conn.Close()
	leaf := conn.(*tls.Conn).ConnectionState().PeerCertificates[0]
	return time.Until(leaf.NotAfter).Hours() / 24, nil
}

func main() {
	f, err := os.Open(os.Args[1])
	if err != nil {
		panic(err)
	}
	defer f.Close()
	var hosts []string
	for s := bufio.NewScanner(f); s.Scan(); {
		hosts = append(hosts, s.Text())
	}

	results := make([]string, len(hosts)) // one slot per host: no mutex
	var g errgroup.Group                  // zero value: no cancel-on-first-error
	g.SetLimit(50)                        // g.Go blocks while 50 are running
	for i, h := range hosts {
		g.Go(func() error { // Go 1.22+: i and h are per-iteration
			days, err := daysLeft(context.Background(), h)
			if err != nil {
				results[i] = fmt.Sprintf("%s: %v", h, err)
			} else if days < 14 {
				results[i] = fmt.Sprintf("%s: expires in %.0f days", h, days)
			}
			return nil // one bad host must not stop the others
		})
	}
	_ = g.Wait() // always nil here
	failed := 0
	for _, r := range results {
		if r != "" {
			fmt.Println(r)
			failed++
		}
	}
	if failed > 0 {
		os.Exit(1)
	}
}` },
      { lang: "ruby", label: "Ruby · Thread + Queue + Net::HTTP", src: String.raw`require "net/http"

def days_left(host)
  Net::HTTP.start(host, 443, use_ssl: true,         # verifies the peer by default
                  open_timeout: 5, read_timeout: 5) do |http|
    (http.peer_cert.not_after - Time.now) / 86_400  # start already did the handshake
  end                                               # block form closes the socket
end

jobs = Queue.new
File.foreach(ARGV[0], chomp: true) { |h| jobs << h unless h.empty? }
jobs.close                        # pop returns nil once drained: the stop signal
results = Queue.new               # thread-safe hand-off back to the main thread

workers = Array.new(50) do
  Thread.new do
    while (host = jobs.pop)
      begin
        days = days_left(host)
        results << "#{host}: expires in #{days.round} days" if days < 14
      rescue StandardError => e   # unrescued, it would end this worker thread
        results << "#{host}: #{e.class}: #{e.message}"
      end
    end
  end
end
workers.each(&:join)              # the GVL is released while threads wait on sockets
problems = Array.new(results.size) { results.pop }
puts problems.empty? ? "all OK" : problems.sort
exit(problems.empty? ? 0 : 1)` },
    ],
    codeNote: "When not to script: for a one-off, `xargs -P 50 -I{} sh -c 'echo | openssl s_client -connect {}:443 -servername {} 2>/dev/null | openssl x509 -noout -enddate'`; for fleet hosts, Ansible ad-hoc with `-f 50`; for anything recurring, blackbox_exporter plus an alert on `probe_ssl_earliest_cert_expiry`. cert-manager renews what it issues.",
    compare: [
      { lang: "Python", idiom: "`ThreadPoolExecutor`: submit callables, get futures, read them with `as_completed`.",
        good: ["Threads are fine for this: the GIL is released while waiting on sockets.", "`fut.result()` re-raises the worker's exception in the caller, so errors can't vanish."],
        bad: ["A running thread can't be cancelled; per-call socket timeouts are the only deadline.", "CPU-heavy work in the workers serializes on the GIL; that needs `ProcessPoolExecutor`."] },
      { lang: "Go", idiom: "`errgroup` with `SetLimit` bounds goroutines; a `context` per check carries the deadline into DNS, connect and handshake.",
        good: ["Goroutines are cheap, and one context bounds the whole check end to end.", "Writing results by index needs no lock and keeps input order; the race detector (`-race`) catches mistakes."],
        bad: ["`errgroup.WithContext` cancels everything on the first error, a trap for health sweeps.", "Forget `SetLimit` and all 500 goroutines dial at once."] },
      { lang: "Ruby", idiom: "OS threads draining a closed `Queue` (stdlib), or `Concurrent::FixedThreadPool` where concurrent-ruby is already loaded.",
        good: ["`Queue#close` is a clean stop signal: `pop` returns nil once drained.", "`Net::HTTP.start` with a block does handshake, verification and cleanup in one call."],
        bad: ["An unrescued exception ends the worker; you only see it at `join` (plus a stderr report).", "Like Python, the GVL lets only I/O overlap, and there is no built-in context-style cancellation."] },
    ],
    say30: "The pattern is the same everywhere: a fixed number of workers, a timeout per check, collect every result, and never let one failure stop the rest. Python uses ThreadPoolExecutor; threads are fine because the GIL is released during network waits, but you can't cancel a running thread, so socket timeouts are the deadline. Go uses errgroup with SetLimit and a context per check, which bounds DNS, connect and handshake together. Avoid WithContext here, because it cancels on the first error. Ruby uses threads draining a closed Queue. For 500 hosts once, any of them, or Ansible. Anything recurring I wouldn't script at all: blackbox_exporter plus an alert.",
    gotchas: [
      "Verification hides the date: with default settings an expired certificate fails the handshake, so you never read its `notAfter`. That's fine for alerting; to report the exact date, make a second connection with verification off and parse the raw certificate.",
      "`errgroup.WithContext` cancels the shared context when any goroutine returns an error, so the remaining checks fail with `context canceled`.",
      "Python's `executor.map` raises the first worker exception when you reach that result, ending your loop; use `submit` with `as_completed` and catch per future.",
      "Ruby threads report an unhandled exception on stderr (`report_on_exception` is true) but only re-raise it at `join`. If every worker dies early, the rest of the queue is never processed.",
    ],
    atScale: [
      "File descriptors: each in-flight check holds a socket. An unbounded fan-out (500 goroutines, or thousands of threads) hits the open-file limit (`ulimit -n`, often 1024) and fails with \"too many open files\". Bound concurrency well below it.",
      "DNS: 500 lookups in a burst land on one resolver, CoreDNS if you run in a cluster. Bounded concurrency spreads them; for frequent runs resolve once or use a local cache.",
      "Targets behind one load balancer see 50 simultaneous handshakes from one source IP on every run, and several cron copies of the script multiply that. Run the sweep from one place and add jitter.",
      "Ephemeral ports: the checker closes each connection, so each one sits in `TIME_WAIT` on the checker for a while. Sweeping thousands of endpoints repeatedly from one host can exhaust the source port range; slow the sweep or spread it over hosts.",
      "Thread cost: Python and Ruby threads are OS threads, each reserving a stack of a megabyte or more and scheduled by the kernel, while goroutines start with a stack of a few kilobytes. That is why Go fan-outs stretch to thousands of concurrent checks; the real ceiling is still fds and the targets.",
      "Recurring checks don't belong in a script: blackbox_exporter's multi-target `/probe?target=` lets Prometheus spread probes across scrapes, and an alert on `probe_ssl_earliest_cert_expiry - time() < 14 * 86400` replaces the cron job.",
    ],
    agentic: [
      "Check that the concurrency primitive matches the work: Python threads are fine here because the GIL is released during socket waits, but CPU-heavy work needs processes, and Ruby threads must rescue per item or one exception leaves the rest of the queue unchecked. The model of the runtime decides this, not the syntax of the generated code.",
      "In Go, `errgroup.WithContext` looks like the idiomatic choice and cancels every remaining check after the first failure. Test any generated sweep with one dead host in the list: a correct version still reports the other 499, and one with no `SetLimit` shows up as \"too many open files\" at scale.",
      "Agents make writing the script cheap, not running and owning it. For a recurring check the answer is still blackbox_exporter plus an alert on `probe_ssl_earliest_cert_expiry`, with cert-manager renewing what it issues.",
    ],
    quiz: [
      { q: "Why is a thread pool fine for this in Python despite the GIL?", a: "The work is waiting on the network. CPython releases the GIL during blocking socket I/O, so 50 threads overlap their waits. Only CPU-bound Python code is serialized." },
      { q: "You used `errgroup.WithContext` and most hosts report `context canceled`. Why?", a: "The first goroutine that returned an error cancelled the shared context, so in-flight and later checks were aborted. Return nil and record errors per host, or use the zero-value Group." },
      { q: "How does each Ruby worker know to stop?", a: "The job queue is closed after it is filled. `pop` on a closed, empty queue returns nil, which ends the `while (host = jobs.pop)` loop." },
    ],
    incidents: ["microsoft-azure-2013-storage-ssl-cert-expiry", "render-2024-expired-mtls-certs", "teamdynamix-2026-internal-tls-cert-expiry"],
    sources: [
      { title: "Python concurrent.futures", url: "https://docs.python.org/3/library/concurrent.futures.html" },
      { title: "Python ssl", url: "https://docs.python.org/3/library/ssl.html" },
      { title: "Python threading (GIL note)", url: "https://docs.python.org/3/library/threading.html" },
      { title: "golang.org/x/sync/errgroup", url: "https://pkg.go.dev/golang.org/x/sync/errgroup" },
      { title: "Go crypto/tls (Dialer.DialContext)", url: "https://pkg.go.dev/crypto/tls" },
      { title: "Go FAQ (goroutine stacks)", url: "https://go.dev/doc/faq" },
      { title: "Ruby Thread::Queue", url: "https://docs.ruby-lang.org/en/master/Thread/Queue.html" },
      { title: "Ruby Thread", url: "https://docs.ruby-lang.org/en/master/Thread.html" },
      { title: "Ruby Net::HTTP", url: "https://docs.ruby-lang.org/en/master/Net/HTTP.html" },
      { title: "concurrent-ruby FixedThreadPool", url: "https://ruby-concurrency.github.io/concurrent-ruby/master/Concurrent/FixedThreadPool.html" },
      { title: "Ansible ad-hoc commands (forks)", url: "https://github.com/ansible/ansible-documentation/blob/devel/docs/docsite/rst/command_guide/intro_adhoc.rst" },
      { title: "community.crypto.get_certificate", url: "https://github.com/ansible-collections/community.crypto/blob/main/plugins/modules/get_certificate.py" },
      { title: "blackbox_exporter README", url: "https://github.com/prometheus/blackbox_exporter/blob/master/README.md" },
    ],
  },

  {
    id: "exporter",
    n: 8,
    title: "Write a small Prometheus exporter",
    question: "A vendor API's quota has no exporter, and you want to alert before you run out. How do you expose it to Prometheus in Python, Go and Ruby, and how do the client libraries shape the design?",
    view: [940, 460],
    groups: [
      { id: "g-py", label: "Python · prometheus_client", x: 225, y: 10, w: 570, h: 130 },
      { id: "g-go", label: "Go · client_golang", x: 225, y: 160, w: 570, h: 130 },
      { id: "g-rb", label: "Ruby · prometheus-client gem", x: 225, y: 310, w: 570, h: 130 },
    ],
    nodes: [
      { id: "list", label: "Exporters list", sub: "check first", kind: "actor", x: 10, y: 40, w: 170, h: 60 },
      { id: "prom", label: "Prometheus", sub: "scrape, 10 s timeout", kind: "store", x: 10, y: 180, w: 170, h: 70 },
      { id: "batch", label: "textfile / Pushgw", sub: "batch jobs only", kind: "actor", x: 10, y: 350, w: 170, h: 60 },
      { id: "py1", label: "start_http_server", sub: "daemon thread", x: 240, y: 50, w: 170, h: 56 },
      { id: "py2", label: "Custom Collector", sub: "collect() per scrape", x: 425, y: 50, w: 170, h: 56 },
      { id: "py3", label: "requests.get", sub: "timeout=5", x: 610, y: 50, w: 170, h: 56 },
      { id: "go1", label: "promhttp.HandlerFor", sub: "own Registry", x: 240, y: 200, w: 170, h: 56 },
      { id: "go2", label: "Collector iface", sub: "Describe + Collect", x: 425, y: 200, w: 170, h: 56 },
      { id: "go3", label: "http.Client", sub: "Timeout: 5 s", x: 610, y: 200, w: 170, h: 56 },
      { id: "rb1", label: "Rack Exporter", sub: "middleware", x: 240, y: 350, w: 170, h: 56 },
      { id: "rb2", label: "Registry gauges", sub: "set(v, labels:)", x: 425, y: 350, w: 170, h: 56 },
      { id: "rb3", label: "Background Thread", sub: "polls every 60 s", x: 610, y: 350, w: 170, h: 56 },
      { id: "vendor", label: "Vendor API", sub: "GET /v1/quota", kind: "store", x: 830, y: 180, w: 100, h: 70 },
    ],
    edges: [
      { id: "e-py", from: "prom", to: "py1", label: "scrapes" },
      { id: "e-go", from: "prom", to: "go1", label: "scrapes", labelAt: [210, 222] },
      { id: "e-rb", from: "prom", to: "rb1", label: "scrapes" },
      { id: "e-py-a", from: "py1", to: "py2" },
      { id: "e-py-b", from: "py2", to: "py3" },
      { id: "e-go-a", from: "go1", to: "go2" },
      { id: "e-go-b", from: "go2", to: "go3" },
      { id: "e-rb-a", from: "rb1", to: "rb2" },
      { id: "e-rb-b", from: "rb3", to: "rb2" },
      { id: "e-pyv", from: "py3", to: "vendor", label: "calls" },
      { id: "e-gov", from: "go3", to: "vendor", label: "calls" },
      { id: "e-rbv", from: "rb3", to: "vendor", label: "polls" },
      { id: "e-list", from: "list", to: "prom", label: "reuse" },
      { id: "e-batch", from: "batch", to: "prom", label: "batch" },
    ],
    steps: [
      { text: "A vendor's API quota has no exporter, so you write one. Prometheus scrapes `/metrics`; the exporter turns the vendor's JSON into gauges. Python and Go can fetch on every scrape through a custom collector. The Ruby gem has no such hook, so Ruby polls in the background." },
      { text: "Don't reinvent: check the exporters list on prometheus.io and the vendor's docs; many products expose Prometheus metrics already. For a cron job's result, write a `*.prom` file for node_exporter's textfile collector. The Pushgateway is for service-level batch jobs only.", on: ["list", "batch", "prom"], flow: ["e-list", "e-batch"] },
      { text: "Python: `start_http_server(9877)` serves the default `REGISTRY` from a daemon thread, so the main thread only has to stay alive.", on: ["prom", "py1", "g-py"], flow: ["e-py"] },
      { text: "A `Collector` subclass whose `collect()` yields `GaugeMetricFamily` objects runs on every scrape. Nothing is kept between scrapes, so an account that disappears stops being exported. Define `describe()` returning `[]`, or `register()` calls `collect()` once at startup.", on: ["py1", "py2", "py3", "vendor"], flow: ["e-py-a", "e-py-b", "e-pyv"] },
      { text: "Go: a private `prometheus.NewRegistry()` holds only your collector, with no global state and no default Go runtime metrics unless you add them. `promhttp.HandlerFor(reg, ...)` serves it.", on: ["prom", "go1", "g-go"], flow: ["e-go"] },
      { text: "Implement the two-method `Collector` interface: `Describe` sends the `*Desc`s, and `Collect` sends `MustNewConstMetric` values built fresh each scrape. `Collect` may run concurrently, so any cache you add needs a lock. `http.Client{Timeout: 5s}` keeps a slow vendor inside the scrape timeout.", on: ["go1", "go2", "go3", "vendor"], flow: ["e-go-a", "e-go-b", "e-gov"] },
      { text: "Ruby: the `prometheus-client` gem keeps metric objects in a registry, and `Prometheus::Middleware::Exporter` serves them from any Rack app. Its README documents no fetch-on-scrape collector, so a background thread polls the vendor and calls `set`.", on: ["prom", "rb1", "rb2", "rb3", "vendor", "g-rb"], flow: ["e-rb", "e-rb-a", "e-rb-b", "e-rbv"] },
      { text: "Polling means values are up to 60 seconds old, and an account that vanishes keeps its last value. Say so in the help text. Under Puma in clustered mode, switch to `DirectFileStore`: the default `Synchronized` store is for a single process.", on: ["rb2", "rb3"], flow: ["e-rb-b"] },
      { text: "Naming: prefix with the exporter name and use base units: `vendorapi_quota_remaining`, `_seconds`, `_total` only on counters. Prometheus' own `up` says the exporter answered; your `vendorapi_up` says whether the vendor did. Alert on both.", on: ["prom", "py2", "go2", "rb2"] },
      { text: "The default scrape timeout is 10 seconds. If the vendor can be slower, a fetch-on-scrape exporter fails the whole scrape and every series goes stale. Then cache in the exporter, serve the cached value, and note the caching in the HELP text.", on: ["prom", "vendor", "py3", "go3"], flow: ["e-pyv", "e-gov"] },
    ],
    code: [
      { lang: "python", label: "Python · prometheus_client", src: String.raw`import time
import requests
from prometheus_client import start_http_server
from prometheus_client.core import GaugeMetricFamily, REGISTRY
from prometheus_client.registry import Collector

class QuotaCollector(Collector):
    def collect(self):                 # called on every scrape: fresh, no shared state
        up = GaugeMetricFamily("vendorapi_up", "1 if the vendor quota API answered")
        left = GaugeMetricFamily("vendorapi_quota_remaining",
                                 "API calls left in the current window", labels=["account"])
        try:
            r = requests.get("https://api.vendor.example/v1/quota", timeout=5)
            r.raise_for_status()
            for acct in r.json()["accounts"]:
                left.add_metric([acct["id"]], acct["remaining"])
            up.add_metric([], 1)
        except requests.RequestException:
            up.add_metric([], 0)       # scrape still succeeds, so Prometheus' up stays 1
        yield up
        yield left

    def describe(self):
        return []                      # else register() calls collect() once up front

REGISTRY.register(QuotaCollector())
start_http_server(9877)                # /metrics served from a daemon thread
while True:
    time.sleep(3600)                   # keep the main thread alive` },
      { lang: "go", label: "Go · client_golang", src: String.raw`package main

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	upDesc   = prometheus.NewDesc("vendorapi_up", "1 if the vendor quota API answered.", nil, nil)
	leftDesc = prometheus.NewDesc("vendorapi_quota_remaining",
		"API calls left in the current window.", []string{"account"}, nil)
	vendor = &http.Client{Timeout: 5 * time.Second} // stay inside the scrape timeout
)

type quotaCollector struct{} // satisfies prometheus.Collector

func (quotaCollector) Describe(ch chan<- *prometheus.Desc) { ch <- upDesc; ch <- leftDesc }

func (quotaCollector) Collect(ch chan<- prometheus.Metric) { // may run concurrently
	var body struct {
		Accounts []struct {
			ID        string  ` + "`json:\"id\"`" + String.raw`
			Remaining float64 ` + "`json:\"remaining\"`" + String.raw`
		} ` + "`json:\"accounts\"`" + String.raw`
	}
	resp, err := vendor.Get("https://api.vendor.example/v1/quota")
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			err = errors.New(resp.Status)
		} else {
			err = json.NewDecoder(resp.Body).Decode(&body)
		}
	}
	if err != nil {
		ch <- prometheus.MustNewConstMetric(upDesc, prometheus.GaugeValue, 0)
		return
	}
	ch <- prometheus.MustNewConstMetric(upDesc, prometheus.GaugeValue, 1)
	for _, a := range body.Accounts { // fresh const metrics every scrape
		ch <- prometheus.MustNewConstMetric(leftDesc, prometheus.GaugeValue, a.Remaining, a.ID)
	}
}

func main() {
	reg := prometheus.NewRegistry() // only our metrics: no globals
	reg.MustRegister(quotaCollector{})
	http.Handle("/metrics", promhttp.HandlerFor(reg, promhttp.HandlerOpts{}))
	log.Fatal(http.ListenAndServe(":9877", nil))
}` },
      { lang: "ruby", label: "Ruby · prometheus-client", src: String.raw`# config.ru: run with ` + "`rackup -p 9877`" + String.raw` (or puma)
require "json"
require "net/http"
require "prometheus/client"
require "prometheus/middleware/exporter"

registry = Prometheus::Client.registry
up   = registry.gauge(:vendorapi_up, docstring: "1 if the last quota poll worked")
left = registry.gauge(:vendorapi_quota_remaining,
                      docstring: "API calls left (polled every 60s)", labels: [:account])

Thread.new do                     # no fetch-on-scrape hook: poll in the background
  loop do
    begin
      res = Net::HTTP.get_response(URI("https://api.vendor.example/v1/quota"))
      raise res.message unless res.is_a?(Net::HTTPSuccess)
      JSON.parse(res.body)["accounts"].each do |a|
        left.set(a["remaining"], labels: { account: a["id"] })
      end
      up.set(1)
    rescue StandardError => e     # keep the thread alive; old values stay exported
      warn "quota poll failed: #{e.message}"
      up.set(0)
    end
    sleep 60
  end
end

use Prometheus::Middleware::Exporter   # answers GET /metrics from the registry
run ->(_env) { [404, { "content-type" => "text/plain" }, ["try /metrics\n"]] }` },
    ],
    codeNote: "Before writing one: search the exporters list on prometheus.io and the vendor's docs. For a cron job, write `vendor_quota.prom` to node_exporter's `--collector.textfile.directory` (temp file, then `mv`). Python and Go fetch on scrape; Ruby polls, so its values can be up to a minute old.",
    compare: [
      { lang: "Python", idiom: "`prometheus_client`: set metric objects directly, or register a custom `Collector` whose `collect()` yields fresh metric families per scrape.",
        good: ["A fetch-on-scrape collector is about 15 lines.", "`start_http_server` serves `/metrics` from a daemon thread with no web framework."],
        bad: ["Under gunicorn, multiprocess mode (`PROMETHEUS_MULTIPROC_DIR`) is required, and custom collectors don't work there.", "Without `describe()`, the default registry calls `collect()` at registration, so startup hits the vendor."] },
      { lang: "Go", idiom: "`client_golang`: implement the two-method `Collector` interface and emit `MustNewConstMetric` per scrape, served by `promhttp.HandlerFor`.",
        good: ["The reference implementation behind node_exporter and blackbox_exporter; one small self-contained binary (pure Go, no cgo).", "Const metrics per scrape: vanished label values disappear and there is no shared state to race on."],
        bad: ["`Collect` may be called concurrently, so any cache needs a mutex.", "The most boilerplate: each metric is described twice (Desc and const metric) and label values must match the Desc's order."] },
      { lang: "Ruby", idiom: "`prometheus-client` gem: a registry of metric objects served by Rack middleware; with no collector hook, a thread sets gauges.",
        good: ["Drops into any Rack app (Rails, Sinatra) with one `use` line.", "`DirectFileStore` handles pre-forking servers such as clustered Puma."],
        bad: ["No fetch-on-scrape: values are as old as the last poll, and stale label values stay until you clear them.", "The default `Synchronized` store is single-process only."] },
    ],
    say30: "First I'd check the exporters list, and for a cron job I'd use node_exporter's textfile collector. If I really need an exporter, I'd write it in Go: implement Describe and Collect, build const metrics on every scrape, serve them from a private registry with promhttp, and ship a small self-contained binary. Python is nearly as short with a custom collector that yields metric families. Ruby's gem has no fetch-on-scrape hook, so I'd poll in a thread and accept stale values. In all three: base-unit names, a bounded label set, a `vendorapi_up` that's separate from Prometheus' `up`, and caching if the vendor is slow or rate-limited.",
    gotchas: [
      "Shared gauges updated on each scrape race when two scrapes overlap, and label values for deleted accounts never go away. Build fresh metrics per scrape: Go `MustNewConstMetric`, Python metric families.",
      "`up == 1` only means the exporter answered. If the vendor call failed, you need your own `vendorapi_up` to see it.",
      "Go's `MustNewConstMetric` panics if the number of label values doesn't match the `Desc`; label values are positional, in the order the `Desc` declared them.",
      "Labels with unbounded values (user IDs, request IDs) explode the series count. An account label is fine when accounts number in the dozens.",
    ],
    atScale: [
      "Every Prometheus replica scrapes independently: an HA pair at a 15-second interval makes 8 vendor calls a minute per exporter, more with several clusters. Vendor rate limits bite; cache the vendor's answer for its own refresh period and serve the cache.",
      "Slow upstream: past the scrape timeout (10 seconds by default) the scrape fails, `up` flaps and every series goes stale. The exporter guidelines accept caching for expensive fetches; record the cache age in HELP or as a metric.",
      "Many similar targets (hundreds of accounts or devices): don't run one exporter per target. The multi-target pattern (`/probe?target=`, as blackbox and SNMP exporters use) lets service discovery feed targets to one exporter; the docs say only the Go, Python and Java libraries support writing it.",
      "Cardinality: each label combination is a series. 50 accounts times 5 quota types is fine; a per-user label across a million users is not.",
      "Process model: Python under gunicorn needs multiprocess mode, and Ruby under clustered Puma needs `DirectFileStore`. A Go exporter is one process with goroutines, which avoids both and is one reason most exporters are written in Go.",
    ],
    agentic: [
      "Search the exporters list before asking an agent for one: a generated exporter works in minutes, but an existing one is maintained by someone else. If you do write it, review the Prometheus specifics rather than the syntax: fresh const metrics per scrape, a bounded label set, a separate `vendorapi_up`, and label values in the order the `Desc` declared them.",
      "LLM APIs are now one of the quotas worth watching: Anthropic returns `anthropic-ratelimit-*-remaining` headers on each response, so the client making calls can record them as gauges and alert before agents hit a 429. Keep labels to model and workspace, never prompt or user IDs; OTel's GenAI token counters (`gen_ai.client.inference.usage.*`, still Development status) track consumption alongside them, but not the remaining headroom the headers report.",
      "A generated exporter that passes one local scrape can still fail in production. Test it under the real process model (gunicorn multiprocess mode, clustered Puma with `DirectFileStore`) and with two overlapping scrapes, which is where shared-gauge races and stale label values show up.",
    ],
    quiz: [
      { q: "Why should a fetch-on-scrape exporter create new metrics in each `collect`/`Collect` instead of updating global gauges?", a: "Overlapping scrapes would race on shared state, and label values that vanished upstream would keep being exported. Fresh const metrics show exactly what the upstream returned this time." },
      { q: "`up{job=\"vendorapi\"}` is 1, but the quota panel is empty. What happened?", a: "The exporter answered, so `up` is 1, but its call to the vendor failed. That is what `vendorapi_up` is for: alert on it as well as on `up`." },
      { q: "When is the Pushgateway the right tool here?", a: "Only for service-level batch jobs that finish before they can be scraped. A long-running exporter should be scraped, and a cron job on a host fits node_exporter's textfile collector." },
    ],
    incidents: [],
    sources: [
      { title: "Writing exporters", url: "https://prometheus.io/docs/instrumenting/writing_exporters/" },
      { title: "Metric and label naming", url: "https://prometheus.io/docs/practices/naming/" },
      { title: "Exporters and integrations", url: "https://prometheus.io/docs/instrumenting/exporters/" },
      { title: "When to use the Pushgateway", url: "https://prometheus.io/docs/practices/pushing/" },
      { title: "node_exporter README (textfile collector)", url: "https://github.com/prometheus/node_exporter/blob/master/README.md" },
      { title: "client_python: custom collectors", url: "https://prometheus.github.io/client_python/collector/custom/" },
      { title: "client_python: HTTP exposition", url: "https://prometheus.github.io/client_python/exporting/http/" },
      { title: "client_python: multiprocess mode", url: "https://prometheus.github.io/client_python/multiprocess/" },
      { title: "client_golang prometheus package (Collector, NewDesc, MustNewConstMetric)", url: "https://pkg.go.dev/github.com/prometheus/client_golang/prometheus" },
      { title: "client_ruby README", url: "https://github.com/prometheus/client_ruby/blob/main/README.md" },
      { title: "Claude API: rate limits (response headers)", url: "https://platform.claude.com/docs/en/api/rate-limits" },
      { title: "OpenTelemetry GenAI token metrics", url: "https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-token-metrics.md" },
    ],
  },
];

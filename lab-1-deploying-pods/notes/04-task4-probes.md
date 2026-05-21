# 04 — Task 4: Liveness and readiness probes

**Goal:** teach Kubernetes how to detect when your app is broken (liveness) or not yet ready for traffic (readiness), then watch self-healing in action.

## Why probes exist

Containers can be in three weird states that "process is running" doesn't capture:

```
   ┌───────────────────────────────────────────────────────────────┐
   │ State                  │ Without probes  │ With probes         │
   ├───────────────────────────────────────────────────────────────┤
   │ Process up, deadlocked │ stays alive 4ever │ liveness fails    │
   │ Process up, warming up │ gets traffic too early │ readiness gates│
   │ Process crashed        │ kubelet restarts it anyway │ same     │
   └───────────────────────────────────────────────────────────────┘
```

## Liveness vs Readiness — the one-line distinction

```
   Liveness probe fails  →  Kubernetes KILLS and RESTARTS the pod.
   Readiness probe fails →  Kubernetes STOPS sending traffic (but keeps the pod alive).
```

```
                           ┌──────────────────┐
                           │   POD running    │
                           └────────┬─────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
   ┌────────── LIVENESS ─────────┐         ┌─────── READINESS ─────────┐
   │ kubelet asks: "alive?"      │         │ kubelet asks: "ready?"    │
   │                             │         │                           │
   │ Fail 3x → KILL + RESTART    │         │ Fail 3x → remove from     │
   │                             │         │  Service's Endpoints list │
   │ "is it stuck?"              │         │ "is it warmed up?"        │
   └─────────────────────────────┘         └───────────────────────────┘
```

## The three probe types

| Type    | How it checks                            | When you'd use it                       |
|---------|------------------------------------------|-----------------------------------------|
| HTTP    | HTTP GET; success = status 200–399       | Web services with a `/health` endpoint  |
| Command | Run a shell command; success = exit 0    | Apps without an HTTP server             |
| TCP     | Open a TCP connection                    | Databases, raw TCP services             |

## Step 4.1 — Apply the deployment with probes

Use `../manifests/detail_deployment_with_probes.yaml`.

The diff vs Task 2's manifest is the addition of two blocks under the container spec:

```yaml
livenessProbe:
  httpGet:
    path: /ping
    port: 3000
  initialDelaySeconds: 5    # wait 5s after pod starts before first probe
  periodSeconds: 5          # then probe every 5s
  timeoutSeconds: 1         # each probe times out after 1s
  successThreshold: 1       # 1 success = healthy
  failureThreshold: 3       # 3 failures in a row = restart

readinessProbe:
  exec:
    command: ["/bin/bash", "-c", "cat readiness.txt | grep ready"]
  initialDelaySeconds: 15
  periodSeconds: 3
```

### The tunables, visualized

```
   Pod starts at t=0
   │
   │   initialDelaySeconds: 5
   │◄──────────────────►│
   │                    │
   │              first liveness probe ────► success? continue : count failure
   │                    │
   │                    │     periodSeconds: 5
   │                    │◄──────────────────►│
   │                                         next probe ...
   │
   ▼
```

If `failureThreshold` (3) is hit in a row, the pod is killed.

```bash
kubectl apply -f ~/detail_deployment_with_probes.yaml
```

Because this changes the Pod template, the Deployment creates a **new ReplicaSet** and rolls pods over — so the pod name changes.

## Step 4.2 — Refresh the pod name

```bash
export DETAIL_POD=$(kubectl get pods -n workshop -l app=proddetail -o jsonpath='{.items[0].metadata.name}')
echo $DETAIL_POD
```

## Step 4.3 — Inject a fault to fail the liveness probe

```bash
kubectl exec -it $DETAIL_POD -n workshop -- bash
```

Then inside the pod:

```bash
curl http://proddetail.workshop.svc.cluster.local:3000/injectFault \
  && while sleep 5; do printf "\n...Getting detail status... " \
  && curl http://proddetail.workshop.svc.cluster.local:3000/ping; done
```

What this command does:
1. Hits `/injectFault` → the app flips an internal flag so future `/ping` returns HTTP 500.
2. Loops every 5s curling `/ping` so you can watch it return `"UnHealthy"`.

```
   t=0     /injectFault hit              → app now returns 500 on /ping
   t=5     ...Getting detail status... UnHealthy
   t=10    ...Getting detail status... UnHealthy
                       │
                       │  meanwhile kubelet's liveness probe also fails
                       │  3 consecutive failures (failureThreshold)
                       ▼
   t=~15   kubelet kills the container
           your shell session dies → "command terminated with exit code 137"
```

Exit code **137** = `128 + 9` = killed by SIGKILL. Classic "I was terminated."

## Step 4.4 — Confirm the kill in the event log

```bash
kubectl get event -n workshop --field-selector involvedObject.name=$DETAIL_POD
```

Look for these two messages:

```
   Warning  Unhealthy  Liveness probe failed: HTTP probe failed with statuscode: 500
   Normal   Killing    Container proddetail failed liveness probe, will be restarted
```

## Step 4.5 — Confirm the pod was restarted, not destroyed

```bash
kubectl get pod -n workshop -l app=proddetail
```

```
   NAME                          READY   STATUS    RESTARTS    AGE
   proddetail-754798777f-zmvhz   1/1     Running   1 (70s ago) 7m31s
                                                   └──┬──┘
                                                  RESTARTS = 1
```

**Key insight:** the pod NAME stayed the same; only `RESTARTS` went from 0 → 1. Liveness-driven restarts happen in-place — same pod, new container.

```
   Liveness restart:
       Pod (same name)
        ├── Container v1 (killed)
        └── Container v2 (fresh) ← Restarts: 1

   Deployment update / pod eviction:
       Old Pod (deleted)         New Pod (new name)
        └── Container             └── Container
```

## Step 4.6 — Now test the readiness probe

The readiness probe runs:
```
   /bin/bash -c "cat readiness.txt | grep ready"
```

Success = file contains the word `ready`. So we'll break it on purpose.

```bash
export DETAIL_POD=$(kubectl get pods -n workshop -l app=proddetail -o jsonpath='{.items[0].metadata.name}')
kubectl exec -it $DETAIL_POD -n workshop -c proddetail -- sed -i 's/ready/fail/' readiness.txt
```

`sed -i 's/ready/fail/'` replaces "ready" with "fail" inside the pod's `readiness.txt`. Next readiness probe → grep finds nothing → exit code 1 → fail.

```bash
kubectl describe deployment proddetail -n workshop | grep Replicas
```

Expected:
```
   Replicas:  1 desired | 1 updated | 1 total | 0 available | 1 unavailable
                                                  │
                                          pod is alive but
                                       removed from Service Endpoints
```

```
   Liveness still passing? YES (the /ping endpoint is fine)
   Readiness passing?      NO  (sed broke the file)

   Result: pod KEEPS RUNNING but Service stops routing to it.
   This is exactly what readiness is for — graceful traffic gating.
```

## Step 4.7 — Recover

```bash
kubectl exec -it $DETAIL_POD -n workshop -c proddetail -- sed -i 's/fail/ready/' readiness.txt \
  && kubectl get deployment proddetail -n workshop --watch
```

The `--watch` flag streams updates until you `Ctrl+C`. You should see `AVAILABLE` flip from 0 → 1 within a few seconds.

## Summary table — what fails do what

| Scenario                        | Liveness | Readiness | Outcome                          |
|---------------------------------|----------|-----------|----------------------------------|
| App returns 500 on `/ping`      | FAIL     | (depends) | Container killed + restarted     |
| App slow to start up            | (initialDelay protects it) | FAIL | Held out of Service until ready |
| App stuck/deadlocked            | FAIL     | maybe FAIL | Container killed + restarted    |
| App healthy but warming caches  | OK       | FAIL      | Pod alive, not yet receiving traffic |

## What you learned in Task 4

- Liveness = "kill me if I'm broken." Readiness = "don't send me traffic yet."
- Probes can be HTTP, exec, or TCP.
- Exit code 137 = killed by SIGKILL (probe-driven restart).
- Failing liveness → same pod, `RESTARTS++`. Different from a Deployment rollout (new pod name).
- Failing readiness → pod stays alive, gets removed from Service Endpoints.
- Always pair liveness with `initialDelaySeconds` (or a separate `startupProbe`) so slow-starting apps don't get killed during boot.

Next: `05-task5-cleanup.md`.

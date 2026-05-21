# Lab 1 — Quick reference cheatsheet

Single page of every command + concept from the lab. Print this and keep it next to you.

## kubectl verbs you used

| Command                                      | What it does                                  |
|----------------------------------------------|-----------------------------------------------|
| `kubectl version --output=yaml`              | Client + server K8s versions                  |
| `kubectl get namespaces`                     | List all namespaces                           |
| `kubectl get deploy,svc,pod -n <ns>`         | Combined list of 3 resource types             |
| `kubectl apply -f file.yaml`                 | Create or update from YAML                    |
| `kubectl set image deploy/<name> <c>=<img>`  | Imperatively change a container image         |
| `kubectl describe <kind> <name> -n <ns>`     | Verbose details + Events                      |
| `kubectl exec -it <pod> -n <ns> -- bash`     | Shell into a pod                              |
| `kubectl get event -n <ns> --field-selector involvedObject.name=<pod>` | Pod's event timeline |
| `kubectl get pod -n <ns> -l <label>=<val>`   | Filter pods by label                          |
| `kubectl get <kind> --watch`                 | Stream updates until Ctrl+C                   |
| `kubectl delete namespace <ns>`              | Cascade-delete everything in a namespace      |

## Resource short names (saves typing)

| Long form         | Short  |
|-------------------|--------|
| `pods`            | `po`   |
| `services`        | `svc`  |
| `deployments`     | `deploy` |
| `replicasets`     | `rs`   |
| `namespaces`      | `ns`   |
| `configmaps`      | `cm`   |
| `persistentvolumeclaims` | `pvc` |
| `nodes`           | `no`   |
| `events`          | `ev`   |

## The relationship diagram (memorize this)

```
   ┌──── Deployment ────┐
   │                    │ owns
   │   ┌── ReplicaSet ──┤
   │   │                │ owns
   │   │   ┌── Pod ─────┤
   │   │   │            │ owns
   │   │   │  Container │
   │   │   └────────────┘
   │   └────────────────┘
   └────────────────────┘

       Selectors + Labels (independent of ownership)
       ┌──────────────┐    matches    ┌─────────────┐
       │  Service     │ ────────────► │  Pod        │
       │  selector    │               │  labels     │
       └──────────────┘               └─────────────┘
```

## Service types — when to use which

| Type           | Reach              | Cost  | Used for                          |
|----------------|--------------------|-------|-----------------------------------|
| `ClusterIP`    | inside cluster     | free  | backend-to-backend (default)      |
| `NodePort`     | each node's IP     | free  | dev / quick external poke         |
| `LoadBalancer` | the public internet| $$$   | user-facing entrypoints           |

## Probe types — when to use which

| Type    | Mechanism                              | Use when                          |
|---------|----------------------------------------|-----------------------------------|
| HTTP    | `httpGet` on a path                    | App has a `/health` HTTP endpoint |
| Exec    | Run a command inside the container     | App can be checked via shell      |
| TCP     | Open a TCP connection                  | Databases, raw TCP servers        |

| Probe       | On failure                                    |
|-------------|-----------------------------------------------|
| `livenessProbe`  | Kill + restart the container              |
| `readinessProbe` | Remove pod from Service Endpoints (no kill) |
| `startupProbe`   | Used during slow boot; other probes wait  |

## Probe tunables (defaults are often wrong)

| Field                  | Meaning                                              |
|------------------------|------------------------------------------------------|
| `initialDelaySeconds`  | Wait this long before first probe                    |
| `periodSeconds`        | Probe every N seconds                                |
| `timeoutSeconds`       | A single probe times out after this                  |
| `successThreshold`     | Consecutive successes to flip back to healthy        |
| `failureThreshold`     | Consecutive failures before action                   |

## Common gotchas

| Symptom                                          | Likely cause                                          |
|--------------------------------------------------|-------------------------------------------------------|
| `Endpoints: <none>` on a Service                 | Service selector doesn't match any Pod's labels       |
| Pod stuck in `ImagePullBackOff`                  | ECR auth, wrong image tag, or typo in image path      |
| Pod restarts forever (CrashLoopBackOff)          | App crashes on boot; check `kubectl logs` and Events  |
| Liveness kills pod during slow startup           | Need `initialDelaySeconds` or a `startupProbe`        |
| Exit code 137 in events                          | Killed by SIGKILL (OOM or liveness probe)             |
| Browser can't load LB URL                        | ELB DNS not propagated yet — wait 2–3 min             |
| `default` namespace filling up with junk         | Always pass `-n <namespace>` or set context           |

## Set a default namespace (save yourself typing)

```bash
kubectl config set-context --current --namespace=workshop
```

Then drop the `-n workshop` everywhere.

## The lab in one line

> Deploy three microservices into a namespace, expose one publicly with a LoadBalancer, prove probes detect both stuck and not-yet-ready pods, then clean up by deleting the namespace.

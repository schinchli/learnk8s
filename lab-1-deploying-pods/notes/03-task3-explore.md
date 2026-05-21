# 03 — Task 3: Explore the application resources

**Goal:** poke around inside the running cluster — describe a service, describe a pod, then `exec` into the pod and look at its DNS config.

## Mental model: four ways to look at a resource

```
   kubectl get          → one-line summary, table form           (overview)
   kubectl describe     → every field + recent events            (deep dive)
   kubectl get -o yaml  → the raw manifest as the cluster sees it (debug / diff)
   kubectl logs         → stdout/stderr from the container       (runtime)
```

## Step 3.1 — Describe the Service

```bash
kubectl describe service proddetail -n workshop
```

You're looking for these fields:

```
   Selector:    app=proddetail        ← who this Service routes to
   Type:        ClusterIP             ← internal-only
   IP:          172.20.32.120         ← virtual IP assigned to the Service
   Port:        http  3000/TCP        ← port the Service listens on
   Endpoints:   10.10.120.108:3000    ← actual pod IP(s) backing the Service
```

**Key insight:** `Endpoints` is the list of pod IPs that match the selector. If `Endpoints` is empty, your Service has no pods to route to — usually a label mismatch.

```
   Service (virtual IP)         Endpoints (real pod IPs)
   ┌──────────────────────┐     ┌────────────────────────┐
   │ 172.20.32.120 :3000  │ ──► │ 10.10.120.108:3000     │
   │  (stable forever)    │     │ 10.10.120.109:3000     │  if replicas=2
   │                      │     │ 10.10.120.110:3000     │  if replicas=3
   └──────────────────────┘     └────────────────────────┘
                                  (change every restart)
```

### Labels vs annotations

| Property    | Used by Kubernetes for selection? | Length / chars allowed |
|-------------|-----------------------------------|-------------------------|
| Labels      | YES                                | short, restricted       |
| Annotations | NO — purely metadata for humans/tools | any length, any chars |

The lab gave the Service:
- label `app: proddetail` → used by the Service's own selector to match pods
- annotation `owner: student` → just a note; no controller reads it

## Step 3.2 — Capture the pod name in a variable

```bash
export DETAIL_POD=$(kubectl get pods -n workshop -l app=proddetail -o jsonpath='{.items[0].metadata.name}')
echo $DETAIL_POD
```

Breakdown:
```
   kubectl get pods               ← list pods
       -n workshop                ← in this namespace
       -l app=proddetail          ← that have this label
       -o jsonpath='{.items[0].metadata.name}'
                                  ← extract just the name of the first one
```

Pod names look like `proddetail-57dddc6b6f-z8kt6`:

```
   proddetail-57dddc6b6f-z8kt6
   └────┬───┘ └────┬───┘ └─┬─┘
   Deployment    pod-template-    random
     name         hash (per         suffix
                  ReplicaSet)
```

## Step 3.3 — Describe the Pod

```bash
kubectl describe pod $DETAIL_POD -n workshop
```

Fields worth memorizing:

```
   Node:           ip-10-10-10-241...   ← which EC2 worker the pod runs on
   IP:             10.10.10.171         ← pod's IP (changes on restart!)
   Controlled By:  ReplicaSet/...       ← who's responsible for keeping it alive
   Containers:                          ← all containers in the pod
     proddetail:
       Image:      <ECR url>
       Port:       3000/TCP
       State:      Running
       Ready:      True
       Restart Count: 0
   Events:                              ← timeline at the bottom
     Scheduled, Pulling, Pulled, Created, Started, ...
```

The **Events** section at the bottom is the first thing to read when something is broken.

### Ownership chain

```
   Deployment "proddetail"
        │ owns ▼
   ReplicaSet "proddetail-57dddc6b6f"
        │ owns ▼
   Pod "proddetail-57dddc6b6f-z8kt6"
        │ owns ▼
   Container "proddetail"
```

When you delete a Pod, the ReplicaSet immediately spawns a replacement. When you delete the Deployment, everything below it cascades away.

## Step 3.4 — Exec into the pod

```bash
kubectl exec -it $DETAIL_POD -n workshop -- /bin/bash
```

Flags:
- `-i` = stdin attached
- `-t` = allocate a TTY (so the shell renders nicely)
- `--` = everything after this is the command to run *inside the container*

```
   Your laptop terminal                    Inside container "proddetail"
   ┌────────────────────┐                  ┌──────────────────────────┐
   │ $ kubectl exec ... │ ───TLS to API──► │ #  ← you are root here   │
   │                    │ ◄────tunnel────  │ # ls /                   │
   │                    │                  │ # cat /etc/resolv.conf   │
   └────────────────────┘                  └──────────────────────────┘
```

Try inside:
- `ls /` — see the container's filesystem
- `cat /proc/mounts` — kernel mount table
- `cat /etc/resolv.conf` — see how DNS is configured

## Step 3.5 — Read `/etc/resolv.conf`

```bash
cat /etc/resolv.conf
```

This is **the file that makes Kubernetes service discovery work.**

```
   search   workshop.svc.cluster.local  svc.cluster.local  cluster.local  us-west-2.compute.internal
   nameserver 172.20.0.10
   options ndots:5
```

What each line means:

| Line          | Meaning                                                          |
|---------------|------------------------------------------------------------------|
| `nameserver`  | IP of `kube-dns` / CoreDNS — the cluster's internal DNS server   |
| `search`      | Suffixes auto-appended to short names                            |
| `ndots:5`     | If your query has fewer than 5 dots, try search suffixes first   |

### Why this matters

When code inside this pod does `fetch("http://prodcatalog:5000")`, the resolver:

```
   1. Tries:  prodcatalog.workshop.svc.cluster.local   ← matches! returns Service IP
   2. (would try):  prodcatalog.svc.cluster.local
   3. (would try):  prodcatalog.cluster.local
   4. (would try):  prodcatalog.us-west-2.compute.internal
   5. (would try):  prodcatalog   (as-is)
```

That's why microservices can call each other by short name (`prodcatalog`) within the same namespace — DNS magic in `resolv.conf`.

## Step 3.6 — Exit the pod

```bash
exit
```

You're back on the IDE terminal. The pod keeps running.

## What you learned in Task 3

- `describe` is your friend for debugging — read the Events section first.
- A Service has a stable **ClusterIP**; its **Endpoints** are the actual pod IPs.
- Labels are for selection; annotations are for humans.
- Pods own containers; ReplicaSets own pods; Deployments own ReplicaSets.
- `kubectl exec` is just a tunneled shell, indistinguishable from SSH-ing in.
- Cross-service DNS resolution is configured by `/etc/resolv.conf` in every pod.

Next: `04-task4-probes.md`.

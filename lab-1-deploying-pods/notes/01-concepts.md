# 01 — Kubernetes concepts you need before Task 2

If you only remember 6 things from this page, remember the diagram on the next section. Everything else in the lab is just commands on top of these primitives.

## The mental model

```
┌──────────────────────────── EKS CLUSTER ─────────────────────────────┐
│                                                                      │
│  ┌─────────── NAMESPACE: workshop ──────────────────────────────┐    │
│  │                                                              │    │
│  │   ┌────────── DEPLOYMENT (proddetail) ────────────┐          │    │
│  │   │   desired state: "I want 1 replica running"    │          │    │
│  │   │                                                │          │    │
│  │   │   ┌──── REPLICASET (auto-created) ────┐        │          │    │
│  │   │   │  enforces replica count = 1        │       │          │    │
│  │   │   │                                    │       │          │    │
│  │   │   │   ┌──── POD ────┐                  │       │          │    │
│  │   │   │   │ container:  │  ◄── if it dies, ReplicaSet         │    │
│  │   │   │   │ proddetail  │      spawns a new one               │    │
│  │   │   │   │ port: 3000  │                                     │    │
│  │   │   │   └─────────────┘                  │       │          │    │
│  │   │   └────────────────────────────────────┘       │          │    │
│  │   └────────────────────────────────────────────────┘          │    │
│  │                                                              │    │
│  │   ┌─────────── SERVICE (proddetail) ───────────────┐         │    │
│  │   │  stable virtual IP + DNS name                   │        │    │
│  │   │  forwards traffic to any Pod with label         │        │    │
│  │   │      app: proddetail                            │        │    │
│  │   │  type: ClusterIP  → only reachable inside cluster│       │    │
│  │   └─────────────────────────────────────────────────┘        │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

## The 6 primitives

### 1. Pod
The smallest unit. **One or more containers sharing a network and storage.** Pods are mortal — they get IPs, they die, they get replaced with a new IP.

### 2. ReplicaSet
A controller whose only job is: *"make sure exactly N pods matching this label exist."* You almost never create one directly.

### 3. Deployment
A higher-level controller that **manages a ReplicaSet for you** and handles rolling updates. This is what you actually write YAML for. When you change the image, it creates a new ReplicaSet and gracefully shifts pods over.

```
   You change image in Deployment
            │
            ▼
   Deployment creates NEW ReplicaSet  ─── ramps up new pods
            │
            ▼
   OLD ReplicaSet  ─── ramps down old pods
```

### 4. Service
A stable network endpoint. Pods come and go with random IPs; a Service gives them a permanent name and load-balances across them.

Three flavors:
| Type           | Reachable from        | Used for                       |
|----------------|-----------------------|--------------------------------|
| `ClusterIP`    | Inside cluster only   | backend-to-backend             |
| `NodePort`     | Each node's IP:port   | dev / quick external access    |
| `LoadBalancer` | The public internet (via cloud LB) | user-facing frontend |

### 5. Namespace
A logical folder inside the cluster. Lets multiple teams share one cluster without colliding. Default namespaces you'll see:

| Namespace          | Purpose                                                          |
|--------------------|------------------------------------------------------------------|
| `default`          | where stuff goes if you don't specify                            |
| `kube-system`      | Kubernetes' own components (DNS, controller-manager, etc.)       |
| `kube-public`      | publicly-readable cluster info                                   |
| `kube-node-lease`  | node heartbeat objects (perf optimization)                       |
| `workshop`         | created by this lab's CloudFormation — where your app lives      |
| `amazon-guardduty` | AWS-managed security agent — ignore it                           |

### 6. Labels & Selectors
The glue. Almost every "X talks to Y" connection in Kubernetes is "X has a selector that matches Y's labels."

```
   Service proddetail            Pod proddetail-xyz
   ┌────────────────────┐        ┌────────────────────┐
   │ selector:          │ ─────► │ labels:            │
   │   app: proddetail  │        │   app: proddetail  │
   └────────────────────┘        └────────────────────┘
            match!
```

If labels don't match, the Service routes to nothing. This is the #1 source of "why isn't my app working" bugs.

## Declarative vs imperative

Kubernetes is **declarative**: you describe the *desired state* in a YAML file, and controllers loop forever trying to make reality match.

```
   You:     "I want 3 pods of nginx running"   (declared in YAML)
                          │
                          ▼
   kubectl apply -f file.yaml    (send to API server)
                          │
                          ▼
   Controllers:  observe → compare → act → observe → compare → act ...
```

Contrast with imperative (`kubectl run`, `kubectl scale`) — you tell it the *steps* instead of the *goal*. Declarative wins for production because the YAML file *is* the source of truth.

## kubectl in 30 seconds

The CLI you use to talk to the cluster's API server. The pattern:

```
   kubectl  <verb>     <resource>   <name>   [flags]
            │          │            │
            │          │            └── optional, omit to act on all
            │          └── pod, deployment, service, namespace, ...
            └── get, describe, apply, delete, exec, logs, ...
```

Memorize these 5 verbs and you can do 90% of the lab:

| Verb       | What it does                                           |
|------------|--------------------------------------------------------|
| `get`      | List resources (table form)                            |
| `describe` | Show every detail of one resource (verbose)            |
| `apply -f` | Send a YAML file to the cluster (create or update)     |
| `exec -it` | Open a shell inside a running pod                      |
| `delete`   | Remove a resource                                      |

Now go to `02-task2-deploy.md`.

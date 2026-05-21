# 02 — Task 2: Deploy a Kubernetes application

**Goal:** stand up the third microservice (`proddetail`), wire it to the rest of the app, then load the frontend in a browser.

## Starting state (what CloudFormation already gave you)

```
   Namespace: workshop
   ┌────────────────────────────────────────────────────────┐
   │                                                        │
   │   frontend       ◄── exposed via LoadBalancer Service  │
   │      │                                                 │
   │      ▼                                                 │
   │   prodcatalog    (ClusterIP)                           │
   │      │                                                 │
   │      ▼                                                 │
   │   proddetail     ◄── MISSING! you build this           │
   │                                                        │
   └────────────────────────────────────────────────────────┘
```

## Step 2.1 — Verify kubectl works

```bash
kubectl version --output=yaml
```

**What to look for in output:**
- `clientVersion.gitVersion` → your CLI version (e.g. `v1.35.2-eks-...`)
- `serverVersion.gitVersion` → the EKS control plane version
- Mismatch by more than one minor version = bad time

```
   ┌─ your laptop ─┐     ┌──── EKS control plane ───┐
   │ kubectl       │ ───►│ API server               │
   │ clientVersion │     │ serverVersion            │
   └───────────────┘     └──────────────────────────┘
        these two should be within ±1 minor version
```

## Step 2.2 — List namespaces

```bash
kubectl get namespaces
```

You should see `workshop` in the list. That's the sandbox your app lives in.

## Step 2.3 — See what is already running

```bash
kubectl get deploy,svc,pod -n workshop
```

The comma-separated resource list is a kubectl shortcut for "show me all three types in one shot." The `-n workshop` flag scopes the query to that namespace.

**Expected layout:**
```
   DEPLOYMENTS      → frontend, prodcatalog, proddetail  (proddetail will be replaced)
   SERVICES         → frontend (LoadBalancer), prodcatalog (ClusterIP), proddetail (ClusterIP)
   PODS             → one per deployment
```

## Step 2.4 — Capture your AWS account + region into env vars

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=$(aws configure get region)
```

These will be interpolated into the image path in the next step. The lab uses **your own ECR repos** (pre-loaded by CloudFormation) instead of pulling from public ECR.

```
   Image path that gets built:
   <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/eks-workshop-demo/catalog_detail:1.0
   └────────┬────────┘     └─────┬─────┘  └────────────────┬─────────────────┘
        your acct       your region            repo:tag in YOUR ECR
```

## Step 2.5 — Write the Deployment manifest

Use the canonical YAML in `../manifests/proddetail-deployment.yaml`, or use the heredoc command shown in the AWS lab guide to create `~/proddetail-deployment.yaml`.

### What each section of the YAML does

```
apiVersion: apps/v1          ← which Kubernetes API to use
kind: Deployment             ← what kind of object this is
metadata:
  name: proddetail           ← object name (must be unique in namespace)
  namespace: workshop        ← which namespace it lives in
spec:
  replicas: 1                ← "I want 1 pod running"
  selector:
    matchLabels:
      app: proddetail        ← which pods this Deployment owns
  template:                  ← BLUEPRINT for new pods
    metadata:
      labels:
        app: proddetail      ← must match selector above ↑
    spec:
      containers:
        - name: proddetail
          image: <ECR url>   ← container image to run
          ports:
            - containerPort: 3000   ← port the app listens on inside the container
```

**Critical link:** `spec.selector.matchLabels` MUST match `spec.template.metadata.labels`. If they drift apart, the Deployment cannot find its own pods.

```
   Deployment.spec.selector.matchLabels      Pod.metadata.labels
   ┌──────────────────────────────┐          ┌────────────────────┐
   │   app: proddetail            │ ◄──────► │   app: proddetail  │
   └──────────────────────────────┘   match  └────────────────────┘
```

## Step 2.6 — Write the Service manifest

Use `../manifests/proddetail-service.yaml`.

```
apiVersion: v1
kind: Service
metadata:
  name: proddetail
  namespace: workshop
  labels:        { app: proddetail }
  annotations:   { owner: student }       ← free-form metadata, not used for selection
spec:
  type: ClusterIP                          ← internal-only
  ports:
    - port: 3000                           ← Service's own port (what clients dial)
      name: http
  selector:
    app: proddetail                        ← routes traffic to pods with this label
```

### Service-to-Pod routing (visualized)

```
   Anyone inside the cluster calls:  proddetail.workshop.svc.cluster.local:3000
                                                  │
                                                  ▼
                         ┌─────── Service: proddetail ──────┐
                         │  selector: app=proddetail        │
                         └────────────────┬─────────────────┘
                                          │
                            ┌─────────────┼─────────────┐
                            ▼             ▼             ▼
                       Pod (label app=proddetail) — load-balanced
```

### Why `ClusterIP` is the right choice here

`proddetail` is a backend — only the frontend pod needs to call it. Exposing it via `LoadBalancer` would create a public AWS load balancer for no reason (cost + attack surface).

## Step 2.7 — Re-tag the other two services to use your ECR

```bash
kubectl set image deployment/frontend frontend=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/eks-workshop-demo/frontend_node:2.0 -n workshop
kubectl set image deployment/prodcatalog prodcatalog=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/eks-workshop-demo/product_catalog:1.0 -n workshop
```

`kubectl set image` is an **imperative** shortcut for "change the image in this deployment and trigger a rolling update." Equivalent to editing the YAML and re-applying.

```
   Before:  frontend  →  image: public-ecr/frontend:2.0
   After:   frontend  →  image: <your-acct>.dkr.ecr.../frontend_node:2.0
                         (triggers a new ReplicaSet + rolling update)
```

## Step 2.8 — Apply the proddetail manifests

```bash
kubectl apply -f ~/proddetail-deployment.yaml
kubectl apply -f ~/proddetail-service.yaml
```

What `kubectl apply` does:
```
   YAML file ──► API server ──► etcd (cluster state DB)
                       │
                       ▼
            Controllers notice the new desired state
                       │
                       ▼
            ReplicaSet schedules a pod onto a node
                       │
                       ▼
            kubelet on that node pulls the image and starts the container
```

## Step 2.9 — Get the frontend URL

```bash
echo "http://"$(kubectl get svc frontend -n workshop | awk 'END { print $4 }')
```

The `awk 'END { print $4 }'` grabs the 4th column of the **last line** of the table — which is the `EXTERNAL-IP` of the LoadBalancer service.

Open the URL in a new tab. DNS for the AWS ELB hostname can take 2–3 minutes to propagate the first time.

### What's happening behind the URL

```
   Browser  ──► AWS Classic ELB  ──► NodePort on any EC2 worker node
                                              │
                                              ▼
                                  Service: frontend (port 80)
                                              │
                                              ▼
                                  Pod: frontend  (Node.js)
                                              │
                              ┌───────────────┴───────────────┐
                              ▼                               ▼
                  Service: prodcatalog              Service: proddetail
                  → Pod: prodcatalog                → Pod: proddetail
```

## Step 2.10 — Add inventory items in the UI

Add three rows so you can see the app working end-to-end:

| id  | name  |
|-----|-------|
| 001 | desk  |
| 002 | chair |
| 003 | cable |

If items appear in the table, **every microservice is wired correctly** and you've proven the app is healthy.

## What you learned in Task 2

- The difference between a Deployment (manages pods) and a Service (exposes pods).
- How `selector` + `labels` connect Services to Pods and Deployments to their own pods.
- `ClusterIP` vs `LoadBalancer`.
- `kubectl apply -f` (declarative) vs `kubectl set image` (imperative).
- Namespace scoping with `-n`.

Next: `03-task3-explore.md`.

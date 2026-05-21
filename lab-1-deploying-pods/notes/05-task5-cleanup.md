# 05 — Task 5: Delete the application

**Goal:** tear down everything you built with one command, and understand *why* one command is enough.

## The trick: namespace cascade delete

```bash
kubectl delete namespace workshop
```

Why this is sufficient:

```
   Namespace: workshop
   │
   ├── Deployment frontend ─┬─► ReplicaSet ─► Pod
   ├── Deployment prodcatalog ─► ReplicaSet ─► Pod
   ├── Deployment proddetail ──► ReplicaSet ─► Pod
   ├── Service frontend  (LoadBalancer → AWS ELB)
   ├── Service prodcatalog
   ├── Service proddetail
   └── ...any ConfigMaps, Secrets, etc.

   Deleting the namespace removes EVERYTHING inside it,
   in dependency order, then deletes the namespace itself.
```

The Service of type `LoadBalancer` will also tell AWS to delete the underlying ELB — so you also stop paying for that. (Takes a minute or two.)

## Verify

```bash
kubectl get namespace
```

`workshop` should be gone. Built-in namespaces (`default`, `kube-system`, `kube-node-lease`, `kube-public`) and `amazon-guardduty` remain.

## Why scoping everything to a namespace is a habit worth building

Before doing real work in a cluster, ALWAYS put it in its own namespace:

```
   ❌ kubectl apply -f app.yaml           ← goes to "default", mixes with everything
   ✅ kubectl apply -f app.yaml -n myapp  ← isolated, easy to nuke later
```

When the experiment is over: `kubectl delete ns myapp`. Done. Nothing leaks.

## Gotchas

- A namespace stuck in `Terminating` for >5 minutes usually has a finalizer that can't run (often from a CRD). Rare in lab environments.
- Deleting the namespace **does not** delete cluster-scoped resources like PersistentVolumes (the `PersistentVolumeClaim` inside the namespace dies, but the `PV` itself depends on its `reclaimPolicy`).
- It does NOT delete the EKS cluster itself, or AWS resources outside the cluster (your ECR repos, IAM roles, etc.). End the lab in the AWS console to release those.

## End the lab

In the AWS lab console:
1. Sign out as `AWSLabsUser` (top right).
2. Choose **End Lab** and confirm.

This deletes the underlying CloudFormation stack and all the EKS + Code Editor infrastructure.

## What you learned in Task 5

- Namespaces are the cheapest, most reliable cleanup boundary in Kubernetes.
- Deleting a namespace cascades to every namespaced object inside it.
- `LoadBalancer` Services also clean up their cloud LB on delete.
- Always start new experiments in a fresh namespace.

## You're done with Lab 1

Quick self-check — can you answer these without looking?

1. What's the difference between a ReplicaSet and a Deployment?
2. If `kubectl get endpoints my-service` returns nothing, what's most likely wrong?
3. What does exit code 137 mean inside a pod's events?
4. Why does the lab use `ClusterIP` for `proddetail` and `prodcatalog`, but `LoadBalancer` for `frontend`?
5. What happens to a pod when its readiness probe fails, and how is that different from a liveness failure?

If any of those felt fuzzy, revisit the relevant notes file.

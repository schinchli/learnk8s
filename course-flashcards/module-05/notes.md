# Module 05 — Managing Applications at Scale in Amazon EKS

## Big Idea

EKS provides **four layered autoscalers** that each solve a different dimension of the scaling problem. Combine them correctly (HPA + Karpenter is the most common production pattern) and your application handles both bursty traffic and variable infrastructure costs automatically. GitOps with Argo CD adds the operational discipline: no manual `kubectl` changes, Git is always truth, drift is always corrected.

---

## The 4 Autoscalers — Comparison Table

| Autoscaler | What scales | Mechanism | Kubernetes object | Best for |
|---|---|---|---|---|
| **HPA** | Pod replicas (out/in) | Metrics Server → CPU/mem/custom metric → adjust `.spec.replicas` | `HorizontalPodAutoscaler` | Stateless services with variable traffic |
| **VPA** | Pod resources (up/down) | Recommender → Updater evicts → Admission Controller injects | `VerticalPodAutoscaler` | Right-sizing; stateful pods; initial resource tuning |
| **Cluster Autoscaler** | EC2 nodes (out/in) | Watches Pending pods → calls ASG DesiredCapacity | Controller deployment (no CRD) | Standard clusters with managed node groups + ASGs |
| **Karpenter** | EC2 nodes (out/in) | Watches Pending pods → EC2 Fleet API directly (no ASG) | `NodePool`, `NodeClaim` (CRDs) | Spiky demand; diverse instances; cost-optimised Spot |

**Key layering rule:** HPA scales pods first. When pods go Pending (no room on existing nodes), Karpenter or CA adds nodes. They work at different layers and complement each other.

**Do NOT combine HPA (CPU) + VPA (CPU)** on the same Deployment — they oscillate. Safe: HPA on custom metrics + VPA on CPU/memory.

---

## VPA Components and Modes

### 3 Deployments

| Component | Role |
|---|---|
| **vpa-recommender** | Watches historical/current pod CPU+memory usage → writes recommendations to `status.recommendation` |
| **vpa-updater** | Evicts pods whose live resources diverge from recommendation (Recreate / InPlaceOrRecreate modes only) |
| **vpa-admission-controller** | MutatingAdmissionWebhook — intercepts pod creation and rewrites resource requests to match the current recommendation |

### 4 Operating Modes

| Mode | Behaviour | Disruption |
|---|---|---|
| **Off** | Recommendations generated only — nothing applied | None |
| **Initial** | Resources set at pod creation; no evictions after start | Minimal |
| **Recreate** | Evicts pods and recreates with new requests | Pod restart |
| **InPlaceOrRecreate** | Updates in-place if possible; evicts only if in-place unsupported | Minimal → restart |

**Start with Off** to observe recommendations safely before enabling mutations.

---

## Cluster Autoscaler Flow (Numbered)

1. Deployment scales to 10 replicas. 3 nodes exist, only 3 pods fit → **7 pods Pending**.
2. CA detects Pending pods via the K8s scheduler's unschedulable event.
3. CA simulates scheduling against available node groups.
4. CA calls ASG `SetDesiredCapacity` → ASG launches new EC2 nodes.
5. New nodes join the cluster → kubelet registers → scheduler places Pending pods → **all Running**.
6. Scale to 14 replicas → CA tries to add more nodes → **ASG max=6 is a hard limit** → 4 pods remain Pending until ASG max is raised or replica count reduced.

**Best practices:**
- Use auto-discovery tags (`k8s.io/cluster-autoscaler/<cluster>=owned`, `k8s.io/cluster-autoscaler/enabled=true`)
- Adjust min/max directly on the ASG — not inside CA config
- Use `MixedInstancesPolicy` for On-Demand + Spot mix in a single node group
- Use Expanders (`most-pods`, `least-waste`, `price`, `priority`, `random`) for multi-node-group clusters
- Set `--balance-similar-node-groups=true` for even AZ spread

---

## Karpenter vs Cluster Autoscaler — Key Differences

| | Cluster Autoscaler | Karpenter |
|---|---|---|
| **ASG required?** | Yes — only scales pre-configured ASGs | No — provisions EC2 directly via Fleet API |
| **Instance selection** | Fixed by ASG launch template | Dynamic — picks optimal instance for pending pod |
| **Provisioning speed** | ~3–5 min (ASG + bootstrap) | ~60s (direct EC2 launch) |
| **Spot handling** | Manual ASG config | Native interruption handling + rebalancing |
| **Configuration model** | ASG tags + CA flags | `NodePool` CRD with layered constraints |
| **Best for** | Stable clusters, homogeneous workloads | Spiky demand, diverse compute, cost optimisation |

**Karpenter best practices:**
- Use for spiky demand or diverse compute needs
- Apply layered constraints: NodePool constraints narrow → pod spec (nodeSelector, affinity) narrows further
- `karpenter.sh/do-not-evict: "true"` annotation on pods that must not be evicted during consolidation
- Use `disruption` policies in NodePool to control when/how Karpenter consolidates underutilised nodes

---

## CI/CD Pipeline — 8 Stages

```
Plan → Code → Build → Test → Release → Deploy → Operate → Monitor
```

Memory trick: **"Please Can Bob Take Really Detailed Operations Metrics"**

| Stage | What happens |
|---|---|
| Plan | Feature planning, issue tracking |
| Code | Developer writes and commits code |
| Build | Compile, containerise, produce image |
| Test | Unit, integration, security scans |
| Release | Tag version, push to ECR |
| Deploy | Roll out to EKS (kubectl / GitOps) |
| Operate | Runtime management, scaling, config |
| Monitor | Metrics, logs, alerts, feedback loop |

**CI** = Plan → Test (automated build + test on every commit)
**CD** = Release → Deploy (automated delivery to staging/prod)

In an EKS pipeline: built image → **ECR** → Deployment manifest updated → pods rolled out.

---

## GitOps — 4 Principles

1. **Git as single source of truth** — all desired state (app + infra) lives in Git
2. **Declarative** — describe *what* you want, not *how* to get there; no imperative kubectl commands
3. **Approved changes applied automatically** — merged PR = deployed change; Git merge IS the approval gate
4. **Software agents ensure consistent state** — controllers (Argo CD) continuously reconcile cluster to Git and correct drift

---

## Argo CD Pattern (How It Works)

Argo CD watches a **manifest Git repo**. It continuously compares:
- **Desired state** = what's in Git
- **Live state** = what's actually running in the cluster

When they differ (drift), Argo CD syncs the cluster to match Git.

---

## 2 GitOps Scenarios

### Scenario 1 — Application code change

```
Developer pushes code
  → CI pipeline triggers (Build + Test)
  → CI pushes new image to ECR
  → CI updates image tag in manifest repo (Git)
  → Argo CD detects manifest change (drift)
  → Argo CD syncs EKS cluster → pods rolled out with new image
```

### Scenario 2 — Unauthorized direct change (drift detection)

```
Someone runs: kubectl edit deployment myapp
  → Live cluster state now differs from Git
  → Argo CD detects drift on next reconcile loop
  → Argo CD reverts cluster to Git-declared state
  → Manual change is undone
```

**Why this matters:** GitOps makes `kubectl edit` ineffective on managed resources — the cluster always converges back to Git. All changes must go through Git (PR → merge → auto-sync).

---

## Quick-Fire Recall (10 Q&A)

1. **Q: HPA scales ___ ; VPA scales ___**
   A: HPA scales pod replicas (count). VPA scales pod resources (CPU/memory).

2. **Q: The 3 VPA deployments?**
   A: vpa-recommender, vpa-updater, vpa-admission-controller.

3. **Q: Which VPA mode applies recommendations with zero disruption?**
   A: Off (never applies, read-only).

4. **Q: What triggers Cluster Autoscaler to add nodes?**
   A: Pods stuck in Pending state due to insufficient node capacity.

5. **Q: CA cannot add nodes — most likely cause?**
   A: ASG maximum size has been reached.

6. **Q: Which autoscaler does NOT use Auto Scaling Groups?**
   A: Karpenter.

7. **Q: Karpenter annotation to prevent pod eviction during consolidation?**
   A: `karpenter.sh/do-not-evict: "true"`

8. **Q: The 8 CI/CD pipeline stages in order?**
   A: Plan, Code, Build, Test, Release, Deploy, Operate, Monitor.

9. **Q: In GitOps, someone does `kubectl edit`. What happens?**
   A: Argo CD detects drift and reverts the cluster to the Git-declared state.

10. **Q: Name the 4 GitOps principles.**
    A: (1) Git as single source of truth, (2) Declarative, (3) Approved changes applied automatically, (4) Software agents ensure consistent state.

---

## Lab 3 Preview

Lab 3 covers **deploying Cluster Autoscaler** to an EKS cluster:

- Configure ASG tags for auto-discovery
- Deploy CA with the correct IAM permissions (`cluster-autoscaler:DescribeAutoScalingGroups`, `SetDesiredCapacity`, etc.)
- Verify scale-out by deploying a load generator that creates Pending pods
- Observe node count increase in the EC2 console
- Optional: replace CA with Karpenter — deploy NodePool CRD, remove CA deployment, verify faster provisioning

**Key thing to verify:** after scale-out, Pending pods should transition to Running. After load drops, CA/Karpenter should scale nodes back in (scale-down delay default: 10 minutes of underutilisation).

# Module 02 — Amazon EKS Fundamentals: Fast-Study Notes

> Study time: ~20 min. Read once, then drill the flashcards.

---

## The Big Idea

EKS splits Kubernetes into two responsibility zones:
- **Control plane** → AWS manages it (you never touch it)
- **Data plane** → you choose how to manage it (EC2 nodes, managed node groups, or Fargate)

---

## 1. What EKS Is

| Component | What it does | Who runs it |
|-----------|-------------|-------------|
| Amazon EKS | Creates K8s clusters via EKS Distro | AWS |
| AWS Fargate | Serverless Pod compute | AWS |
| Amazon EC2 | Worker nodes for your cluster | You |
| EKS Dashboard | Visual view of running apps in Console | AWS (tool) |

**EKS Distro** = the upstream K8s distribution EKS uses. Open-source. Same as AWS internal.

---

## 2. EKS Control Plane — What AWS Manages For You

Lives in an **AWS-managed account** (separate from yours).

Components AWS runs and repairs automatically:
- `kube-apiserver` (your `kubectl` endpoint)
- `etcd` (cluster state — replicated, multi-AZ, auto-repaired)
- `kube-scheduler`
- `kube-controller-manager`

**Key exam point:** You have **zero access** to control-plane EC2 instances. You access the cluster only through the API endpoint.

**HA:** Multi-AZ, auto-repaired. You never trigger a control-plane failover.

**Networking:** An ENI is injected into your VPC so control plane ↔ node traffic is private.

**Pricing:** ~$0.10/hour per cluster for the managed control plane. Worker nodes billed separately.

---

## 3. EKS Data Plane — Three Options

```
Self-managed nodes     → You do everything (launch, patch, replace)
Managed node groups   → EKS does provisioning/updating/scaling via ASG
AWS Fargate           → Zero nodes; each Pod = isolated micro-VM
```

### Managed Node Groups (MNG)

EKS handles:
1. **Provisioning** — launches EC2 in an Auto Scaling Group
2. **Managing** — joins nodes to the cluster
3. **Updating** — rolling AMI + K8s version upgrades (cordon → drain → terminate)
4. **Scaling** — min/max/desired controls
5. **eksctl** — first-class CLI support

**Rolling update pattern:**
1. Add new node (new K8s version/AMI)
2. Cordon old node (no new Pods)
3. Drain old node (evict Pods to new node, respects PodDisruptionBudgets)
4. Terminate old node
5. Repeat for each node

**Monitoring:** `InstanceLimitExceeded` = the cluster ran out of EC2 capacity. CloudWatch metrics on the underlying ASG.

### AWS Fargate

**5 properties:** Native · Rightsized · Fast and simple · Transparent · Optimized

**Fargate Profile fields:**
```json
{
  "fargateProfileName": "myprofile",
  "clusterName": "mycluster",
  "podExecutionRoleArn": "iam-role-xyz",
  "subnets": ["subnet-0ad888345"],
  "selectors": [
    { "namespace": "prod", "labels": { "stack": "frontend" } }
  ]
}
```

**Pod scheduling:** EKS checks each new Pod against all Fargate profiles. If namespace + labels match → Fargate micro-VM. If no match → EC2 node.

**Hard constraint:** Fargate Pods must run in **private subnets only**.

---

## 4. Fargate vs Node Groups — Decision Table

| Use Fargate when… | Use node groups when… |
|------------------|----------------------|
| Reduce scheduling complexity | Need privileged Pods |
| Compliance: 1 Pod per VM | Need nodes in public subnets |
| Reduce variable cost | Need to control workload disruptions |
| Eliminate infra management | Need faster Pod start times |

---

## 5. Two APIs — Never Confuse These

| API | Tool | Manages |
|-----|------|---------|
| **Kubernetes API** | `kubectl` | Pods, Deployments, Services, ConfigMaps, Namespaces, CRDs |
| **Amazon EKS API** | `eksctl`, AWS CLI, Console | Clusters, node groups, Fargate profiles, add-ons, OIDC, tagging |

**Memory hook:** kubectl = what runs INSIDE. eksctl/Console = the cluster INFRASTRUCTURE.

---

## 6. Permissions Review

| Action | Mechanism | Notes |
|--------|-----------|-------|
| Enforce app runtime rules | Admission Controller | Intercepts API requests; validate or mutate |
| Auto-add annotations | MutatingAdmissionWebhook | Calls external HTTP endpoint at admission time |
| Connect to K8s API server | kubeconfig file | `aws eks update-kubeconfig` generates it |
| Add a node to cluster | IAM role + kubeconfig | IAM = AWS API calls; kubeconfig = K8s registration |

---

## 7. Module Summary (from the course)

> "Amazon EKS manages the control plane. Managed node groups manage your data plane while still giving you control. AWS fully manages AWS Fargate nodes."

---

## Lab 1 Preview

Lab 1 tasks:
1. Create and deploy a Kubernetes application
2. Create Deployment, Service, and Namespace resources
3. View resources in a namespace
4. Inspect Service and Deployment details
5. Inspect a Pod
6. Execute commands inside a Pod (`kubectl exec`)
7. Delete the application

---

## Quick-Fire Recall (test yourself)

1. Who manages etcd in EKS? → **AWS/EKS**
2. Which component is always managed by EKS? → **Control plane**
3. Fargate Pods require what subnet type? → **Private subnets**
4. What field in a Fargate profile holds the IAM role? → **podExecutionRoleArn**
5. Which tool talks to the Kubernetes API? → **kubectl**
6. Which tool talks to the EKS API? → **eksctl / AWS CLI**
7. What event signals EC2 capacity exhaustion in a node group? → **InstanceLimitExceeded**
8. What adds annotations automatically at creation time? → **MutatingAdmissionWebhook**

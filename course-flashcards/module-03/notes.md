# Module 03 — Building & Maintaining an Amazon EKS Cluster
## Fast-Study Notes

---

## Big Idea

EKS cluster lifecycle = **create** → **configure nodes** → **upgrade**. You choose *how* opinionated you want to be at each step. eksctl is the fastest path; IaC (CloudFormation, Blueprints, Terraform) is the right path for production. Upgrades are always control plane first, data plane second.

---

## 3 Cluster Creation Interfaces

| Interface | Command / Tool | What it creates for you | Best for |
|-----------|---------------|------------------------|----------|
| **AWS Console** | GUI wizard | Nothing (you click everything) | Learning, one-offs |
| **AWS CLI** | `aws eks create-cluster` | Only the EKS cluster (you pre-create VPC, IAM, subnets) | Scripted automation, full control |
| **eksctl** | `eksctl create cluster` | VPC, IAM roles, cluster, node group, kubeconfig — all automatically | Any real cluster |

---

## eksctl Key Flags

```bash
eksctl create cluster \
  --name prod --version 1.27 --region us-west-2 \
  --nodegroup-name standard-workers --node-type t3.medium \
  --nodes 3 --nodes-min 1 --nodes-max 4 --managed
```

| Flag | Purpose |
|------|---------|
| `--version` | Kubernetes version |
| `--region` | AWS region (or set in cluster.yaml) |
| `--node-type` | EC2 instance type for workers |
| `--nodes` / `--nodes-min` / `--nodes-max` | Desired / min / max count |
| `--managed` | Create a managed node group (EKS handles updates) |

---

## eksctl cluster.yaml Example

```yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: MySecondEKScluster
  region: us-east-1
vpc:
  subnets:
    private:
      us-east-1b: { id: subnet-0fdd9b15cb2da9ce6 }
nodeGroups:
  - name: ClusterTwoNodes
    instanceType: m5.xlarge
    desiredCapacity: 3
    privateNetworking: true
```

---

## eksctl Defaults (what it auto-creates)

1. IAM role for the **cluster** (control plane)
2. IAM role for **node groups** (workers)
3. Dedicated **VPC** — CIDR `192.168.0.0/16`
4. Public and private **subnets** across 2 AZs
5. **EKS cluster** (control plane)
6. **Managed node group** (if `--managed`)
7. Configured **API endpoint access**
8. **kubeconfig** entry written to `~/.kube/config`

Under the hood, eksctl submits **CloudFormation stacks** for all resources.

---

## 4 AMI Types

| AMI Type | OS | Key Trait | Fargate? |
|----------|----|-----------|----------|
| **EKS Optimized Linux** | Amazon Linux 2 / AL2023 | Default; turnkey; pre-configured by AWS | N/A (no nodes) |
| **Bottlerocket** | Custom minimal Linux | Open-source; container-only; immutable root FS | No (EC2 only) |
| **Custom AMI** | Any Linux | Built from GitHub spec; full control | **NOT supported** |
| **Windows AMI** | Windows Server 2019/2022 | Windows containers; mixed OS clusters | No (EC2 only) |

**Bottlerocket advantages:** minimal attack surface, immutable root filesystem, atomic OS updates with rollback, no general-purpose packages.

---

## 8-Step Upgrade Sequence

| Step | Phase | Action |
|------|-------|--------|
| 1 | Pre-upgrade | Review Kubernetes release notes |
| 2 | Pre-upgrade | Backup cluster (optional but recommended) |
| 3 | Pre-upgrade | Identify API changes (removed/deprecated APIs) |
| 4 | Pre-upgrade | Check node group version compatibility |
| 5 | Control plane | **Upgrade cluster control plane** (EKS API/Console) |
| 6 | Add-ons | Review and upgrade EKS managed add-ons |
| 7 | Add-ons | Upgrade kubectl to match cluster version |
| 8 | Data plane | **Upgrade cluster data plane** (nodes) |

**Rule:** Control plane FIRST, data plane LAST.

---

## What Happens During Control Plane Upgrade

- New API server nodes deployed alongside old ones
- Auto rollback if health checks fail (no manual intervention)
- Possible minor service interruptions
- Worker nodes remain on old version (unchanged until Step 8)
- Add-ons remain unchanged until Step 6

---

## 3 Node Upgrade Methods

| Node Type | How to Upgrade |
|-----------|---------------|
| **Self-managed nodes** | AWS native tools or third-party tools (manual) |
| **Managed node groups** | AWS Console or `eksctl upgrade nodegroup` |
| **AWS Fargate** | No upgrade required — AWS handles it automatically |

---

## Version Rules

| Upgrade type | Can remove APIs? | Who applies it? |
|---|---|---|
| **Patch version** (1.27.1 → 1.27.2) | No | AWS applies automatically to control plane |
| **Minor version** (1.27 → 1.28) | **Yes** | Customer-controlled |
| **Major version** | Yes | Customer-controlled (rare in K8s) |

---

## Declarative Options

| Tool | Description |
|------|-------------|
| **CloudFormation** | AWS-native IaC; auto-rollback on failure; native integration |
| **EKS Blueprints** | Fully bootstrapped clusters with add-ons and operational software (CDK or Terraform) |
| **Terraform / AWS SDK** | Multi-cloud IaC; rich community module ecosystem |

---

## Quick-Fire Recall

**Q: What VPC CIDR does eksctl use by default?**
A: `192.168.0.0/16`

**Q: Which AMI is open-source and purpose-built for containers?**
A: Bottlerocket

**Q: What does `--managed` do in eksctl?**
A: Creates a managed node group — EKS handles OS patches and rolling updates

**Q: Custom AMIs are NOT supported with which EKS deployment type?**
A: AWS Fargate

**Q: Which two entities receive IAM permissions via the node IAM role?**
A: kubelet on each node (B) + Applications running in pods (D)

**Q: Two ways to set the region in eksctl?**
A: `--region` flag OR `metadata.region` in cluster.yaml

**Q: What is the minimum upgrade type that can remove a Kubernetes API?**
A: Minor version upgrade (e.g. 1.27 → 1.28)

**Q: Which node type never needs a manual upgrade?**
A: AWS Fargate — AWS upgrades it automatically

---

## Lab 2 Preview — Creating an EKS Cluster

Expected Lab tasks:
- Install and configure eksctl
- Run `eksctl create cluster` with a cluster.yaml
- Verify cluster creation in the Console (CloudFormation stacks)
- Confirm kubeconfig is written (`kubectl get nodes`)
- Explore node group details in EKS console
- Optionally: trigger a control plane upgrade and observe add-on versioning

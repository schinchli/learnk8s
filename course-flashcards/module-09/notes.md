# Module 09 — Managing Security in Amazon EKS
## Study Notes

---

## Big Idea: Defense in Depth with the 4Cs

Security in cloud-native systems is not a single control — it is **layered**. The 4Cs model gives you a mental model: each layer wraps the next, and a failure in an outer layer can expose inner layers. You must secure all four simultaneously.

---

## 4Cs Table

| Layer | What It Protects | Examples of Threats | Your Controls |
|---|---|---|---|
| **Cloud** | AWS infrastructure | Misconfigured VPC, overly permissive IAM, account compromise | VPC design, IAM least privilege, SCPs, CloudTrail |
| **Cluster** | Kubernetes layer | RBAC misconfiguration, privileged pod escape, secrets in plaintext etcd | RBAC, admission controllers, network policies, etcd encryption, audit logs |
| **Container** | Container images | CVE in base image, root-running container, container breakout | ECR image scanning, non-root user, readOnlyRootFilesystem, drop capabilities |
| **Code** | Application logic | SQL injection, XSS, hardcoded secrets, vulnerable dependencies | SAST, dependency scanning, input validation, secrets manager (not env vars) |

---

## Shared Responsibility Table

| Responsibility | Default EKS (self-managed) | Managed Node Groups | Fargate |
|---|---|---|---|
| K8s control plane | AWS | AWS | AWS |
| Node OS patching | **You** | AWS | AWS |
| Node provisioning & replacement | **You** | AWS | AWS |
| Container runtime | **You** | **You** (choose) | AWS |
| Network config, VPC, security groups | **You** | **You** | **You** |
| IAM policies | **You** | **You** | **You** |
| RBAC configuration | **You** | **You** | **You** |
| Pod security context | **You** | **You** | **You** |
| Application workloads | **You** | **You** | **You** |

**Key insight:** Moving to Managed Node Groups shifts OS patching responsibility to AWS. Moving to Fargate shifts the entire node layer to AWS. IAM, RBAC, networking, and app code are always yours.

---

## Two Permission Systems Table

| Dimension | IAM | Kubernetes RBAC |
|---|---|---|
| **Purpose** | Authentication (who you are) + AWS API authorization | Kubernetes API authorization (what you can do in K8s) |
| **Controls access to** | AWS APIs: create cluster, ECR, S3, DynamoDB | K8s APIs: create pod, list service, get secret |
| **Scope** | AWS account & resources | Kubernetes cluster resources |
| **Subject types** | IAM user, IAM role, AWS service | User, Group, ServiceAccount |
| **Policy object** | IAM Policy | Role / ClusterRole |
| **Binding object** | Policy attachment to principal | RoleBinding / ClusterRoleBinding |
| **Bridge** | aws-auth ConfigMap maps IAM principal → K8s subject | — |

**Critical exam trap:** Full AdministratorAccess IAM policy does NOT grant kubectl access. Both systems must independently allow the operation.

---

## RBAC Objects Table

| Object | Scope | What It Does | Can Be Bound By |
|---|---|---|---|
| **Role** | Namespace-scoped | Defines allowed verbs + resources in one namespace | RoleBinding |
| **ClusterRole** | Cluster-wide | Defines allowed verbs + resources across all namespaces (or non-namespaced resources like Nodes) | ClusterRoleBinding or RoleBinding |
| **RoleBinding** | Namespace-scoped | Binds Role OR ClusterRole to a subject within one namespace | — |
| **ClusterRoleBinding** | Cluster-wide | Binds ClusterRole to a subject across all namespaces | — |

**Trick:** A RoleBinding can reference a ClusterRole — the ClusterRole's permissions become limited to the RoleBinding's namespace. Useful for reusing ClusterRole definitions with namespace scope.

**Subjects:** `User`, `Group`, `ServiceAccount`

**RBAC verbs:** `get`, `list`, `watch`, `create`, `update`, `patch`, `delete`, `deletecollection`

---

## aws-auth ConfigMap

### What It Is
The `aws-auth` ConfigMap (in `kube-system`) is the **bridge between IAM and RBAC**. It maps IAM roles/users to Kubernetes usernames and groups. Without an entry here, an IAM principal cannot use kubectl — even with full AWS permissions.

### Example

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: arn:aws:iam::123456789012:role/web-admins
      username: web-admins
      groups:
        - web-admins           # K8s RBAC group — bind a ClusterRoleBinding to this
    - rolearn: arn:aws:iam::123456789012:role/eks-node-role
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
  mapUsers: |
    - userarn: arn:aws:iam::123456789012:user/alice
      username: alice
      groups:
        - system:masters        # full cluster-admin
```

### Two-Step Access Grant
1. Add IAM role ARN → K8s group mapping in aws-auth
2. Create ClusterRoleBinding (or RoleBinding) binding that K8s group to a ClusterRole (or Role)

---

## Default RBAC Groups

| Group | Maps To | Access Level |
|---|---|---|
| `system:masters` | `cluster-admin` ClusterRole | Full access to all K8s resources — use sparingly |
| `system:nodes` | `system:node` ClusterRole | Node operations (kubelet access) |
| `system:bootstrappers` | Bootstrap token role | Node join only |

**Critical:** Only the IAM entity that **created** the cluster automatically gets `system:masters`. All other principals — including your admin role in a different session — must be explicitly added to aws-auth.

---

## Service Accounts

### The Default SA Problem
- Every namespace has a `default` service account
- All pods without explicit `serviceAccountName` use it
- If you accidentally bind a powerful role to `default` SA, ALL pods in the namespace inherit it
- **Solution:** Always create purpose-specific service accounts per application

### When to Create Custom Service Accounts
- When a pod needs to call the K8s API (needs RBAC permissions)
- When a pod needs to call AWS APIs (combine with IRSA)
- Always — never use the default SA for production workloads

### Token Location
`/var/run/secrets/kubernetes.io/serviceaccount/token` — automatically projected by kubelet  
Also: `ca.crt` (cluster CA cert) and `namespace` file

Disable auto-mounting when not needed: `automountServiceAccountToken: false`

---

## IRSA (IAM Roles for Service Accounts)

### What Problem It Solves
Without IRSA, pods use the **node's IAM role** — all pods on a node share the same AWS permissions. One compromised pod gives attacker access to everything the node can reach. IRSA scopes credentials per service account.

### Three-Way Trust

```
EKS OIDC Issuer
    ↕ (issues signed JWT for SA)
K8s Service Account ←→ AWS IAM
    (annotated with role ARN)   (trust policy references OIDC issuer + SA)
              ↓
         AWS STS returns temp credentials
```

### Setup Steps
1. **Associate OIDC provider:** `eksctl utils associate-iam-oidc-provider --cluster <name> --approve`
2. **Create IAM role** with trust policy referencing cluster OIDC issuer URL + exact `system:serviceaccount:<namespace>:<sa-name>`
3. **Attach IAM permissions policy** (only what the pod needs)
4. **Annotate K8s SA:** `eks.amazonaws.com/role-arn: <IAM-role-ARN>`
5. **Deploy pod** using that SA — kubelet injects credentials via projected volume automatically

### Key Files (injected by kubelet)
- `AWS_WEB_IDENTITY_TOKEN_FILE` — path to OIDC token
- `AWS_ROLE_ARN` — the IAM role to assume
- AWS SDK picks these up automatically — no code changes needed

### Trust Policy Condition (Critical)
```json
"StringEquals": {
  "<oidc-issuer>:sub": "system:serviceaccount:<namespace>:<sa-name>"
}
```
This condition is what makes IRSA secure — without it, any SA in the cluster could assume the role.

---

## Quick-Fire Recall (12 Q&A)

1. **Q: Which C covers RBAC?**  
   A: Cluster (C2)

2. **Q: Who manages node OS patching on Fargate?**  
   A: AWS

3. **Q: What does aws-auth ConfigMap do?**  
   A: Maps IAM roles/users to Kubernetes usernames and groups (IAM → RBAC bridge)

4. **Q: I have full AdministratorAccess IAM policy. Can I run kubectl?**  
   A: Not without an aws-auth entry AND an RBAC binding

5. **Q: What does IRSA stand for and what does it solve?**  
   A: IAM Roles for Service Accounts. Gives pods scoped IAM roles instead of sharing the node IAM role.

6. **Q: Which K8s object is cluster-wide: Role or ClusterRole?**  
   A: ClusterRole

7. **Q: Can a RoleBinding reference a ClusterRole?**  
   A: Yes — the ClusterRole's permissions are limited to the RoleBinding's namespace

8. **Q: What group gives full cluster-admin access?**  
   A: `system:masters`

9. **Q: Who automatically gets cluster-admin on a new EKS cluster?**  
   A: Only the IAM entity that created the cluster

10. **Q: What is the IRSA annotation on a K8s service account?**  
    A: `eks.amazonaws.com/role-arn: <ARN>`

11. **Q: What are RBAC subjects?**  
    A: User, Group, ServiceAccount

12. **Q: GuardDuty detects what kind of EKS threat?**  
    A: Privilege escalation, credential theft, container breakouts, cryptomining, unusual K8s API calls

---

## Lab 6 (Capstone) Preview

Lab 6 applies Module 09 concepts end-to-end:

- **Task 1:** Review cluster RBAC — check existing ClusterRoleBindings, understand what access exists
- **Task 2:** Configure aws-auth ConfigMap — add a new IAM role with least-privilege K8s access
- **Task 3:** Create a scoped service account — custom SA, Role, and RoleBinding for an app
- **Task 4:** Set up IRSA — associate OIDC provider, create IAM role, annotate SA, deploy pod that calls S3
- **Task 5:** Test access boundaries — verify the pod can only access what it should, verify GuardDuty findings for test escalation attempt

**Key skills to practice before lab:**
- `kubectl get clusterrolebinding -o yaml`
- `kubectl auth can-i <verb> <resource> --as <user>`
- `eksctl utils associate-iam-oidc-provider`
- `aws eks get-token --cluster-name <name>`

# Module 08 — Managing Storage in Amazon EKS

## Big Idea

Storage in EKS is a layered abstraction problem: the app asks for storage via a PVC, the cluster admin defines how storage is provisioned via StorageClass, and the CSI driver translates that into real AWS API calls (EBS, EFS, FSx). Secrets are stored in AWS Secrets Manager and injected by ASCP — never hardcoded in pods.

---

## Stateless vs Stateful — comparison table

| Dimension | Stateless | Stateful |
|-----------|-----------|----------|
| Pod identity | Interchangeable | Unique per pod |
| Data | Transient (can be rebuilt) | Must persist across restarts |
| Storage | Ephemeral (emptyDir) is fine | Requires PersistentVolume |
| Scaling | Kill/replace any replica | Ordered — N running before N+1 |
| Examples | Web frontends, REST APIs | Databases, message brokers |
| Controller | Deployment | StatefulSet |

---

## StatefulSets — when and properties

**Use a StatefulSet when you need:**
1. Stable network IDs — pod DNS must be predictable (`mysql-0.mysql-svc`)
2. Persistent storage per pod — each replica owns its data
3. Ordered deployment/scaling — pod N must be Running before pod N+1
4. Ordered rolling updates — updates proceed in reverse ordinal order

**Properties:**
- Pod names: `<name>-<ordinal>` — e.g., `mysql-0`, `mysql-1`
- Each pod gets its own PVC via `volumeClaimTemplates`
- PVC is retained when pod is deleted — reattached when pod rescheduled
- Pod DNS: `<pod-name>.<headless-service>.<namespace>.svc.cluster.local`

---

## 4 storage objects — when each is used

| Object | What it is | Created by | Use when |
|--------|-----------|------------|----------|
| `emptyDir` | Ephemeral volume, deleted with pod | Developer (inline in pod spec) | Scratch space, caching, inter-container share |
| PersistentVolume (PV) | Cluster-level resource representing actual storage (EBS vol, EFS mount) | Admin or dynamically by StorageClass | Backend storage representation |
| PersistentVolumeClaim (PVC) | User request for storage (size + access mode) | Developer (referenced in pod spec) | Requesting storage in a pod manifest |
| StorageClass | Defines a storage tier; enables dynamic provisioning | Cluster admin | Defining how PVs are created on demand |

**Key flow:** PVC → StorageClass → CSI driver → AWS (creates PV) → PVC bound → pod mounts PVC

**Key rule for devs:** reference PVC only (never PV directly). PVs are an admin/infra concern.

---

## EBS vs EFS comparison table

| Feature | EBS (Elastic Block Store) | EFS (Elastic File System) |
|---------|--------------------------|--------------------------|
| Storage type | Block (SSD or HDD) | Managed NFS file system |
| Access mode | ReadWriteOnce (one node) | ReadWriteMany (many pods/nodes) |
| Protocol | Block device | NFSv4 |
| Fargate support | NO — requires EC2 attach | YES — NFS over network |
| Capacity | Fixed at creation (expandable) | Elastic — grows/shrinks automatically |
| Performance | High IOPS, low latency | Moderate latency, scalable throughput |
| CSI provisioner | `ebs.csi.aws.com` | `efs.csi.aws.com` |
| Best for | Databases, single-replica stateful apps | Shared content, ML datasets, CMS |

---

## EBS volume types table

| Type | Category | Use case |
|------|----------|----------|
| `gp2` | General purpose SSD (legacy) | Older workloads (prefer gp3) |
| `gp3` | General purpose SSD (current default) | Most workloads — baseline IOPS + throughput independent |
| `io1` | Provisioned IOPS SSD | High-performance databases |
| `io2` | Provisioned IOPS SSD + Block Express | Mission-critical databases, sub-millisecond latency |
| `st1` | Throughput HDD | Big data, log processing, large sequential reads |
| `sc1` | Cold HDD | Infrequently accessed data, lowest cost |

---

## Storage scenarios decision table

| Scenario | Answer | Why |
|----------|--------|-----|
| Stateless replicas, no persistence | emptyDir | Transient data, pod-lifetime scope |
| Stateful replicas need SHARED data | Amazon EFS | ReadWriteMany — all pods mount same FS |
| Each stateful replica needs INDEPENDENT storage + expansion | Amazon EBS | ReadWriteOnce per pod + `allowVolumeExpansion: true` |
| Fargate pod needs persistent storage | Amazon EFS | EBS not supported on Fargate |
| HPC / ML training, parallel high throughput | Amazon FSx for Lustre | Designed for parallel HPC access patterns |

---

## CSI driver — what it is, driver names

**Container Storage Interface (CSI)** is a standardized API that decouples storage vendor code from Kubernetes. Each storage type ships a separate driver installed as an EKS add-on.

| Driver | Provisioner string | Installed via |
|--------|--------------------|---------------|
| EBS CSI Driver | `ebs.csi.aws.com` | EKS add-on: `aws-ebs-csi-driver` |
| EFS CSI Driver | `efs.csi.aws.com` | EKS add-on: `aws-efs-csi-driver` |
| Secrets Store CSI Driver | `secrets-store.csi.k8s.io` | Helm or EKS add-on |

Both EBS and EFS CSI drivers authenticate to AWS via **IRSA** (IAM Roles for Service Accounts). No static credentials.

**StorageClass fields that matter:**
- `provisioner` — which CSI driver to call
- `volumeBindingMode: WaitForFirstConsumer` — ensures EBS volume created in same AZ as pod
- `allowVolumeExpansion: true` — allows PVC resize without deleting
- `parameters.type: gp3` — EBS volume type
- `parameters.encrypted: "true"` — enables EBS encryption

---

## Secrets — default behavior, base64 trap, KMS option

**Default behavior:**
- Values are **base64 encoded** — NOT encrypted
- Stored in **etcd** — etcd disk is encrypted at rest (EKS manages this)
- Exposed to pods as **env vars** or **mounted files**

**The base64 trap:**
> base64 is encoding, not encryption. `echo "dXNlcjpwYXNz" | base64 -d` → `user:pass`. Anyone with API access or etcd access can decode any Secret instantly.

**KMS envelope encryption (optional):**
- Configure via `EncryptionConfig` with a KMS key ARN at cluster creation
- Kubernetes encrypts secret values with a data key; KMS protects the envelope key
- Adds true encryption on top of base64 — recommended for production

**Two ways to inject a Secret into a pod:**
1. **Env var** — `env.valueFrom.secretKeyRef` — simple, but visible in process env
2. **Volume mount (file)** — more secure, supports ASCP auto-rotation

---

## ASCP — what it does, how it works, IRSA connection

**AWS Secrets and Configuration Provider (ASCP)** is a plugin for the Secrets Store CSI Driver that fetches secrets from AWS Secrets Manager or SSM Parameter Store and delivers them into pods.

**What it does:**
- Mounts secrets as files inside pods at a configured path
- Optionally syncs secrets to Kubernetes Secret objects (for backward compat)
- Supports automatic key rotation — re-fetches updated secrets periodically
- Works with both AWS Secrets Manager AND SSM Parameter Store

**How it works (5-step flow):**
1. Admin creates `SecretProviderClass` CRD: specifies `provider: aws` and `objectName`/`objectType`
2. Pod starts with `volumes[].csi.driver: secrets-store.csi.k8s.io` referencing the SecretProviderClass
3. CSI driver calls ASCP provider → ASCP assumes the pod's IRSA role
4. ASCP calls `secretsmanager:GetSecretValue` → receives secret value
5. Secret is written as a file at the mount path; optional: K8s Secret object created

**IRSA connection:**
- The pod's service account is annotated: `eks.amazonaws.com/role-arn: arn:aws:iam::123:role/my-role`
- IAM policy on that role allows `secretsmanager:GetSecretValue` for specific secret ARNs only
- Pods without the annotated service account CANNOT access the secret
- No long-lived IAM credentials in the cluster

**Required components:**
- Secrets Store CSI Driver (`secrets-store.csi.k8s.io`)
- ASCP provider plugin for AWS
- IRSA role on pod's service account
- `SecretProviderClass` custom resource
- Pod spec: CSI volume + volumeMount

---

## Quick-fire recall — 10 Q&A

| # | Question | Answer |
|---|----------|--------|
| 1 | What is the default Kubernetes Secret encoding? | base64 (NOT encrypted) |
| 2 | EBS access mode? | ReadWriteOnce (one node) |
| 3 | EFS access mode? | ReadWriteMany (many pods/nodes) |
| 4 | Can Fargate pods use EBS? | No — EFS only |
| 5 | EBS CSI provisioner string? | `ebs.csi.aws.com` |
| 6 | StorageClass field to ensure EBS AZ alignment? | `volumeBindingMode: WaitForFirstConsumer` |
| 7 | What Kubernetes object do developers use in pod specs (not PV)? | PVC (PersistentVolumeClaim) |
| 8 | What ASCP uses to restrict secret access to specific pods? | IRSA (IAM Roles for Service Accounts) |
| 9 | StatefulSet pod names follow what pattern? | `<name>-<ordinal>` e.g. `mysql-0` |
| 10 | What CSI driver does the Secrets Store use? | `secrets-store.csi.k8s.io` |

---

## Lab 5 preview

**Lab 5: Managing Storage in Amazon EKS**

What you'll do:
1. Inspect pre-created StorageClasses in the cluster (EBS gp3, EFS)
2. Create a PersistentVolumeClaim using the EBS StorageClass
3. Assign the PVC to a pod and verify the volume is mounted
4. Write data to the mounted volume inside the pod
5. Delete and recreate the pod — confirm data persists (PVC retained)
6. Manage storage lifecycle: cleanup PVC and observe PV status

Key thing to observe: when the pod is deleted and recreated, the PVC remains Bound and the data survives — this is the fundamental difference from emptyDir.

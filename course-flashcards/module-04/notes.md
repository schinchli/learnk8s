# Module 04 — Deploying Applications to Your Amazon EKS Cluster

## Big Idea

Getting an application onto EKS reliably at scale requires three things working together: a **container image registry** (ECR) to store immutable artifacts, a **package manager** (Helm) to bundle Kubernetes manifests into reusable charts, and a **CI/CD pipeline** to connect code commits to automatic deploys. Each layer removes a category of human error.

---

## Scaling Deployment — 3 Steps

| Step | What you set up | Why it matters |
|------|----------------|----------------|
| 1 | Container image repository (ECR) | Versioned, immutable artifacts — every env gets the exact same binary |
| 2 | Package manager / deployment tools (Helm) | Reusable, parameterised K8s manifests — no manual YAML edits per env |
| 3 | Automate your CI/CD pipeline | Every commit → build → test → push → deploy with no human kubectl |

---

## Amazon ECR

### What it is
Amazon Elastic Container Registry (ECR) is a **fully managed registry** for Docker images and OCI artifacts. AWS runs the infrastructure; you create repositories and push/pull images.

### Key features
- Fully managed — no registry servers to operate
- Highly available and scalable
- Encryption at rest (AWS KMS)
- Optional vulnerability scanning (two tiers — see below)
- IAM integration — no separate credential management on AWS
- Image signing (AWS Signer / OCI standard)
- Docker and OCI artifact support (including Helm charts)

### Registry vs Repository hierarchy

```
AWS Account
├── Private Registry (ONE per account)
│   ├── Repository: my-app
│   │   ├── image:1.0.0
│   │   └── image:1.1.0
│   └── Repository: my-worker
│       └── image:latest
└── Public Registry (ONE per account — gallery.ecr.aws)
```

**One registry per account. Many repositories per registry. Many image tags per repository.**

---

## ECR Image Scanning

| Feature | Basic scanning | Enhanced scanning |
|---------|---------------|-------------------|
| Engine | Clair (open-source) | Amazon Inspector |
| Trigger | On push OR on demand | Continuous + on push |
| Frequency limit | **Max once per 24h per image** | No 24h limit |
| Coverage | OS packages only | OS + language packages (npm, pip, gem…) |
| EventBridge events | No | **Yes** — enables automated remediation |
| Cost | Included | Extra (Inspector pricing) |

**Exam trap**: Basic scanning has a hard 24-hour frequency limit. Enhanced does not.

---

## ECR Workflow — 5 Steps

1. **Create repo** — `aws ecr create-repository --repository-name my-app`
2. **Authenticate Docker** — `aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com`
3. **Build + tag** — `docker build -t <ecr-uri>/my-app:1.0 .`
4. **Push** — `docker push <ecr-uri>/my-app:1.0`
5. **Consume** — Pod spec sets `image: <ecr-uri>/my-app:1.0`; EKS node pulls using its IAM role

**URI format**: `<account-id>.dkr.ecr.<region>.amazonaws.com/<repo-name>:<tag>`

---

## Helm — Kubernetes Package Manager

### What it is
Helm is the **Kubernetes package manager**. It bundles K8s manifests into a versioned, shareable unit called a **chart**.

### Common tasks
- Create **standardised, reusable** manifest templates
- **Eliminate deployment errors** (no per-environment YAML editing)
- **Manage app versioning** — chart versions + app versions
- Perform **in-place upgrades** and quick **rollbacks**
- Install from Artifact Hub, ECR, or S3

---

## Helm Chart Anatomy

```
my-chart/
├── Chart.yaml        ← MANDATORY — chart name, version, description
├── values.yaml       ← MANDATORY — default configuration values
├── templates/        ← MANDATORY — Go-templated K8s manifests
│   ├── pod.yaml
│   ├── service.yaml
│   └── deployment.yaml
└── charts/           ← optional — chart dependencies (sub-charts)
```

**Only Chart.yaml is described as the mandatory file containing chart metadata in the knowledge check.**

---

## Helm Templating

### templates/pod.yaml
```yaml
metadata:
  name: {{ .Release.Name }}
  namespace: {{ .Release.Namespace }}
spec:
  containers:
  - name: {{ .Values.name }}
    image: {{ .Values.image }}:{{ .Values.tag }}
```

### values.yaml
```yaml
name: my-app
image: nginx
tag: 0.2
port: 8080
```

### Key template variables
| Variable | Source | Example |
|----------|--------|---------|
| `{{ .Release.Name }}` | Set at `helm install <name>` | `my-release` |
| `{{ .Release.Namespace }}` | Target namespace | `production` |
| `{{ .Values.* }}` | values.yaml (overridable) | `nginx`, `0.2` |
| `{{ .Chart.Name }}` | Chart.yaml `name` field | `my-chart` |

### Overriding values at install time
```bash
# Single value
helm install my-release ./chart --set image=my-app,tag=2.0

# Whole file override
helm install my-release ./chart -f prod-values.yaml
```

---

## Helm Chart Sources

| Source | Use case |
|--------|----------|
| **Artifact Hub** | Public charts — artifacthub.io — community maintained |
| **Amazon ECR** | Private charts stored alongside container images; IAM-controlled |
| **Amazon S3** | Private bucket as Helm repo; used in Lab 2; low-cost, IAM-controlled |

---

## Quick-Fire Recall (8 Q&A)

**Q1: What does ECR stand for?**
Amazon Elastic Container Registry.

**Q2: How many default private registries does one AWS account get in ECR?**
One.

**Q3: What engine powers ECR Basic scanning?**
Clair (open-source).

**Q4: What engine powers ECR Enhanced scanning?**
Amazon Inspector.

**Q5: What is the 24-hour rule for Basic scanning?**
Each image can be scanned at most once every 24 hours.

**Q6: Which Helm file is mandatory and contains chart metadata?**
`Chart.yaml`.

**Q7: What Helm template variable holds the install-time release name?**
`{{ .Release.Name }}`.

**Q8: What are the 3 Helm chart sources covered in the course?**
Artifact Hub, Amazon ECR, Amazon S3.

---

## Lab 2 Preview

Lab 2 — *Deploying an Application with Helm*:

1. Configure an **S3 bucket as a Helm repository**
2. **Package** your chart (`helm package ./my-chart`)
3. **Load** the packaged chart to S3
4. **Deploy** the application with `helm install`
5. **Review** `Chart.yaml` and `values.yaml` in the deployed chart

This is the end-to-end workflow connecting all three steps of the scaling deployment framework: ECR (image), Helm (chart), S3 (repo) — ready for CI/CD automation.

# Module 07 — Configuring Observability in Amazon EKS

---

## Big Idea

Observability in EKS = three pillars working together: **metrics** (numerical, over time), **logs** (discrete events), and **traces** (end-to-end request flow). No single pillar is sufficient alone.

> **Course definition:** "A measure of how well we can understand a system from the work it does, and how to make it better."

---

## Why Containers Make Observability Hard

| Challenge | Why it matters |
|---|---|
| Microservice complexity | Many services interact in ways that are hard to predict |
| Metric volume | Hundreds of pods each emit many metrics simultaneously |
| Transient containers | Container stops → logs inside it are gone unless forwarded first |
| OS is just one factor | Behaviour shaped by orchestration, networking, sidecars — not just the OS |

---

## The 3 Pillars

### 1. Metrics
- Numerical measurements sampled over time
- Examples: CPU=45%, memory=2.1 GB, req/s=200
- Used for: dashboards, alarms, autoscaling decisions
- Tools: **Prometheus** (collect) + **Grafana** (visualise)

### 2. Logs
- Discrete timestamped events (text output)
- Examples: `ERROR: connection refused to db:5432 at 14:32:07`
- Used for: debugging specific failures, audit trails
- Tools: **Fluent Bit** (collect) → OpenSearch / CloudWatch / S3

### 3. Traces
- End-to-end request journeys across multiple services
- Shows latency per hop: frontend → auth → DB
- Used for: root-cause analysis, bottleneck identification
- Tools: **ADOT** (collect) → **AWS X-Ray** (visualise)

---

## Prometheus: Format, Tool, PromQL, Grafana

### Metric format
```
metric_name{"tag"="value"} value
```
Example: `http_requests_total{method="GET",pod="web-abc"} 1234`

Plain text, served at HTTP `/metrics` endpoint on each pod.

### Prometheus tool
- Scrapes `/metrics` endpoints on a configurable interval (e.g. 15s)
- Uses Kubernetes service discovery to find scrape targets automatically
- Stores time-series data internally

### Access control plane metrics
```bash
kubectl get --raw /metrics
```
Returns Prometheus-format metrics directly from the API server.

### PromQL (Prometheus Query Language)
- `rate(http_requests_total[5m])` — per-second rate over 5 min
- `sum by (pod) (container_memory_usage_bytes)` — per-pod memory
- `up == 0` — find any down targets

### Grafana
- Dashboarding tool; connects to Prometheus as a data source
- Runs PromQL queries on a schedule and renders graphs, gauges, heatmaps
- Usually deployed together as the `kube-prometheus-stack` Helm chart

---

## CloudWatch Container Insights

### What it collects
- **Metrics:** CPU, memory, disk, network, container data
- **Logs:** container stdout/stderr

### Aggregation levels (drill-down hierarchy)
```
Cluster → Node → Pod → Task → Service
```

### How it is installed
- As a **DaemonSet agent** on each node (CloudWatch Agent)
- Requires IAM permissions on the node role
- Alternative: use the Container Insights EKS add-on

### Key capability
- Set **CloudWatch Alarms** on any collected metric
- No PromQL required — alarms are native CloudWatch

---

## Log Types in EKS

### Control plane logs (5 types — enable per-type in EKS Console → Logging tab)
| Log type | What it records |
|---|---|
| API server | All requests to the Kubernetes API |
| **Audit** | Who did what, when (security/compliance) |
| Authenticator | IAM authentication events |
| Controller manager | Reconciliation loop activity |
| Scheduler | Pod placement decisions |

Destination: CloudWatch Logs → `/aws/eks/<cluster>/cluster`

### Application / container logs
- Container writes to stdout/stderr
- Container runtime writes to node filesystem: `/var/log/containers/`
- Collected by DaemonSet agent (Fluent Bit)
- Evidence survives container crashes (agent buffers before container terminates)

### Log routing workflow (3 stages)
1. **Log collection and forwarding** — agent reads and ships logs off-node
2. **Log aggregation** — logs from all nodes combined in one store
3. **Log analysis** — search, filter, visualise (e.g. OpenSearch Dashboards)

---

## Log Routing: Fluent Bit → Destinations

### What is Fluent Bit?
- Lightweight, high-performance log forwarder
- Deployed as a **DaemonSet** — one pod per EC2 node
- Tails log files, parses, buffers, routes to output plugins

### Fluent Bit destinations
| Destination | Use case |
|---|---|
| Amazon OpenSearch | Full-text search + Dashboards UI |
| Amazon S3 | Long-term archival, Athena queries |
| CloudWatch Logs | AWS-native alerting, Logs Insights |
| Kinesis Data Firehose | High-throughput streaming; bridges to S3/OpenSearch/Redshift |

---

## Fargate Log Routing Setup

Fargate has no nodes → no DaemonSets. Instead: configure a namespace + ConfigMap.

### Step 1 — Create the namespace
```yaml
kind: Namespace
metadata:
  name: aws-observability
  labels:
    aws-observability: enabled
```

### Step 2 — Create the ConfigMap
```yaml
kind: ConfigMap
metadata:
  name: aws-logging
  namespace: aws-observability
data:
  output.conf: |
    [OUTPUT]
    Name  data_firehose
    Match *
    region us-west-2
    delivery_stream my-stream-firehose
```

**Key facts to memorise:**
- Namespace name: `aws-observability`
- Namespace label: `aws-observability: enabled`
- ConfigMap name: `aws-logging`
- Config key: `output.conf`
- Firehose plugin name: `data_firehose`

---

## Application Tracing: ADOT + X-Ray

### Why tracing is needed
Traditional debugging (single-service logs) does not scale in microservices — a request may touch dozens of services. You cannot tell which service is slow from logs alone.

### What tracing provides
1. **Service discovery** — automatically maps services and their connections
2. **Individual operation insights** — latency per operation within a service
3. **Service-isolated issues** — pinpoint exactly which service is the bottleneck
4. **Root-cause analysis** — trace errors back to origin across the call chain

### AWS Distro for OpenTelemetry (ADOT)
- AWS distribution of the OpenTelemetry Collector
- Runs as a sidecar or DaemonSet
- Collects **trace spans** (and metrics) from instrumented apps
- Forwards to AWS X-Ray (and optionally other backends)
- Uses vendor-neutral OpenTelemetry SDKs

### AWS X-Ray
- Receives spans forwarded by ADOT
- Shows: **service map** (visual graph), **trace timeline** (Gantt per segment), **error rates** per service
- Latency per segment makes bottlenecks immediately visible

### Pattern summary
```
Instrumented app → ADOT collector → AWS X-Ray
```

---

## Observability Tooling Summary

| Pillar | Collect | Store / Visualise |
|---|---|---|
| Metrics | Prometheus | Prometheus DB + Grafana |
| Metrics (AWS-native) | CloudWatch Container Insights agent | CloudWatch + Alarms |
| Logs (EC2) | Fluent Bit DaemonSet | OpenSearch / S3 / CloudWatch / Kinesis |
| Logs (Fargate) | aws-observability ConfigMap | Kinesis Firehose / S3 / CloudWatch |
| Traces | ADOT (OpenTelemetry) | AWS X-Ray |

---

## Quick-Fire Recall — 8 Q&A

**Q1: What is the Prometheus metric text format?**
`metric_name{"tag"="value"} value`

**Q2: What kubectl command exposes control plane metrics?**
`kubectl get --raw /metrics`

**Q3: What DaemonSet tool forwards container logs off-node?**
Fluent Bit

**Q4: What namespace is required for Fargate log routing?**
`aws-observability` (labelled `aws-observability: enabled`)

**Q5: Name the 5 EKS control plane log types.**
API server, Audit, Authenticator, Controller manager, Scheduler

**Q6: What does ADOT stand for?**
AWS Distro for OpenTelemetry

**Q7: Which tool visualises trace timelines and service maps?**
AWS X-Ray

**Q8: CloudWatch Container Insights aggregates at which 5 levels?**
Cluster → Node → Pod → Task → Service

---

## Lab 4 Preview

Lab 4 tasks on a running EKS cluster:

1. Deploy **Fluent Bit DaemonSet** on EC2 nodes
2. Route logs: Fluent Bit → **Kinesis Data Firehose** → **Amazon S3**
3. Configure **Amazon OpenSearch** for log search and Dashboards
4. Deploy **Prometheus + Grafana** for cluster metrics
5. Verify metrics with PromQL queries in Grafana

# Module 06 — Managing Networking in Amazon EKS
## Study Notes

---

## Big Idea

**Amazon VPC CNI = pods get real VPC IP addresses.**
No overlay network. No encapsulation. No tunnelling.
The same IP address that is visible *inside the pod* is the IP address other VPC resources use to reach it.
This is the fundamental difference from overlay CNIs (Flannel, Calico in encapsulation mode).

---

## Three Communication Paths in EKS

| Communication type | Scope | Mechanism |
|---|---|---|
| Container-to-container | Within the same pod | Shared network namespace — use `localhost` |
| Pod-to-pod (intrahost) | Same node, different pods | **Linux veth pairs** — connected via node network bridge |
| Pod-to-pod (interhost) | Different nodes | **Amazon VPC CNI** — real VPC IPs, native VPC routing |
| External-to-cluster | Internet or VPC → cluster | **LoadBalancer service** (NLB/ALB) |

Key distinction: intrahost = veth; interhost = VPC CNI.

---

## Network Policies

### Default behaviour
All pods can reach all other pods (and egress freely) with no NetworkPolicies applied.

### Default deny pattern
```yaml
kind: NetworkPolicy
spec:
  podSelector: {}       # matches ALL pods in namespace
  policyTypes:
    - Ingress
    - Egress
  # no rules = deny all
```

### Allow specific traffic (nginx → webapp only)
```yaml
spec:
  podSelector:
    matchLabels:
      app: webapp       # policy applies to webapp pods
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: nginx  # only nginx pods may send ingress
```

### Key rules
- NetworkPolicies are **namespace-scoped**
- CNI plugin must support enforcement (VPC CNI via Network Policy Controller add-on)
- An empty `podSelector: {}` matches ALL pods in the namespace
- Cross-namespace traffic requires `namespaceSelector` in the rule

---

## Four Kubernetes Service Types

| Type | Scope | AWS resource | When to use |
|---|---|---|---|
| **ClusterIP** (default) | Cluster-internal only | None | Internal microservice communication |
| **NodePort** | External via NodeIP:Port (30000–32767) | None | Dev/test; custom LB in front |
| **LoadBalancer** | External via AWS LB | NLB or ALB | Production external exposure |
| **ExternalName** | External DNS name via CNAME | None | Map K8s service to external DB/API |

**Wrapping hierarchy:** LoadBalancer wraps NodePort wraps ClusterIP.

---

## LoadBalancer: Instance Mode vs IP Mode

| Mode | Traffic path | kube-proxy involved? |
|---|---|---|
| **Instance mode** | NLB → Node port → kube-proxy → Pod | Yes |
| **IP mode** | NLB → Pod IP directly | No (bypassed) |

IP mode requires VPC CNI (pods need real VPC IPs). Reduces latency by removing one hop.

Annotation to set: `service.beta.kubernetes.io/aws-load-balancer-nlb-target-type: ip`

---

## Ingress and AWS Load Balancer Controller

### What Ingress is
A Kubernetes API object (not a service type) that provides **a single entry point for multiple backend services** using path-based or host-based routing.

- Requires an **Ingress Controller** to do anything — the controller watches Ingress objects and configures the real load balancer.
- In EKS, the **AWS Load Balancer Controller (AWS LBC)** is the standard Ingress Controller.

### AWS LBC creates
- **ALB** for Ingress resources
- **NLB** for LoadBalancer services

### Trigger annotation
```yaml
spec:
  ingressClassName: alb   # tells AWS LBC to own this Ingress
```

Or the older: `kubernetes.io/ingress.class: "alb"`

### Path routing example
```
/webapp1  →  webapp1-service:32003
/webapp2  →  webapp2-service:32004
```

---

## DNS 3-Layer Table

| Layer | Resolver | Handles | Example query |
|---|---|---|---|
| 1 | **CoreDNS** (EKS add-on, kube-system) | Resources *inside* the EKS cluster | `backend.prod.svc.cluster.local` |
| 2 | **Route 53 VPC Resolver** (169.254.169.253) | Resources *inside the VPC*, outside the cluster | RDS endpoint, EC2 hostname |
| 3 | **Upstream DNS** | Resources *outside the VPC* | `api.stripe.com`, public hostnames |

Service DNS format: `<service>.<namespace>.svc.cluster.local`
Within same namespace, pods can use just `<service>`.

CoreDNS forwards unresolved queries (anything not `cluster.local`) to the VPC Resolver, which either answers or recurses to the internet.

---

## Quick-fire Recall — 10 Q&A

1. **What does VPC CNI give each pod?** — A real VPC IP address (no overlay). Same IP inside pod as on VPC network.

2. **Intrahost pod-to-pod mechanism?** — Linux Virtual Ethernet Device (veth) pairs via node bridge.

3. **Interhost pod-to-pod mechanism?** — Amazon VPC CNI plugin, native VPC routing.

4. **Which service type is internal-only?** — ClusterIP.

5. **NodePort range?** — 30000–32767.

6. **What does LoadBalancer wrap?** — NodePort (which wraps ClusterIP). Traffic: LB → NodePort → kube-proxy → Pod.

7. **ExternalName mechanism?** — CNAME DNS record. No proxying. No ClusterIP.

8. **AWS LBC creates what for Ingress?** — ALB. For LoadBalancer services: NLB.

9. **Default deny NetworkPolicy selector?** — `podSelector: {}` with `policyTypes: [Ingress, Egress]` and no rules.

10. **Three DNS layers in order?** — CoreDNS (cluster) → Route 53 VPC Resolver (VPC) → Upstream DNS (internet).

---

## No standalone lab in this module.

Knowledge checks: KC1 answer = D (NodePort + LoadBalancer both externally accessible). KC2 answer = D (VPC CNI gives pods real VPC IPs, no overlay).

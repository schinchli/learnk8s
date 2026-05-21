# Lab 1: Deploying Kubernetes Pods on Amazon EKS

A guided walkthrough for learning Kubernetes Pods, Deployments, Services, Namespaces, and Probes on Amazon EKS.

## What you will build

A 3-tier microservice application called **Product Catalog** running on EKS:

```
                          ┌────────────────────────┐
   User browser ─────────►│  Service: frontend     │  type: LoadBalancer
                          │  (exposed via AWS ELB) │
                          └──────────┬─────────────┘
                                     │ port 80
                          ┌──────────▼─────────────┐
                          │  Pod: frontend         │  Node.js + EJS
                          │  (renders UI)          │
                          └──────────┬─────────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  │                                     │
        ┌─────────▼─────────┐               ┌───────────▼───────────┐
        │ Service:          │               │ Service:              │
        │ prodcatalog       │               │ proddetail            │
        │ (ClusterIP :5000) │               │ (ClusterIP :3000)     │
        └─────────┬─────────┘               └───────────┬───────────┘
                  │                                     │
        ┌─────────▼─────────┐               ┌───────────▼───────────┐
        │ Pod: prodcatalog  │               │ Pod: proddetail       │
        │ Python Flask API  │               │ Node.js (vendor info) │
        └───────────────────┘               └───────────────────────┘

         All running inside namespace: `workshop`
```

## Lab flow (the 5 tasks)

| #  | Task                             | What you learn                                              |
|----|----------------------------------|-------------------------------------------------------------|
| 1  | Connect to Code Editor IDE       | Browser-based VS Code, terminal access                      |
| 2  | Deploy a Kubernetes app          | `kubectl apply`, Deployment + Service manifests, Namespaces |
| 3  | Explore resources                | `kubectl describe`, `kubectl exec`, pod internals           |
| 4  | Liveness & readiness probes      | Self-healing pods, traffic gating, fault injection          |
| 5  | Delete the application           | Namespace-scoped cleanup                                    |

## How to use this folder

```
lab-1-deploying-pods/
├── README.md                  ← you are here
├── notes/
│   ├── 01-concepts.md         ← Kubernetes vocab you need first
│   ├── 02-task2-deploy.md     ← Task 2 walkthrough w/ diagrams
│   ├── 03-task3-explore.md    ← Task 3 walkthrough w/ diagrams
│   ├── 04-task4-probes.md     ← Task 4 walkthrough w/ diagrams
│   └── 05-task5-cleanup.md    ← Task 5 walkthrough
├── manifests/
│   ├── proddetail-deployment.yaml
│   ├── proddetail-service.yaml
│   └── detail_deployment_with_probes.yaml
└── cloudformation/
    └── lab-1-template.yaml    ← infra-as-code that builds the lab
```

**Recommended order:**
1. Read `notes/01-concepts.md` first (15 min) — locks in the vocabulary.
2. Walk through Tasks 2 → 5 in order. Each note file contains the exact commands plus a diagram of what each command does.
3. Use the files in `manifests/` as the canonical YAML — copy/paste from there.

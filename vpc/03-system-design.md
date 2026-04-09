# VPC — System Design Interview

---

## Full Architecture Visual

```
YOUR VPC (10.0.0.0/16)
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────────────────┐  ┌──────────────────────┐    │
│  │   PUBLIC SUBNET       │  │   PRIVATE SUBNET      │   │
│  │   10.0.1.0/24         │  │   10.0.2.0/24         │   │
│  │                       │  │                       │   │
│  │  ┌────────────────┐   │  │  ┌────────────────┐   │   │
│  │  │  EC2 (Web/API) │   │  │  │  EC2 (Backend) │   │   │
│  │  │  Public IP ✓   │   │  │  │  No Public IP  │   │   │
│  │  └────────────────┘   │  │  └────────────────┘   │   │
│  │                       │  │                       │   │
│  │  ┌────────────────┐   │  │  ┌────────────────┐   │   │
│  │  │  Load Balancer │   │  │  │  RDS Database  │   │   │
│  │  └────────────────┘   │  │  └────────────────┘   │   │
│  └──────────────────────┘  └──────────────────────┘    │
│                                                         │
│         Public Route Table       Private Route Table    │
│         0.0.0.0/0 → IGW          local only             │
└─────────────────────────────────────────────────────────┘
                     │
             ┌───────────────┐
             │ Internet      │
             │ Gateway (IGW) │
             └───────────────┘
                     │
                  INTERNET
```

---

## Scenario: Secure Node.js API + PostgreSQL DB

**Interview question:** *"Your Node.js API connects to a PostgreSQL DB. How do you secure this on AWS?"*

### Architecture Answer

```
Internet
    │
[Internet Gateway]
    │
[Public Subnet]
    ├── ALB (Load Balancer)  ← receives HTTPS on 443
    └── Bastion EC2          ← SSH jump-box (My IP only)

[Private Subnet]
    ├── Node.js EC2          ← SG: port 3000 from ALB SG only
    └── RDS PostgreSQL       ← SG: port 5432 from Node.js SG only
```

### Security Group Chain (what interviewers want to hear)

```
ALB Security Group:
  Inbound:  443 from 0.0.0.0/0

Node.js EC2 Security Group:
  Inbound:  3000 from ALB-SG         ← reference SG, not IP
  Outbound: 5432 to RDS-SG

RDS Security Group:
  Inbound:  5432 from NodeJS-SG      ← only your app can reach DB
  Outbound: (none needed — stateful)
```

### Why this is secure
- DB has no public IP — internet cannot route to it physically
- Even if ALB is compromised, attacker can't reach DB directly
- SG referencing SGs = no hardcoded IPs, works even after EC2 restarts

---

## Tracing a Request Through the VPC

```
User browser
   ↓  HTTPS request
Internet
   ↓
Internet Gateway (IGW)
   ↓
Public Subnet Route Table (0.0.0.0/0 → IGW)
   ↓
ALB — SG checks port 443 ✓
   ↓
Private Subnet
   ↓
Node.js EC2 — SG checks port 3000, source = ALB SG ✓
   ↓  DB query via private IP (no internet hop)
RDS — SG checks port 5432, source = EC2 SG ✓
   ↓
Response travels back the same path
```

---

## Production VPC Design (3-Tier)

```
Internet
    │
[IGW]
    │
PUBLIC SUBNET
    ├── ALB
    └── NAT Gateway (for private → internet outbound)

APPLICATION SUBNET (private)
    └── EC2 / ECS / Lambda (Node.js API)

DATA SUBNET (private)
    ├── RDS Primary (AZ-1)
    └── RDS Replica (AZ-2)      ← multi-AZ for HA
```

Rules:
- 3 separate subnet tiers
- ALB is the only thing internet touches
- App subnet can call internet via NAT (package installs, external APIs)
- Data subnet has zero outbound internet route

---

## Security Group Chaining Pattern

```
[Internet] → [ALB SG] → [App SG] → [DB SG]
               443          3000       5432

Each layer only trusts the SG above it — not the internet.
```

This is the pattern you mention in every system design interview involving AWS.

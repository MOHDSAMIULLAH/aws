# Phase 1 — Topic 4: VPC (Virtual Private Cloud)

---

## What is VPC Internally?

A VPC is your **own private network inside AWS** — like having a dedicated section of the AWS data center that only you control.

```
AWS Cloud
└── Your VPC (10.0.0.0/16) — your isolated network
    ├── Public Subnet (10.0.1.0/24)   ← EC2, Load Balancers (internet-facing)
    │     └── Internet Gateway ──→ Internet
    ├── Private Subnet (10.0.2.0/24)  ← RDS, ElastiCache (no direct internet)
    │     └── NAT Gateway ──→ Internet (outbound only)
    └── Route Tables, Security Groups, NACLs
```

**Without VPC thinking:** Anyone can potentially reach your DB.
**With VPC:** Your DB sits in a private subnet — not reachable from the internet at all.

---

## Core Concepts

| Term | What it means |
|---|---|
| VPC | Your private network in AWS (you define the IP range) |
| Subnet | A subdivision of the VPC in one AZ (public or private) |
| Internet Gateway (IGW) | Allows public subnet resources to reach the internet |
| NAT Gateway | Allows private subnet resources to reach internet (outbound only) |
| Route Table | Rules that decide where network traffic goes |
| Security Group | Stateful firewall at the instance level |
| NACL | Stateless firewall at the subnet level |
| CIDR Block | IP range notation e.g. `10.0.0.0/16` = 65,536 IPs |

---

## CIDR Quick Reference

```
10.0.0.0/16  →  65,536 IPs  (entire VPC)
10.0.1.0/24  →     256 IPs  (one subnet)
10.0.2.0/24  →     256 IPs  (another subnet)
```

Rule: VPC gets a large block → subnets get smaller slices of it.

---

## Real Architecture: Node.js + RDS in VPC

```
Internet
   ↓
Internet Gateway
   ↓
Public Subnet (10.0.1.0/24)  [ap-south-1a]
   ├── EC2 (Node.js API)  ← Security Group: allow 80, 443, 22
   └── ALB (Load Balancer)

Private Subnet (10.0.2.0/24)  [ap-south-1b]
   └── RDS PostgreSQL  ← Security Group: allow 5432 from EC2 only
                                          NO internet access
```

The DB is in a private subnet — it literally cannot be reached from the internet. EC2 talks to it via private IP inside the VPC.

---

## Security Group vs NACL

| | Security Group | NACL |
|---|---|---|
| Level | Instance | Subnet |
| State | Stateful | Stateless |
| Rules | Allow only | Allow + Deny |
| Default | Deny all inbound | Allow all |
| Use case | Per-instance firewall | Subnet-wide rules |

**Stateful (SG):** Allow inbound port 80 → response automatically allowed outbound.
**Stateless (NACL):** Must explicitly allow both inbound AND outbound.

---

## 2. Hands-On Steps

### Step 1: Create a Custom VPC

1. AWS Console → **VPC** → **Create VPC**
2. Select: **VPC and more** (creates subnets + route tables automatically)
3. Name: `zeenat-vpc`
4. IPv4 CIDR: `10.0.0.0/16`
5. Availability zones: 2
6. Public subnets: 2
7. Private subnets: 2
8. NAT Gateway: **None** (costs money — skip for now)
9. Click **Create VPC**

> AWS will auto-create: 2 public subnets, 2 private subnets, route tables, IGW.

---

### Step 2: Verify What Was Created

Go to VPC dashboard and confirm:

```
VPC:              zeenat-vpc (10.0.0.0/16)
Public Subnet 1:  10.0.0.0/20  — ap-south-1a
Public Subnet 2:  10.0.16.0/20 — ap-south-1b
Private Subnet 1: 10.0.128.0/20 — ap-south-1a
Private Subnet 2: 10.0.144.0/20 — ap-south-1b
Internet Gateway: attached to zeenat-vpc
Route Table (public): 0.0.0.0/0 → IGW
Route Table (private): local only
```

---

### Step 3: Launch EC2 in Your Custom VPC

1. EC2 → Launch Instance → `zeenat-node-server`
2. **Network settings** → Edit
3. VPC: select `zeenat-vpc`
4. Subnet: select a **public subnet**
5. Auto-assign public IP: **Enable**
6. Security group: create new
   - SSH port 22 → My IP
   - HTTP port 80 → Anywhere
7. Launch

---

### Step 4: Create Security Group for RDS (Private)

1. VPC → **Security Groups** → Create security group
2. Name: `zeenat-rds-sg`
3. VPC: `zeenat-vpc`
4. Inbound rules:
   - Type: PostgreSQL — Port: `5432`
   - Source: select `zeenat-ec2-sg` (the EC2 security group)
5. Save

> This means RDS only accepts connections from your EC2 instance — nothing else.

---

### Step 5: Understand Route Tables

1. VPC → **Route Tables**
2. Click the public route table → **Routes** tab:

```
Destination     Target
10.0.0.0/16    local         ← internal VPC traffic
0.0.0.0/0      igw-xxxxxx    ← all other traffic → internet
```

3. Click the private route table → **Routes** tab:

```
Destination     Target
10.0.0.0/16    local         ← internal only, NO internet route
```

This is why private subnet resources can't be reached from internet.

---

## 3. Hands-On Problems

### Problem 1 — Fix Broken EC2 Connectivity
**Scenario:** You launched EC2 in your VPC but can't SSH in. Diagnose:

```
Checklist:
[ ] Is the instance in a PUBLIC subnet?
[ ] Is "Auto-assign public IP" enabled?
[ ] Is Internet Gateway attached to the VPC?
[ ] Does the public route table have 0.0.0.0/0 → IGW?
[ ] Is port 22 open in the Security Group (for your IP)?
[ ] Is the subnet associated with the public route table?
```

### Problem 2 — Restrict RDS to EC2 Only
**Goal:** RDS should only accept traffic from the EC2 security group.

```
EC2 Security Group (zeenat-ec2-sg)
  Inbound: 22 (My IP), 80 (Anywhere)

RDS Security Group (zeenat-rds-sg)
  Inbound: 5432 — Source: zeenat-ec2-sg  ← references SG, not IP
```

This is **security group chaining** — even if EC2's IP changes, the rule still works.

### Problem 3 — Trace a Request Through the VPC

```
User browser
   ↓ HTTP request
Internet
   ↓
Internet Gateway (IGW)
   ↓
Public Subnet Route Table (0.0.0.0/0 → IGW)
   ↓
EC2 Instance — Security Group checks port 80 ✓
   ↓
Node.js (port 3000) via Nginx
   ↓ DB query via private IP
Private Subnet
   ↓
RDS — Security Group checks port 5432, source = EC2 SG ✓
   ↓ response travels back the same path
```

---

## 4. Mini Project — Secure 2-Tier VPC Architecture

**Goal:** EC2 in public subnet, RDS in private subnet, locked down correctly.

```
zeenat-vpc (10.0.0.0/16)
├── Public Subnet
│   └── EC2 (Node API) — SG: 80/443 open, 22 My IP only
└── Private Subnet
    └── RDS Postgres — SG: 5432 from EC2 SG only
```

Steps:
1. Create VPC with public + private subnets (Step 1)
2. Launch EC2 in public subnet (Step 3)
3. Create RDS security group (Step 4)
4. Launch RDS in private subnet (Phase 2 topic — but architecture is set)
5. Verify EC2 can ping private subnet IP, internet cannot

---

## 5. Interview Questions & Answers

### Q1: What's the difference between a public and private subnet?

- **Public subnet**: has a route to an Internet Gateway (`0.0.0.0/0 → IGW`) — resources can be reached from internet if they have a public IP
- **Private subnet**: NO route to IGW — resources are completely unreachable from internet
- Same VPC, same CIDR range — the only difference is the **route table**

### Q2: EC2 in private subnet needs to download packages — how?
Use a **NAT Gateway** in a public subnet:
```
Private EC2 → NAT Gateway (public subnet) → IGW → Internet
```
NAT allows outbound only — internet cannot initiate connections back.
Cost: ~$0.045/hour + data transfer. Don't leave it running unnecessarily.

### Q3: Security Group vs NACL — which do you use when?
- **Security Group** for everything (instance-level, stateful, easy to manage)
- **NACL** as an extra layer for subnet-wide explicit DENY rules
- Example: block a known malicious IP range at subnet level with NACL

### Q4: Your app can connect to RDS from EC2 but not from your laptop — why?
RDS is in a **private subnet**. It has no public IP and no internet route. Only resources inside the same VPC (like your EC2) can reach it. This is correct behavior — your DB should never be reachable from the internet.

### Q5: What is VPC Peering?
Connects two VPCs so they can communicate using private IPs — even across accounts or regions. Like merging two private networks. Traffic never leaves AWS network.

---

## 6. Mistakes to Avoid

| Mistake | Why Dangerous | Fix |
|---|---|---|
| Putting RDS in public subnet | DB exposed to internet | Always use private subnet for DB |
| Security group allows `0.0.0.0/0` on port 5432 | DB open to world | Source = EC2 security group only |
| Using default VPC in production | Shared, not customized, hard to audit | Create dedicated VPC per environment |
| No subnet separation | Can't isolate tiers | Public for web, private for data |
| Leaving NAT Gateway running idle | Costs ~$33/month | Delete when not needed |
| Opening all ports in SG (`0-65535`) | Massive attack surface | Open only required ports |

---

## Key Rules (Senior Engineer Mindset)

- Public subnet = internet-facing only (EC2, ALB, NAT GW)
- Private subnet = databases, caches, internal services
- Security Groups are your primary tool — use them at every layer
- Reference SGs in other SGs (chaining) — don't use hardcoded IPs
- One VPC per environment (dev/staging/prod) — never share
- Always use at least 2 AZs for high availability

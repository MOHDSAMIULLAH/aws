# VPC — Core Concepts

---

## What is a VPC?

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

## Core Terms

| Term | What it means |
|---|---|
| VPC | Your private network in AWS (you define the IP range) |
| Subnet | A subdivision of the VPC in one AZ (public or private) |
| Internet Gateway (IGW) | Allows public subnet resources to reach the internet |
| NAT Gateway | Allows private subnet resources to reach internet (outbound only) |
| Route Table | Rules that decide where network traffic goes |
| Security Group | Stateful firewall at the instance level |
| NACL | Stateless firewall at the subnet level |
| CIDR Block | IP range notation — `10.0.0.0/16` = 65,536 IPs |
| Bastion Host | Jump-box EC2 in public subnet to SSH into private instances |
| VPC Peering | Connects two VPCs so they communicate via private IPs |

---

## CIDR Quick Reference

```
10.0.0.0/16  →  65,536 IPs  (entire VPC)
10.0.1.0/24  →     256 IPs  (one subnet)
10.0.2.0/24  →     256 IPs  (another subnet)
```

Rule: VPC gets a large block → subnets get smaller slices of it.

---

## Public vs Private Subnet — the only real difference

```
Public Subnet Route Table:
  Destination     Target
  10.0.0.0/16    local         ← internal VPC traffic
  0.0.0.0/0      igw-xxxxxx    ← all other traffic → internet  ✓

Private Subnet Route Table:
  Destination     Target
  10.0.0.0/16    local         ← internal only, NO internet route  ✗
```

Both subnets are inside the same VPC. The **route table** is the only thing that makes one public and one private.

---

## Security Group vs NACL

| Feature | Security Group | NACL |
|---|---|---|
| Level | **Instance** level | **Subnet** level |
| State | **Stateful** | **Stateless** |
| Rules | Allow only | Allow + Deny |
| Return traffic | Auto-allowed | Must explicitly allow |
| Default | Deny all inbound | Allow all |
| Use case | Per-instance firewall | Subnet-wide rules |

### Stateful vs Stateless — key interview point

```
SECURITY GROUP (stateful):
  You allow inbound port 80 →
  Response traffic is automatically allowed outbound ✓

NACL (stateless):
  You allow inbound port 80 →
  You MUST also add outbound rule for ephemeral ports (1024-65535)
  or the response is blocked ✗
```

---

## NAT Gateway — when you need it

Private subnet EC2 needs to reach the internet (e.g., `apt install`, external API call) but you don't want internet to reach it.

```
Private EC2 → NAT Gateway (public subnet) → IGW → Internet
                    ↑
           outbound only — internet cannot initiate connections back
```

Cost: ~$0.045/hour + data transfer. Delete when not needed (~$33/month if left running).

---

## Key Rules (Senior Engineer Mindset)

- Public subnet = internet-facing only (EC2, ALB, NAT GW)
- Private subnet = databases, caches, internal services
- Security Groups are your primary tool — use them at every layer
- Reference SGs in other SGs (chaining) — don't use hardcoded IPs
- One VPC per environment (dev/staging/prod) — never share
- Always use at least 2 AZs for high availability

# VPC — Interview Q&A

---

## Core Concept Questions

### Q: What is a VPC and why does it exist?
A VPC is your private, isolated network inside AWS. Without it, all your resources would be on a flat shared network. VPC gives you full control over IP ranges, routing, and who can reach what.

---

### Q: What is the difference between a public and private subnet?
- **Public subnet**: has a route `0.0.0.0/0 → IGW` in its route table — resources with a public IP are internet-reachable
- **Private subnet**: NO route to IGW — resources are completely unreachable from the internet
- Same VPC, same physical hardware — the **route table is the only difference**

---

### Q: Can two resources in the same VPC but different subnets talk to each other?
Yes. VPCs have a default `local` route that allows all internal traffic. Security Groups control what's actually allowed between them.

---

### Q: What makes an EC2 instance publicly accessible?
Three things must all be true:
1. Instance is in a **public subnet** (subnet has route to IGW)
2. Instance has a **public IP** (auto-assign enabled)
3. **Security Group** allows inbound traffic on the required port

Missing any one = not accessible.

---

## Security Questions

### Q: Security Group vs NACL — which do you use and when?
- **Security Group** for everything as your primary control (stateful, instance-level, easy)
- **NACL** as an extra layer for explicit subnet-wide DENY rules
- Example: block a known malicious IP range at subnet level with NACL deny rule

---

### Q: What does "stateful" mean for Security Groups?
If you allow inbound port 80, the response traffic is automatically allowed outbound. You don't need a separate outbound rule for the response. NACLs are stateless — you must explicitly allow both directions.

---

### Q: How do you allow EC2 to connect to RDS without exposing RDS to the internet?
Use **Security Group referencing**:
```
RDS Security Group:
  Inbound: 5432 from [EC2-Security-Group]   ← not 0.0.0.0/0
```
RDS stays in private subnet (no public IP, no IGW route). Only resources with the EC2 SG attached can reach it.

---

### Q: Your app can connect to RDS from EC2 but not from your laptop — why is this correct?
RDS is in a **private subnet**. It has no public IP and no internet route. Only resources inside the same VPC (like your EC2) can reach it via private IP. This is the correct, secure architecture. Your DB should **never** be reachable from the internet.

---

## Networking Questions

### Q: EC2 in private subnet needs to download packages — how?
Use a **NAT Gateway** in the public subnet:
```
Private EC2 → NAT Gateway (public subnet) → IGW → Internet
```
NAT allows outbound only — internet cannot initiate connections back.  
Cost: ~$0.045/hour + data transfer. Delete when not needed.

---

### Q: What is a Bastion Host?
A jump-box EC2 in the public subnet. You SSH into it first, then SSH from it into private subnet instances. Keeps private EC2s unreachable from the open internet.

```
Your laptop → SSH → Bastion (public) → SSH → Private EC2
```

---

### Q: What is VPC Peering?
Connects two VPCs so they communicate via private IPs — even across accounts or regions. Traffic never leaves the AWS network. Useful for multi-account architectures (e.g., separate dev/prod VPCs that need to share a service).

---

### Q: What is the difference between an Internet Gateway and a NAT Gateway?

| | Internet Gateway | NAT Gateway |
|---|---|---|
| Direction | Inbound + Outbound | Outbound only |
| Used by | Public subnet resources | Private subnet resources |
| Public IP needed | Yes (on the instance) | No (NAT has its own) |
| Cost | Free | ~$0.045/hr + data |

---

## Architecture / Design Questions

### Q: How would you design a secure 2-tier app on AWS?

```
Public Subnet:
  └── ALB (Load Balancer) — port 443 open to internet

Private Subnet:
  ├── EC2 (Node.js API) — port 3000 from ALB SG only
  └── RDS (PostgreSQL)  — port 5432 from EC2 SG only
```

Key points to mention:
- Security Group chaining (each layer only trusts the layer above)
- RDS in private subnet — no public IP
- ALB is the only internet entry point

---

### Q: How do you handle high availability in a VPC?
- Deploy subnets across **at least 2 Availability Zones**
- Use **ALB** (spans multiple AZs automatically)
- Use **RDS Multi-AZ** (standby replica in different AZ)
- Use **Auto Scaling Group** across multiple AZs for EC2

---

## Common Mistakes to Avoid

| Mistake | Why Dangerous | Fix |
|---|---|---|
| Putting RDS in public subnet | DB exposed to internet | Always use private subnet for DB |
| SG allows `0.0.0.0/0` on port 5432 | DB open to world | Source = EC2 SG only |
| Using default VPC in production | Shared config, hard to audit | Create dedicated VPC per environment |
| No subnet separation | Can't isolate tiers | Public for web, private for data |
| Leaving NAT Gateway running idle | ~$33/month wasted | Delete when not needed |
| Opening all ports in SG (`0-65535`) | Massive attack surface | Open only required ports |
| Not associating subnet with route table | Subnet has no routing | Explicitly associate public subnets |

---

## Quick-Fire Answers (30 seconds each)

**What's the default VPC?**  
AWS creates one per region automatically. Fine for learning, not for production.

**Can a subnet span multiple AZs?**  
No. One subnet = one AZ. For multi-AZ, create one subnet per AZ.

**Can you have multiple security groups on one EC2?**  
Yes. All SGs are evaluated together — union of all allow rules.

**What happens if you delete the IGW while EC2 is running?**  
EC2 loses internet access immediately. Still running, just unreachable.

**CIDR `10.0.0.0/16` vs `10.0.0.0/24` — which is bigger?**  
`/16` is bigger — 65,536 IPs vs 256 IPs. Smaller number = more IPs.

# VPC — Study Folder Index

| File | Content |
|---|---|
| `01-concepts.md` | What is VPC, subnets, IGW, NAT, CIDR, core terms |
| `02-hands-on.md` | Step-by-step: create VPC, subnets, EC2, security groups |
| `03-system-design.md` | Visual architecture, SG vs NACL, secure 2-tier design |
| `04-interview-qa.md` | All interview Q&A, scenarios, mistakes to avoid |

---

## Quick Summary

```
VPC = your private network in AWS

Public Subnet  → route to Internet Gateway → internet reachable
Private Subnet → no IGW route             → internet cannot reach

Security Group → stateful  → instance level
NACL           → stateless → subnet level

Golden rule: Web tier = public subnet. DB tier = private subnet.
```

---

## Phase Status
- [x] Concepts read
- [x] Hands-on steps done
- [x] System design interview prep done
- [ ] Hands-on lab: build 2-tier VPC with EC2 + RDS

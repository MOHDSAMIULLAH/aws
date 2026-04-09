# VPC — Hands-On Steps

---

## Step 1: Create a Custom VPC

1. AWS Console → **VPC** → **Create VPC**
2. Select: **VPC and more** (auto-creates subnets + route tables)
3. Settings:
   ```
   Name:               my-app-vpc
   IPv4 CIDR:          10.0.0.0/16
   Availability zones: 2
   Public subnets:     2
   Private subnets:    2
   NAT Gateway:        None  ← costs money, skip for now
   ```
4. Click **Create VPC**

> AWS auto-creates: 2 public subnets, 2 private subnets, route tables, IGW.

---

## Step 2: Verify What Was Created

Go to VPC dashboard and confirm:

```
VPC:              my-app-vpc (10.0.0.0/16)
Public Subnet 1:  10.0.0.0/20  — us-east-1a
Public Subnet 2:  10.0.16.0/20 — us-east-1b
Private Subnet 1: 10.0.128.0/20 — us-east-1a
Private Subnet 2: 10.0.144.0/20 — us-east-1b
Internet Gateway: attached to my-app-vpc
Route Table (public):  0.0.0.0/0 → IGW
Route Table (private): local only
```

---

## Step 3: Launch EC2 in Public Subnet

1. EC2 → **Launch Instance**
2. Name: `my-node-server`
3. **Network settings** → Edit:
   ```
   VPC:                  my-app-vpc
   Subnet:               public-subnet-1a      ← public!
   Auto-assign public IP: Enable               ← critical
   ```
4. Security group (create new):
   ```
   Inbound rules:
     SSH   port 22  → My IP only
     HTTP  port 80  → Anywhere (0.0.0.0/0)
     HTTPS port 443 → Anywhere (0.0.0.0/0)
   Outbound:
     All traffic (default)
   ```
5. Launch with key pair

---

## Step 4: Create Security Group for RDS (Private)

1. VPC → **Security Groups** → Create security group
2. Settings:
   ```
   Name: my-rds-sg
   VPC:  my-app-vpc
   ```
3. Inbound rules:
   ```
   Type: PostgreSQL
   Port: 5432
   Source: my-ec2-sg   ← reference the EC2 security group (not 0.0.0.0/0!)
   ```
4. Save

> This means RDS only accepts connections from your EC2 — nothing else can reach it.

---

## Step 5: Inspect Route Tables

### Public Route Table
```
VPC → Route Tables → [public table] → Routes tab

Destination     Target
10.0.0.0/16    local         ← internal VPC traffic
0.0.0.0/0      igw-xxxxxx    ← all other traffic → internet
```

### Private Route Table
```
VPC → Route Tables → [private table] → Routes tab

Destination     Target
10.0.0.0/16    local         ← internal only, NO internet route
```

This is why private subnet resources are unreachable from the internet.

---

## Troubleshooting: Can't SSH into EC2

```
Checklist:
[ ] Is the instance in a PUBLIC subnet?
[ ] Is "Auto-assign public IP" enabled?
[ ] Is Internet Gateway attached to the VPC?
[ ] Does the public route table have 0.0.0.0/0 → IGW?
[ ] Is port 22 open in Security Group (for your IP)?
[ ] Is the subnet associated with the public route table?
```

---

## Mini Lab: Secure 2-Tier VPC

**Goal:** EC2 in public subnet, RDS in private subnet, locked down correctly.

```
my-app-vpc (10.0.0.0/16)
├── Public Subnet
│   └── EC2 (Node API) — SG: 80/443 open, 22 My IP only
└── Private Subnet
    └── RDS Postgres — SG: 5432 from EC2 SG only
```

Steps:
1. Create VPC (Step 1)
2. Launch EC2 in public subnet (Step 3)
3. Create RDS security group (Step 4)
4. Launch RDS → choose **private subnet** → attach `my-rds-sg`
5. Test: EC2 can connect to RDS via private IP. Your laptop cannot.

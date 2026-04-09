# Phase 1 — Topic 1: IAM (Identity & Access Management)

---

## 1. Concept

Think of AWS as a large office building:
- **Root account** = Building owner (master key, access everything)
- **IAM Users** = Employees with ID badges (limited access)
- **IAM Roles** = Temporary visitor passes (EC2, Lambda, etc. use these)
- **IAM Policies** = Rules printed on the badge ("can enter floors 2 and 3 only")

**Core question IAM answers:** Who is allowed to do what, on which AWS resource?

```json
// IAM Policy structure
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::my-bucket/*"
}
```

**Key insight:** EC2 apps should never use hardcoded keys — attach an IAM Role so the instance gets temporary credentials automatically.

---

## 2. Hands-On Steps

### Step 1: Secure Root Account
1. Console → account name → Security credentials
2. MFA → Assign MFA device → Authenticator app → scan QR
3. Enter two consecutive codes → Add MFA

### Step 2: Create Admin IAM User (`sam-admin`)
1. IAM → Users → Create userPostgreSQL | 5432 | sg-04ac423ed7434acb4 / launch-wizard-3
2. Username: `sam-admin`, enable console access
3. Attach policy: `AdministratorAccess`
4. Download the CSV (login URL + credentials)

### Step 3: Create Restricted User (`sam-ec2-dev`)
1. IAM → Users → Create user
2. Username: `sam-ec2-dev`
3. Attach policy: `AmazonEC2FullAccess`
4. Security credentials tab → Create access key → CLI → Download CSV

### Step 4: Create IAM Role for EC2 → S3
1. IAM → Roles → Create role
2. Trusted entity: AWS service → EC2
3. Attach policy: `AmazonS3ReadOnlyAccess`
4. Role name: `ec2-s3-readonly-role`

---

## 3. Mini Project — IAM Audit Simulation

**Goal:** Set up IAM for a startup so:
- Devs can access EC2 + S3 but cannot delete S3 buckets
- CI/CD bot has read-only ECR access

**Steps:**
1. Create group: `developers`
2. Attach `AmazonEC2FullAccess` + `AmazonS3FullAccess` to group
3. Create custom deny policy `deny-s3-delete`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "s3:DeleteBucket",
      "Resource": "*"
    }
  ]
}
```

4. Attach `deny-s3-delete` to the group
5. Add `sam-ec2-dev` to `developers` group

---

## 4. Interview Questions & Answers

### Q1: EC2 DynamoDB AccessDenied even with AmazonDynamoDBFullAccess role?
- Verify role is actually attached to the instance
- Check for permission boundaries overriding the policy
- Check if any explicit Deny exists in other attached policies (Deny always wins)
- Verify DynamoDB resource ARN in policy
- Use IAM Policy Simulator to test the exact permission

### Q2: Developer commits AWS keys to GitHub — immediate steps?
1. IAM → User → Security credentials → Deactivate the key immediately
2. Delete the key
3. Create a new key and rotate
4. Check CloudTrail logs for actions taken with compromised key
5. Check GuardDuty alerts for anomalous activity
6. Report per incident response process
7. Add git-secrets / truffleHog to pre-commit hooks

### Q3: IAM Role vs IAM User?
- **User** = permanent identity, long-term credentials (humans, legacy services)
- **Role** = temporary identity assumed by AWS services or cross-account access
- Use Role for: EC2, Lambda, CI/CD, cross-account
- Use User for: humans logging into console, systems that can't use roles

### Q4: Identity-based vs Resource-based policies?
- **Identity-based**: attached to User/Role/Group — "what can this identity do?"
- **Resource-based**: attached to the resource (S3 bucket policy, SQS policy) — "who can access me?"
- Cross-account S3 access requires both sides to allow (the handshake)

### Q5: Lambda in Account A accessing S3 in Account B?
- Account B: add bucket policy trusting Account A's Lambda ARN
- Account A: Lambda role must have permission for `s3:GetObject` on Account B's bucket
- Both sides must explicitly allow

---

## 5. Mistakes to Avoid

| Mistake | Why Dangerous | Fix |
|---|---|---|
| Using root account daily | One breach = total loss | IAM admin user + MFA root |
| Hardcoding access keys in code | Keys leak via GitHub | Use IAM Roles |
| Over-permissive policies (`*:*`) | Huge blast radius | Least privilege only |
| No MFA on privileged users | Easy account takeover | Enforce MFA via policy |
| Not rotating access keys | Old keys = attack surface | Rotate every 90 days |

---

## Key Rules (Senior Engineer Mindset)
- Never use root for daily work
- Always use IAM Roles for AWS services (not access keys)
- Explicit Deny always overrides Allow
- Least privilege — grant only what's needed
- Enable CloudTrail for audit logs

# CI/CD Pipeline — GitHub Actions + ECR + ECS

## What the pipeline does

```
Push to main
    │
    ▼
[Job 1: test]          Run app smoke test
    │
    ▼
[Job 2: build-push]    docker build → docker push → ECR
    │
    ▼
[Job 3: deploy-ecs]    Update ECS task definition → trigger rolling deploy
```

Each job only runs if the previous one passes. A failed test blocks the deploy.

---

## AWS setup — do this once

### 1. Create ECR repository

```bash
aws ecr create-repository \
  --repository-name docker-cicd-app \
  --region ap-south-1
```

Output includes your registry URI:
```
123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-cicd-app
```

### 2. Create IAM user for GitHub Actions

In AWS Console → IAM → Users → Create user: `github-actions-cicd`

Attach this inline policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

Create access keys for this user and copy them.

### 3. Create ECS cluster + task definition + service

```bash
# Create cluster
aws ecs create-cluster --cluster-name docker-cicd-cluster

# Create task definition (saves to AWS, returns ARN)
aws ecs register-task-definition --cli-input-json file://task-def-template.json
```

For a minimal Fargate task definition (`task-def-template.json`):
```json
{
  "family": "docker-cicd-app",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "docker-cicd-app",
      "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-cicd-app:latest",
      "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
      "essential": true,
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/docker-cicd-app",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

### 4. Add GitHub Secrets

Go to: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | From IAM user you created |
| `AWS_SECRET_ACCESS_KEY` | From IAM user you created |
| `AWS_REGION` | `us-east-1` |
| `ECR_REPOSITORY` | `docker-cicd-app` |
| `ECS_CLUSTER` | `docker-cicd-cluster` |
| `ECS_SERVICE` | `docker-cicd-service` |
| `ECS_TASK_DEF_ARN` | `docker-cicd-app` (the family name) |
| `CONTAINER_NAME` | `docker-cicd-app` |

---

## How the deploy works (rolling update)

```
Current state:  2 running containers with image :abc1234
Push to main:   GitHub Actions builds image :def5678

ECS rolling update:
  Step 1: Start new container with :def5678
          (health check must pass before proceeding)
  Step 2: Drain traffic from old :abc1234 container
  Step 3: Terminate old container
  Step 4: Repeat until all containers are on :def5678
```

Zero downtime — ALB keeps routing to healthy containers throughout.

---

## Understanding the workflow YAML

### Job dependencies
```yaml
needs: test               # build-push only runs if test passes
needs: build-and-push     # deploy only runs if build-push passes
```

### Image tagging strategy
```yaml
IMAGE_TAG: ${{ github.sha }}   # unique tag per commit
```
Using `git commit SHA` as the tag:
- Immutable — same commit always maps to the same image
- Enables rollback: just deploy the old SHA tag
- Never overwrite — `:latest` is for convenience only, never for rollbacks

### `wait-for-service-stability: true`
The deploy job blocks until ECS reports the service is stable (all new containers healthy). If the new container fails its health check, the deployment fails and the workflow step turns red in GitHub.

---

## Pushing to ECR manually (without CI)

```bash
# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t docker-cicd-app:manual ./app

# Tag with ECR prefix
docker tag docker-cicd-app:manual \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-cicd-app:manual

# Push
docker push \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/docker-cicd-app:manual
```

---

## Deploy to EC2 instead of ECS (alternative)

If you want to deploy to a plain EC2 instance (no ECS), replace Job 3 with:

```yaml
deploy-ec2:
  name: Deploy to EC2
  runs-on: ubuntu-latest
  needs: build-and-push

  steps:
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id:     ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region:            ${{ env.AWS_REGION }}

    - name: SSH deploy to EC2
      uses: appleboy/ssh-action@v1
      with:
        host:     ${{ secrets.EC2_HOST }}          # EC2 public IP
        username: ec2-user
        key:      ${{ secrets.EC2_SSH_KEY }}       # contents of .pem file
        script: |
          # Login to ECR from the EC2 instance
          aws ecr get-login-password --region ${{ env.AWS_REGION }} | \
            docker login --username AWS --password-stdin \
            ${{ secrets.ECR_REGISTRY }}

          # Pull the new image
          docker pull ${{ needs.build-and-push.outputs.image }}

          # Stop and replace the running container
          docker stop api || true
          docker rm api   || true
          docker run -d \
            --name api \
            -p 3000:3000 \
            -e NODE_ENV=production \
            ${{ needs.build-and-push.outputs.image }}
```

EC2 vs ECS for deployments:
- EC2: simpler, full control, but you manage the host, docker, SSH keys
- ECS Fargate: no servers to manage, rolling deploys built-in, scales automatically

---

## Interview questions

**Q: What's the difference between ECR and Docker Hub?**
> ECR is AWS's private container registry — images live in your AWS account, authentication uses IAM (not passwords), and pulling from ECR within AWS is free and fast (no egress costs). Docker Hub is a public registry — great for open-source, but public pulls are rate-limited and images are visible to everyone unless you pay for private repos.

**Q: How do you roll back a bad deploy?**
> Two options: (1) Re-run the GitHub Actions workflow on the previous commit — it builds a new image tagged with the old SHA and deploys it. (2) In ECS console, select the previous task definition revision and update the service to use it. The SHA-tagged images in ECR are never overwritten, so rollback is always possible.

**Q: Why not store secrets in the Dockerfile?**
> Dockerfile layers are cached and visible in `docker history`. Any secret baked in is readable by anyone with access to the image. Secrets must come from environment variables at runtime (ECS task definition env vars, AWS Secrets Manager, or Parameter Store — never baked into the image).

**Q: What happens if the new container fails its health check during deploy?**
> ECS stops the rolling update and leaves the old containers running. The service never goes below the minimum healthy percent. The failed task is logged in CloudWatch. The pipeline step turns red in GitHub Actions. No downtime.

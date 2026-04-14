# Docker + CI/CD Mini Project

Build → Push to AWS ECR → Deploy to ECS with GitHub Actions.

## Project structure

```
docker-cicd-mini-project/
├── app/
│   ├── index.js          Express API (products + health endpoint)
│   ├── package.json
│   ├── Dockerfile        Multi-stage build
│   └── .dockerignore
└── docs/
    ├── 01-containers-vs-ec2.md    Containers vs EC2 comparison
    ├── 02-dockerfile-explained.md  Every Dockerfile line explained
    ├── 03-build-and-run.md         Local Docker commands step by step
    └── 04-cicd-pipeline.md         Full CI/CD setup guide + interview Q&A

.github/
└── workflows/
    └── deploy.yml    CI/CD: test → build → push ECR → deploy ECS
```

## Quick start (local)

```bash
cd docker-cicd-mini-project/app

# Build
docker build -t docker-cicd-app:1.0 .

# Run
docker run -d -p 3000:3000 --name my-api docker-cicd-app:1.0

# Test
curl http://localhost:3000/health
curl http://localhost:3000/api/products
```

## AWS infrastructure setup (one-time, before first deploy)

The CI/CD pipeline deploys to existing AWS resources — create them first.

### 1. Create an ECR repository
```bash
aws ecr create-repository --repository-name docker-cicd-app --region ap-south-1
```

### 2. Create an ECS cluster
- AWS Console → ECS → Clusters → **Create cluster**
- Name: `docker-cicd-cluster`
- Infrastructure: **AWS Fargate**

### 3. Register a task definition
- ECS → Task Definitions → **Create new task definition**
- Family name: `docker-cicd-app`
- Container name: `docker-cicd-app`
- Image URI: `<account-id>.dkr.ecr.ap-south-1.amazonaws.com/docker-cicd-app:latest`
- Port: `3000`
- Copy the full ARN → set as `ECS_TASK_DEF_ARN` variable in GitHub

### 4. Create an ECS service
- Inside `docker-cicd-cluster` → Services → **Create**
- Service name: `docker-cicd-service`
- Launch type: **Fargate**
- Task definition: select `docker-cicd-app` from step 3
- Desired tasks: `1`

### 5. Configure GitHub secrets and variables

**Secrets** (Settings → Secrets and variables → Actions → Secrets):
| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |

**Variables** (Settings → Secrets and variables → Actions → Variables):
| Variable | Example value |
|---|---|
| `AWS_REGION` | `ap-south-1` |
| `ECR_REPOSITORY` | `docker-cicd-app` |
| `ECS_CLUSTER` | `docker-cicd-cluster` |
| `ECS_SERVICE` | `docker-cicd-service` |
| `ECS_TASK_DEF_ARN` | `docker-cicd-app` |
| `CONTAINER_NAME` | `docker-cicd-app` |

---

## CI/CD pipeline (GitHub Actions)

Triggers on push to `main` when files under `docker-cicd-mini-project/app/` change. Three sequential jobs:

1. **test** — smoke test (Node.js)
2. **build-push** — `docker build` → tag with git SHA → push to ECR
3. **deploy-ecs** — update ECS task definition → rolling deploy (zero downtime)

See `docs/04-cicd-pipeline.md` for detailed explanations and interview Q&A.

## Learning path

1. `docs/01-containers-vs-ec2.md` — understand WHY containers
2. `docs/02-dockerfile-explained.md` — understand every line
3. `docs/03-build-and-run.md` — hands-on local Docker
4. `docs/04-cicd-pipeline.md` — CI/CD + AWS setup + interview Q&A

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | API info |
| GET | `/health` | Health check (used by ECS/ALB) |
| GET | `/api/products` | List all products |
| GET | `/api/products/:id` | Get one product |

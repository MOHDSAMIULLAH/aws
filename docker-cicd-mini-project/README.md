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
├── .github/
│   └── workflows/
│       └── deploy.yml    CI/CD: test → build → push ECR → deploy ECS
└── docs/
    ├── 01-containers-vs-ec2.md    Containers vs EC2 comparison
    ├── 02-dockerfile-explained.md  Every Dockerfile line explained
    ├── 03-build-and-run.md         Local Docker commands step by step
    └── 04-cicd-pipeline.md         Full CI/CD setup guide + interview Q&A
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

## CI/CD pipeline (GitHub Actions)

Triggers on push to `main`. Three sequential jobs:

1. **test** — smoke test (Node.js)
2. **build-push** — `docker build` → tag with git SHA → push to ECR
3. **deploy-ecs** — update ECS task definition → rolling deploy (zero downtime)

See `docs/04-cicd-pipeline.md` for full AWS setup steps and GitHub Secrets to configure.

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

# Railway Deployment Guide

## Option A: GitHub deploy
1. Push the repository to GitHub.
2. Create a Railway project.
3. Connect the GitHub repository.
4. Railway will build from the root Dockerfile. Railway supports GitHub repo deployment and Dockerfile builds. citeturn587133search6turn587133search14
5. Add variables in Railway.
6. Use the generated Railway domain for testing or attach a custom domain.

## Option B: Local CLI deploy
Railway supports local development and deployment from the CLI. citeturn587133search13turn587133search16

## Domain setup
- Use a Railway-provided domain for quick testing.
- Add a custom domain when the brand is ready.
- Railway supports automatic SSL for public services. citeturn587133search0turn587133search4

## Environment variables
Railway variables are available during build and runtime, so secrets and configuration can be managed in the Railway dashboard. citeturn587133search1turn587133search5

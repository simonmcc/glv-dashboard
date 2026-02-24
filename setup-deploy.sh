#!/bin/bash
set -e

PROJECT_ID="glv-dashboard"
SA_NAME="github-actions"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_NAME="github"
PROVIDER_NAME="github-actions"
GITHUB_REPO="simonmcc/glv-dashboard"

echo "Setting up deployment for ${PROJECT_ID}..."

# Get project number (needed for WIF)
PROJECT_NUM=$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
echo "Project number: ${PROJECT_NUM}"

# Create service account if it doesn't exist
if gcloud iam service-accounts describe ${SA_EMAIL} --project=${PROJECT_ID} &>/dev/null; then
  echo "Service account ${SA_NAME} already exists"
else
  echo "Creating service account ${SA_NAME}..."
  gcloud iam service-accounts create ${SA_NAME} \
    --display-name="GitHub Actions" \
    --project=${PROJECT_ID}
fi

# Grant permissions (these are idempotent by nature)
echo "Granting IAM permissions..."
for role in "roles/run.admin" "roles/storage.admin" "roles/iam.serviceAccountUser"; do
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="${role}" \
    --condition=None \
    --quiet
done

# Create workload identity pool if it doesn't exist
if gcloud iam workload-identity-pools describe ${POOL_NAME} --location="global" --project=${PROJECT_ID} &>/dev/null; then
  echo "Workload identity pool ${POOL_NAME} already exists"
else
  echo "Creating workload identity pool ${POOL_NAME}..."
  gcloud iam workload-identity-pools create ${POOL_NAME} \
    --location="global" \
    --display-name="GitHub" \
    --project=${PROJECT_ID}
fi

# Create workload identity pool provider if it doesn't exist
if gcloud iam workload-identity-pools providers describe ${PROVIDER_NAME} \
    --location="global" \
    --workload-identity-pool=${POOL_NAME} \
    --project=${PROJECT_ID} &>/dev/null; then
  echo "Workload identity provider ${PROVIDER_NAME} already exists"
else
  echo "Creating workload identity provider ${PROVIDER_NAME}..."
  gcloud iam workload-identity-pools providers create-oidc ${PROVIDER_NAME} \
    --location="global" \
    --workload-identity-pool=${POOL_NAME} \
    --display-name="GitHub Actions" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --project=${PROJECT_ID}
fi

# Allow GitHub repo to impersonate the service account (idempotent)
echo "Granting workload identity user permission..."
gcloud iam service-accounts add-iam-policy-binding ${SA_EMAIL} \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}" \
  --project=${PROJECT_ID} \
  --quiet

# Set GitHub secrets
echo "Setting GitHub secrets..."
WIF_PROVIDER="projects/${PROJECT_NUM}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"

gh secret set WIF_PROVIDER --body "${WIF_PROVIDER}"
gh secret set WIF_SERVICE_ACCOUNT --body "${SA_EMAIL}"

echo ""
echo "Setup complete!"
echo "  WIF_PROVIDER: ${WIF_PROVIDER}"
echo "  WIF_SERVICE_ACCOUNT: ${SA_EMAIL}"

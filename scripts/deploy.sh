#!/usr/bin/env bash
# One-shot deploy: Neon (Postgres) + Vercel. Run from the repo root on YOUR machine
# after `neonctl auth` and `vercel login`. Re-runnable: reuses an existing Neon project.
set -euo pipefail

NAME="${NEON_PROJECT_NAME:-avishkar-vocab-app}"
REGION="${NEON_REGION:-aws-ap-southeast-1}"

command -v neonctl >/dev/null || { echo "Install first: npm i -g neonctl vercel"; exit 1; }
command -v vercel  >/dev/null || { echo "Install first: npm i -g neonctl vercel"; exit 1; }

echo "== Neon project =="
PID="$(neonctl projects list --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const l=j.projects||j;const p=l.find(x=>x.name==='$NAME');console.log(p?p.id:'')})")"
if [ -z "$PID" ]; then
  PID="$(neonctl projects create --name "$NAME" --region-id "$REGION" --output json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log((j.project||j).id)})")"
  echo "created $PID"
else
  echo "reusing $PID"
fi

export DATABASE_URL="$(neonctl connection-string --project-id "$PID" --pooled)"
export DATABASE_URL_UNPOOLED="$(neonctl connection-string --project-id "$PID")"

echo "== Tables + 1,830 words =="
npm run db:migrate
npm run db:seed

echo "== Vercel =="
[ -d .vercel ] || vercel link --yes
read -r -p "Teacher invite code (secret you invent, teachers need it to sign up): " INVITE
for pair in "DATABASE_URL=$DATABASE_URL" "DATABASE_URL_UNPOOLED=$DATABASE_URL_UNPOOLED" "TEACHER_INVITE_CODE=$INVITE"; do
  k="${pair%%=*}"; v="${pair#*=}"
  vercel env rm "$k" production --yes >/dev/null 2>&1 || true
  printf '%s' "$v" | vercel env add "$k" production >/dev/null
done

echo "== Deploying =="
vercel --prod
echo
echo "Done. Open <your-url>/api/health  (expect db: ok, words: 1830)"

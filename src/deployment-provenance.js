// This is a deliberately invalid development sentinel.
// scripts/build-public-studio.sh replaces it with the exact 40-character
// source revision before Wrangler packages the Worker.
export const WORKER_SOURCE_GIT_SHA='UNBUILT';

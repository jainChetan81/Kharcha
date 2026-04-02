#!/bin/bash
# Release script: auto-tag current version from app.json

set -e

# Extract version from app.json
VERSION=$(grep '"version"' app.json | head -1 | sed -E 's/.*"version": "([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
  echo "❌ Could not extract version from app.json"
  exit 1
fi

TAG="v$VERSION"

echo "📦 Releasing version: $VERSION"
echo "🏷️  Tag: $TAG"

# Check if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists!"
  exit 1
fi

# Create and push tag
echo "🔖 Creating git tag..."
git tag "$TAG"

echo "📤 Pushing tag..."
git push origin "$TAG"

echo "✅ Released $TAG!"
echo ""
echo "Next steps:"
echo "  1. Manually trigger ios-build.yml or android-build.yml in GitHub Actions"
echo "  2. Or run: git push origin main"

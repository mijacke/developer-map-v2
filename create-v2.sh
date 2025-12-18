#!/bin/bash

# Script to create developer-map-v2 with fresh git history

echo "🚀 Creating developer-map-v2..."

# Copy the entire project
cp -R /Users/mariolassu/code/jarwizz/developer-map /Users/mariolassu/code/jarwizz/developer-map-v2

echo "✅ Project copied to developer-map-v2"

# Navigate to new project
cd /Users/mariolassu/code/jarwizz/developer-map-v2

# Remove old git history
rm -rf .git

echo "✅ Old git history removed"

# Initialize new git repository
git init

echo "✅ New git repository initialized"

# Add all files
git add .

echo "✅ All files staged"

# Create initial commit
git commit -m "Initial commit - base version from developer-map"

echo "✅ Initial commit created"

echo ""
echo "🎉 Done! Your new project is ready at:"
echo "   /Users/mariolassu/code/jarwizz/developer-map-v2"
echo ""
echo "Next steps:"
echo "1. Open the new project in your editor"
echo "2. Create a new GitHub repository"
echo "3. Link it: git remote add origin <your-new-repo-url>"
echo "4. Push it: git push -u origin main"

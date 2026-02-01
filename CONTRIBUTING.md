# Contributing to ByteCode

First off, thank you for considering contributing to ByteCode! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features](#suggesting-features)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)

## 📜 Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to:

- Be respectful and inclusive
- Use welcoming and friendly language
- Accept constructive criticism gracefully
- Focus on what's best for the community

## 🤝 How Can I Contribute?

### 🐛 Reporting Bugs

Before creating a bug report, please check existing issues to avoid duplicates.

When reporting a bug, include:

1. **Clear title** - A descriptive title for the issue
2. **Steps to reproduce** - How to trigger the bug
3. **Expected behavior** - What you expected to happen
4. **Actual behavior** - What actually happened
5. **Screenshots** - If applicable
6. **Environment** - OS, ByteCode version, Node.js version

**Bug Report Template:**

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:

1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**

- OS: [e.g., Windows 11]
- ByteCode Version: [e.g., 0.0.2]
- Node.js Version: [e.g., 18.0.0]
```

### 💡 Suggesting Features

We love new ideas! When suggesting a feature:

1. Check if it's already been suggested
2. Provide a clear use case
3. Explain the expected behavior
4. Consider potential drawbacks

**Feature Request Template:**

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Any alternative solutions you've considered.

**Additional context**
Any other information or screenshots.
```

### 🔧 Pull Requests

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** for your changes: `git checkout -b feature/my-new-feature`
4. **Make your changes** and test them
5. **Commit** your changes with a descriptive message
6. **Push** to your fork: `git push origin feature/my-new-feature`
7. **Open a Pull Request** against the `main` branch

#### Pull Request Guidelines

- Follow the existing code style
- Update documentation if needed
- Add tests for new features
- Keep changes focused and atomic
- Reference any related issues

## 🛠️ Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)
- A code editor (we recommend ByteCode 😉 or VS Code)

### Installation

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/ByteCode.git
cd ByteCode

# Install dependencies
npm install

# Run in development mode
npm start
```

### Building

```bash
# Build for production
npm run dist

# Create installer
npm run make
```

## 📁 Project Structure

```
ByteCode/
├── assets/              # Icons and images
│   └── icons/          # File type icons
├── extensions/          # Extension system
├── src/
│   ├── main.js         # Electron main process
│   ├── renderer.js     # Main renderer logic
│   ├── ai.js           # AI integration
│   ├── terminal.js     # Terminal functionality
│   ├── contextmenu.js  # Context menu handling
│   └── extensions.js   # Extension manager
├── website/            # Project website
├── index.html          # Main application UI
├── translations.json   # i18n translations
└── package.json        # Project configuration
```

## 🎨 Style Guidelines

### JavaScript

- Use ES6+ features
- Use `const` for constants, `let` for variables
- Use template literals for string interpolation
- Add comments for complex logic
- Use meaningful variable and function names

```javascript
// ✅ Good
const getUserById = async (userId) => {
  const user = await database.findUser(userId);
  return user;
};

// ❌ Bad
async function f(x) {
  var u = await database.findUser(x);
  return u;
}
```

### CSS

- Use CSS variables for colors and repeated values
- Follow BEM naming convention when applicable
- Keep specificity low
- Mobile-first approach for responsive design

```css
/* ✅ Good */
.sidebar-item {
  background: var(--bg-card);
  padding: 8px 12px;
}

.sidebar-item:hover {
  background: var(--bg-light);
}
```

### HTML

- Use semantic HTML elements
- Include accessibility attributes
- Keep classes meaningful and descriptive

## 📝 Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(ai): add support for Claude 3.5 Sonnet

fix(editor): resolve cursor jumping issue on save

docs(readme): update installation instructions

style(css): improve button hover animations
```

## 🌍 Translations

We welcome translations! To add a new language:

1. Open `translations.json`
2. Copy the `"en"` section
3. Translate all values to your language
4. Add your language code as a new key
5. Submit a PR

## ❓ Questions?

Feel free to:

- Open a [GitHub Discussion](https://github.com/ByteCode-Team/ByteCode/discussions)
- Check existing [Issues](https://github.com/ByteCode-Team/ByteCode/issues)

---

Thank you for helping make ByteCode better! 🚀

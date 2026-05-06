# 🤖 Desktop Agent Center — The Unified Gateway for Local AI Automation

**Desktop Agent Center** is a *personal AI assistant tool* you run on your own devices.
It monitors your clipboard and uses global hotkeys to automatically send content to mainstream AI tools. The Gateway handles the automation—the product is the seamless intelligence.

If you want a personal, single-user assistant that feels local, fast, and works without the burden of expensive API costs, this is it.

Supported providers include: **ChatGPT, Gemini, and Perplexity (PPLX).**

## Install

Runtime: **Node 20+**.

### 1. Prerequisites (C++ Build Tools)

Since this project uses `uiohook-napi` for global hotkeys, your system needs:

- **Windows:** Visual Studio Build Tools (with "Desktop development with C++").
- **macOS:** Xcode Command Line Tools.
- **Linux:** `build-essential`, `libx11-dev`, etc.

### 2. Setup

```
git clone https://github.com/WellWells/desktop-agent-center.git
cd desktop-agent-center

npm install
npm run dev
```

## Quick start (TL;DR)

1. **First Launch**: Run `npm run dev`. A browser window will open automatically.
2. **Login (Optional)**: Log into your preferred AI accounts (ChatGPT / Gemini / PPLX) if required by the provider or to save history.
3. **Run in Background**: In **Settings → General → System Tray**, enable hide-to-tray behavior so the app keeps running after closing the window.
4. **The Workflow**:
    - **Select Text**: Highlight any text on your computer.
    - **Press Hotkey**: Press `Alt+G` (default).
    - **Result**: Content is sent to the provider, analyzed, and the result is written back to your clipboard and auto-saved.

## ✨ Highlights

- **Local-first Core** — All hotkey processing and automation flows are executed locally.
- **Seamless Clipboard** — Automatic reading and writing back for a frictionless experience.
- **Multi-Provider Integration** — One-click access to ChatGPT, Gemini, and Perplexity.
- **No API Keys** — Zero API costs. Ready to use out of the box with your existing accounts.
- **Auto-save** — Responses saved as Markdown or JSON with precise timestamps.
- **Telegram Bridge** — Talk to your desktop AI assistant via Telegram. Supports WebP/PDF exports.
- **Modern UI** — Powered by Electron, React, and Tailwind CSS.

## 🔒 Security & Privacy

- **Third-party Providers**: Your queries are processed by providers like **ChatGPT, Gemini, or Perplexity**. Their respective privacy policies apply to the data they receive. The author does not control these platforms.
- **Local Execution**: The gateway runs on your host. Your data is sent directly to the AI providers you choose; no other third-party servers are involved.
- **No Tracking**: No user telemetry, data collection, or tracking scripts are included.
- **Transparency**: All automation logic is open-source and available for audit in the `src/main/` directory.

## Operator quick refs

- **Global Hotkey**: `Alt+G` (Customizable in **Settings → General**)
- **Telegram Commands**: `/gpt <prompt>`, `/gemini <prompt>`, `/pplx <prompt>`, `/status`
- **Output Path**: `outputs/` folder in the project root.

## 🛠️ From source (development)

We welcome the community to **Star**, **Fork**, or open **Issues** for bug reports and feature suggestions!

```
# Type checking
npm run typecheck

# Build Windows Portable executable
npm run build
```

## 📜 License

This project is licensed under the **MIT License**.

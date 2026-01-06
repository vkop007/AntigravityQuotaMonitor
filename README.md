# Antigravity Quota Monitor

Monitor your Antigravity AI quotas directly in VS Code. Never lose track of your model usage again.

<p align="center">
  <img src="icon.png" width="128" alt="Antigravity Quota Monitor" />
</p>

## Features

- **Real-time Quota Tracking**: Instant visibility into your usage for multiple AI models including Gemini, Claude, and GPT.
- **Visual Dashboard**: A clean, premium dashboard that shows usage percentages, token counts, and estimated time remaining.
- **Status Bar Integration**: Quickly check your most important quotas without leaving your code.
- **Automatic Discovery**: Automatically finds your Antigravity API endpoint or allows for manual configuration.

## Installation

1. Install the extension from the VS Code Marketplace.
2. The extension will automatically try to detect your Antigravity environment.
3. Use the command `Show Antigravity Quota` to open the monitor.

## Configuration

You can customize the extension via the following settings:

- `antigravity.apiEndpoint`: The URL of your Antigravity API (e.g., `http://localhost:3000/api/quota`).
- `antigravity.authToken`: Your authentication token if required.

## Usage

1. Open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`).
2. Run command: `Show Antigravity Quota`.
3. The monitor will open in a webview, showing your current usage status across all tracked models.

## Support

For issues or feature requests, please visit the [GitHub repository](https://github.com/vkop007/antigravity-quota-monitor).

---

Built with ❤️ by the VK.

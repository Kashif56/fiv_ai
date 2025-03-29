# AI Chat Assistant for Fiverr

A Chrome extension that helps freelancers on Fiverr by providing AI-generated message summaries and reply suggestions.

## Features

- **Message Tracking**: Automatically detects and tracks messages in Fiverr chat windows
- **Message Simplification**: Uses OpenAI GPT-4o to simplify complex client messages into clear, easy-to-understand English
- **Reply Suggestions**: Generates three different professional reply options for each client message
- **Floating Assistant**: Provides a draggable, non-intrusive UI that integrates with Fiverr's chat interface
- **Chat History**: Stores and organizes your chat history locally and allows you to review past conversations
- **Export Feature**: Export your chat history as JSON for backup or analysis

## Installation

### Development Mode

1. Clone this repository or download it as a ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" at the top right
4. Click "Load unpacked" and select the extension directory
5. The extension should now be installed and visible in your Chrome toolbar

### From Chrome Web Store

*(Coming soon)*

## Setup

1. Click on the extension icon in your Chrome toolbar to open the popup
2. Enter your OpenAI API key in the settings section
3. Make sure "Enable AI Features" is checked
4. Click "Save Settings"

## How to Use

1. Navigate to any Fiverr chat page
2. The floating assistant will appear automatically in the bottom right corner
3. When you receive a new message, the assistant will show:
   - A simplified version of the message
   - Three suggested reply options
   - A text area where you can edit the selected reply
4. Click on any suggested reply to select it for editing
5. Use the "Copy to Clipboard" button to copy your chosen reply
6. Paste the reply into Fiverr's chat box and send

## Chat History

To view your complete chat history:
1. Click on the extension icon in your Chrome toolbar
2. Click "View Full Chat History"
3. From the history page, you can:
   - Review past conversations
   - Clear your chat history
   - Export your chat history as a JSON file

## Privacy

This extension:
- Stores all data locally in your browser using Chrome Storage API
- Sends message content to OpenAI's API for processing
- Does not store your conversations on any external servers
- Requires an OpenAI API key which is stored securely in Chrome's synced storage

## Technologies Used

- JavaScript
- HTML & CSS
- Chrome Extensions API (Manifest V3)
- Chrome Storage API
- OpenAI GPT-4o API

## Future Plans

- Support for additional freelancing platforms (Upwork, Freelancer, etc.)
- Cloud-based storage using Django + PostgreSQL
- Personalized AI response tone settings
- More customization options

## License

MIT License

## Credits

Developed by [Your Name/Company] 
# Changelog

All notable changes to the AI Chat Assistant for Fiverr will be documented in this file.

## [Unreleased]

### Added
- Added conversation context to message simplification, allowing for more accurate simplifications based on conversation history
- Both message simplification and reply options now use up to 10 messages of conversation history as context
- Added search functionality to chat history page
- Added export button for chat history
- Added robust error handling for extension context invalidation
- Added isExtensionContextValid() function to prevent errors when extension is reloaded

### Changed
- Improved message simplification prompt to focus on explaining what the client is saying and what they want the freelancer to do
- Enhanced reply options prompt to generate more casual, friendly, and impactful messages that are short but effective
- Updated system prompts to provide more specific guidance to the AI
- Completely redesigned chat history UI to match Fiverr's design system, including fonts, colors and styling
- Added Font Awesome icons for improved visual experience
- Improved empty states and visual hierarchy
- Made all Chrome API calls more robust with try/catch blocks and error handling

### Fixed
- Fixed "ReferenceError: contextString is not defined" bug in the background script
- Standardized token limits for consistency between different API calls
- Fixed "Extension context invalidated" errors by adding proper error handling
- Added graceful degradation when extension context is lost
- Improved error messaging to guide users when extension errors occur

## [1.0.0] - Initial Release

### Features
- Message tracking in Fiverr chat windows
- Message simplification using OpenAI GPT-4o
- Reply suggestions with three different professional options
- Floating, draggable assistant UI
- Chat history storage and review
- Export feature for chat history 
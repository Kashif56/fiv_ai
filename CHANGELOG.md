# Changelog

All notable changes to the AI Chat Assistant for Fiverr will be documented in this file.

## [Unreleased]

### Added
- Added conversation context to message simplification, allowing for more accurate simplifications based on conversation history
- Both message simplification and reply options now use up to 10 messages of conversation history as context

### Changed
- Improved message simplification prompt to focus on explaining what the client is saying and what they want the freelancer to do
- Enhanced reply options prompt to generate more casual, friendly, and impactful messages that are short but effective
- Updated system prompts to provide more specific guidance to the AI

### Fixed
- Fixed "ReferenceError: contextString is not defined" bug in the background script
- Standardized token limits for consistency between different API calls

## [1.0.0] - Initial Release

### Features
- Message tracking in Fiverr chat windows
- Message simplification using OpenAI GPT-4o
- Reply suggestions with three different professional options
- Floating, draggable assistant UI
- Chat history storage and review
- Export feature for chat history 
# ChatGPT for VS Code
An extension that integrates GPT models right into your code editor.

Based on [Autonimate](https://github.com/Cytranics/autonimate-vscode-ext), but completely rewritten for code clarity and to integrate OpenAI's functions feature. 

**Features**
 - **Functions API**: Allows other extensions to provide functions for the GPT model to take advantage of. This could be used to enable codebase indexing or other automations.
 - **Mixins and analyzers**: Allows other extensions to analyze user messages before they are sent and prefix them with system messages as well as modify the main system prompt with custom instructions. This can be used to instruct the model on the use of custom extension-defined features.
 - **Quick access commands**: Pre-defined prompts for quick actions
 - **Customizable system / command prompts**: You can customize each prompt in the extension settings.
 - **Wide model selection**: Multiple variants of both GPT-3.5 and GPT-4 models are available.
 - **OpenAI and Azure authentication**: You can choose the auth provider to use during your chat sessions.

While this extension is unlikely to break as long as OpenAI doesn't go under the bus, it's unlikely that this extension will receive any updates other than minir bug fixes.

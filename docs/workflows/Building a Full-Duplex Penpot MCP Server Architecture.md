Here is a step-by-step walkthrough to build a **Full-Duplex Penpot MCP Server**. This guide implements the "Sidecar Architecture" required for real-time bidirectional communication and enforces the "Inspector → Architect → Builder" agentic flow to prevent design hallucinations.

### Phase 1: The Architecture (Sidecar Pattern)

To achieve **Full-Duplex** communication (where the AI "sees" your selection instantly), you cannot just call the REST API. You must build two connected components:

1. **Local MCP Server:** Runs on your machine, talks to the LLM (Claude/Cursor).  
2. **Penpot Plugin:** Runs in the browser, talks to the Penpot Canvas API.  
3. **WebSocket Bridge:** Connects the two.

**Recommended Stack:** TypeScript MCP SDK (Node.js) 1-3.

### Phase 2: Project Setup

Do not start from zero. The official Penpot MCP repository implements the complex WebSocket handshake required for this.

1. **Clone the Base:**Start with the official repository structure which already separates mcp-server and penpot-plugin 4, 5\.  
2. git clone https://github.com/penpot/penpot-mcp  
3. cd penpot-mcp  
4. npm install  
5. **Define the Shared Types:**In common/src/types.ts, define the schema the AI will use. This is critical for preventing hallucinations. The AI must strictly output data matching this structure 6\.  
6. // Enforce Flex Layouts to solve layout hallucinations  
7. export interface FlexLayout {  
8.   type: 'flex';  
9.   direction: 'row' | 'column';  
10.   gap: string; // Enforce token usage (e.g., "{spacing.md}")  
11.   padding: string;  
12.   alignItems: 'start' | 'center' | 'end';  
13. }

### Phase 3: The Plugin ("The Eyes and Hands")

Modify penpot-plugin/src/plugin.ts. This runs inside the browser.  
**1\. Implement the "Inspector" (Read State):**Listen for selection changes and push the "Truth" to the server immediately. This prevents the AI from guessing what you selected 7, 8\.  
// Detect when user clicks a shape  
penpot.on('selectionchange', () \=\> {  
  const selection \= penpot.selection;  
  if (selection.length \> 0\) {  
    // Extract strictly validated properties  
    const tree \= get\_object\_tree(selection);   
    // Send to Local Server via WebSocket  
    socket.send(JSON.stringify({   
      type: 'selection\_update',   
      payload: tree   
    }));   
  }  
});  
**2\. Implement the "Builder" (Execute State):**Listen for commands from the Local Server to modify the design 9\.  
penpot.ui.onMessage((msg) \=\> {  
  if (msg.type \=== 'create\_flex\_component') {  
    const board \= penpot.createBoard();  
    board.name \= msg.name;  
    board.addFlexLayout(); // Enforce Flexbox immediately \[10\]  
    // Apply semantic tokens, not raw hex  
    if (msg.tokenFill) {  
       // Logic to find token ID by name and apply  
    }  
  }  
});

### Phase 4: The MCP Server ("The Brain")

Modify mcp-server/src/index.ts. This connects to your AI Client (Claude/Cursor).  
**1\. Define the Resources (Context):**Expose the selection and design tokens as read-only resources. This forces the **Inspector Agent** to read before acting 11\.  
server.resource(  
  "penpot://selection",   
  "The currently selected node in Penpot. READ THIS FIRST.",  
  async (uri) \=\> {  
    // Return the cached JSON received via WebSocket from the plugin  
    return {  
      contents: \[{  
        uri: uri.href,  
        text: JSON.stringify(lastSelectionState)  
      }\]  
    };  
  }  
);

server.resource(  
  "penpot://tokens",  
  "The Design System Truth. Use these IDs, never hex codes.",  
  async () \=\> { /\* Return list of color/typography tokens \*/ }  
);  
**2\. Define the Tools (Action):**Create "Semantic Tools" that prevent hallucinated layouts. Do not make a generic create\_rect tool. Make tools that enforce structure 10, 12\.  
server.tool(  
  "create\_semantic\_card",  
  "Creates a card using Auto-Layout. Requires Token IDs.",  
  {  
    title: z.string(),  
    layout: z.enum(\["row", "column"\]),  
    backgroundToken: z.string().describe("Must be a token ID from penpot://tokens")  
  },  
  async ({ title, layout, backgroundToken }) \=\> {  
    // Send command to Plugin via WebSocket  
    pluginConnection.send({  
      command: "build\_component",  
      data: { title, layout, backgroundToken }  
    });  
    return { content: \[{ type: "text", text: "Card created." }\] };  
  }  
);

### Phase 5: The Agentic Workflow (The Prompts)

You must create a **System Prompt** within your MCP configuration (or custom prompt tool) to enforce the behavior of the four agents 13, 14\.  
**Add this to your prompts/list capability:**  
**Prompt Name:** design-architect  
**Instruction:**

1. **Inspector Step:** Call penpot://selection. Do not guess properties. If the selection is empty, stop and ask the user to select a frame.  
2. **Architect Step:** Analyze the JSON. If you see raw hex codes (e.g., \#FF0000), search penpot://tokens. You MUST swap the hex code for the matching Token ID (e.g., uuid-1234).  
3. **Builder Step:** Do not use groups. Use create\_semantic\_card or create\_flex\_container.  
4. **Auditor Step:** After tool execution, read the new selection. Confirm layout is not null.

### Phase 6: Running & Connecting

**1\. Handle Browser Security (PNA):**Modern browsers (Chrome/Brave) block websites (design.penpot.app) from talking to localhost.

* **Solution A:** Use Firefox (easiest) 15\.  
* **Solution B:** Run your server behind a reverse proxy (like Traefik or Caddy) with HTTPS enabled so the browser sees it as secure 16, 17\.

**2\. Start the Servers:**  
\# In your terminal  
npm run bootstrap \# Starts both MCP server (4401) and Plugin server (4400)  
**3\. Load into Penpot:**

* Go to Penpot \> Menu \> Plugins \> Load Local Plugin.  
* Enter http://localhost:4400/manifest.json.  
* **Crucial:** Keep the plugin window OPEN. If you close it, the WebSocket disconnects 18\.

**4\. Connect AI Client:**

* **Claude Desktop:** Edit config to point to your local server 19\.  
* **Cursor:** Add the MCP server in settings 20\.

**Usage:**Now, select a frame in Penpot and tell Claude: *"Refactor this card to use our primary color token and fix the padding."*The Agent will:

1. **Read** your selection via WebSocket.  
2. **Find** the "primary color" token ID from the resource.  
3. **Execute** the update via the plugin API 21, 22\.


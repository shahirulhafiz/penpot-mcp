To create a custom Penpot MCP server that solves design "hallucinations" (incorrect hierarchy, made-up styles, or broken layouts) using a full-duplex agentic workflow, you must implement a specific architectural pattern known as **Semantic Mapping**.  
Unlike standard API integrations, a "Full-Duplex" MCP server requires a real-time bridge (usually via WebSockets) between the AI agent and the Penpot canvas to allow the AI to "see" the user's selection and "act" on it instantly 1, 2\.  
Here is the design for your Agentic MCP flow, encompassing architecture, agent roles, and code references.

### 1\. The Architecture: Full-Duplex Implementation

To achieve bidirectional communication where the AI reacts to your selection and updates the design in real-time, you cannot rely solely on the REST API. You must replicate the "Sidecar" architecture used by the official Penpot MCP 1, 3\.

* **The Component:** A **Penpot Plugin** running in the browser (inside the Penpot UI).  
* **The Bridge:** A **WebSocket Server** running locally on your machine.  
* **The Intelligence:** The **MCP Server** that connects to your LLM (Claude/Cursor) and talks to the WebSocket Server.

**Data Flow:**

1. **User Action:** You select a frame in Penpot.  
2. **Plugin (Browser):** Detects selectionchange event and sends the JSON tree of the selection via WebSocket to your local server 4\.  
3. **MCP Resource:** Your server updates the penpot://selection resource.  
4. **AI Agent:** Reads the resource to understand the context immediately.

### 2\. The Agentic Flow: Solving Hallucination

To prevent hallucinations, you must strictly separate "Reading" from "Reasoning" and "Writing." Do not let one LLM call do everything. Use a **Chain of Command** with four distinct agents (or steps) 5, 6\.

#### Agent 1: The Inspector (Truth Extraction)

**Goal:** Eliminate visual guessing. The AI must not "look" at a screenshot and guess; it must read the DOM data.

* **Action:** Calls get\_object\_tree or reads the penpot://selection resource 5, 7\.  
* **Hallucination Fix:** Instead of guessing "Title is 20px," it extracts fontSize: "20px" and fontFamily: "Inter" directly from the node data 8\.  
* **Output:** A raw JSON description of the reference object.

#### Agent 2: The Architect (Semantic Mapping)

**Goal:** Solve hierarchy and consistency issues.

* **Action:** Compares the Inspector's raw data against your **Design System** (Design Tokens and Components).  
* **Hallucination Fix:**  
* **Hierarchy:** If the reference has a background and text, the Architect enforces a **Frame** (Flex container) parent, not a "Group" 9, 10\.  
* **Tokens:** If the Inspector finds \#4476F6, the Architect *must* replace it with the token ID {color.primary} found in the penpot://tokens resource 11, 12\.  
* **Components:** It checks list\_components. If the shape matches a known "Button," it instructs the Builder to instantiate\_component rather than drawing a rectangle 13\.

#### Agent 3: The Builder (Execution)

**Goal:** Construct the design using "Design as Code" principles.

* **Action:** Executes the MCP tools.  
* **Rule:** It uses **Flex Layout** properties (gap, padding, alignItems) rather than absolute X/Y positioning. This ensures the layout doesn't break (hallucinate) when content changes 10, 14\.  
* **Code Reference:** It calls update\_shape with a specific payload structure that includes layout rules 15, 16\.

#### Agent 4: The Auditor (Verification)

**Goal:** Self-correction loop.

* **Action:** It reads the newly created object and compares it to the Architect's plan.  
* **Hallucination Fix:** It checks for "Orphaned Styles" (hex codes that aren't tokens) and "Ghost Layers" (invisible bounding boxes) and removes them using delete\_shape or apply\_token 15, 17\.

### 3\. Technical Reference: Design & Code

#### A. JSON Schema for "The Inspector"

When your Inspector Agent reads a shape, force it to populate this schema. This prevents it from hallucinating properties that don't exist in Penpot 18, 19\.  
// Penpot Layer Schema for AI  
{  
  "type": "board" | "text" | "path" | "image",  
  "layout": {  
    "type": "flex", // Crucial for hierarchy  
    "dir": "row" | "column",  
    "gap": 16,  
    "align": "center",  
    "justify": "space-between"  
  },  
  "style": {  
    "fill": \["{color.surface.primary}"\], // Enforce Token Syntax  
    "stroke": \[\],  
    "radius": "{radius.md}"  
  },  
  "children": \[\] // Recursive structure  
}

#### B. Tool Definitions (Python SDK)

You need to implement these specific tools using the Python SDK (fastmcp) to enable the agents described above 20, 21\.  
**1\. The "Read" Tool (Full-Duplex)**This tool fetches the current state from the WebSocket bridge.  
from mcp.server.fastmcp import FastMCP

mcp \= FastMCP("MyPenpotAgent")

@mcp.resource("penpot://selection")  
def get\_selection() \-\> str:  
    """Returns the JSON tree of the currently selected objects in Penpot.  
    Use this to understand the 'Truth' of the design before generating."""  
    \# Logic to fetch data from the WebSocket plugin connection  
    return websocket\_bridge.get\_current\_selection()   
*Source: 61, 73*  
**2\. The "Structure" Tool (Solving Layout)**Force the AI to use this tool for containers instead of generic groups.  
@mcp.tool()  
def create\_flex\_container(name: str, direction: str, gap: int, padding: int) \-\> str:  
    """Creates a Board with Auto-Layout (Flex) enabled.   
    ALWAYS use this for creating UI cards, buttons, or lists."""  
      
    \# Maps to Penpot API: createBoard() \-\> addFlexLayout()  
    return penpot\_api.create\_board(  
        name=name,  
        layout={  
            "type": "flex",   
            "direction": direction,   
            "gap": gap,   
            "padding": padding  
        }  
    )  
*Source: 23, 43*  
**3\. The "Semantic" Tool (Solving Styles)**This tool prevents the AI from using raw hex codes.  
@mcp.tool()  
def apply\_token(shape\_id: str, property: str, token\_name: str) \-\> str:  
    """Applies a Design Token to a shape.  
    Args:  
        property: 'fill', 'stroke', or 'typography'  
        token\_name: The semantic name (e.g., 'color.brand.primary')  
    """  
    \# Logic to lookup UUID from token\_name and apply it via API  
    token\_id \= token\_registry.find(token\_name)  
    return penpot\_api.update\_shape(shape\_id, {property: token\_id})  
*Source: 31, 38*

### 4\. The Agentic Prompt (System Instruction)

Paste this into your MCP Client (e.g., Claude Desktop) to initialize the flow 6, 22:  
**System Role:** You are a Penpot Design System Architect using a Full-Duplex connection.  
**Protocol:**

1. **INSPECT:** When asked to replicate or design, first read the penpot://selection resource. Do not infer visual properties; extract the exact JSON structure.  
2. **MAP:** Identify if the selection uses raw values. If you see \#FFFFFF, search the penpot://tokens resource. If you find a match (e.g., surface.primary), you MUST use the Token ID, not the hex code.  
3. **STRUCTURE:** Never use "Group." You must use the create\_flex\_container tool. Follow the "Painter's Algorithm": create the container, apply layout rules (Gap/Padding), then insert children.  
4. **VALIDATE:** After generation, read the new object's tree. If any layout property is null, delete and retry using a Flex container.

### Summary of Implementation Steps

1. **Install the official Penpot MCP** (or fork it) to get the WebSocket plugin running for bidirectional communication 1\.  
2. **Define the Resources:** Expose penpot://tokens and penpot://selection so the AI has context 23\.  
3. **Define the Tools:** Create tools that enforce Flex Layouts (addFlexLayout) and Component Instantiation (instantiate\_component) to solve hierarchy hallucinations 10, 13\.  
4. **Run the Agent:** Use the prompt above to force the AI to "Read \-\> Map \-\> Build \-\> Audit" 6\.

